import type { VercelRequest } from '@vercel/node'
import type { TLSSocket } from 'node:tls'
import { createHmac, timingSafeEqual } from 'node:crypto'

export type MiniAppUser = {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
}
export type SessionUser = { id: number; first_name: string; last_name?: string; username?: string; photo_url?: string }
type SessionPayload = { user: SessionUser; exp: number }

/** Session lifetime for browser (Login Widget) cookies. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60
/** Mini App initData freshness window. */
export const INIT_DATA_TTL_SECONDS = 60 * 60 * 24
export const SESSION_COOKIE_NAME = 'ttogrm_session'

function safeEqual(a: Buffer, b: Buffer) {
  return a.length === b.length && timingSafeEqual(a, b)
}

function hexToBuffer(value: string): Buffer | null {
  if (!/^[a-f0-9]{64}$/i.test(value)) return null
  return Buffer.from(value, 'hex')
}

/**
 * Verify raw Telegram Mini App initData using the documented WebAppData HMAC
 * procedure. Returns the verified user on success, null on any failure
 * (bad signature, stale auth_date, malformed user).
 */
export function verifyMiniAppInitData(raw: string, botToken: string): MiniAppUser | null {
  if (!raw || !botToken) return null
  const params = new URLSearchParams(raw)
  const receivedHash = params.get('hash') || ''
  params.delete('hash')
  const checkString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const expected = createHmac('sha256', secret).update(checkString).digest()
  const received = hexToBuffer(receivedHash)
  if (!received || !safeEqual(received, expected)) return null
  const authDate = Number(params.get('auth_date'))
  const now = Math.floor(Date.now() / 1000)
  if (!Number.isSafeInteger(authDate) || authDate > now + 30 || now - authDate > INIT_DATA_TTL_SECONDS) return null
  try {
    const rawUser = params.get('user')
    const miniUser = rawUser ? (JSON.parse(rawUser) as MiniAppUser & { id?: number; first_name?: string }) : null
    if (miniUser && Number.isSafeInteger(miniUser.id) && (miniUser.id || 0) > 0 && typeof miniUser.first_name === 'string') {
      // Return the verified Telegram profile fields the UI displays (username,
      // photo). They come from the signed initData payload, so they are as
      // trustworthy as the id itself.
      return {
        id: miniUser.id as number,
        first_name: miniUser.first_name,
        ...(typeof miniUser.last_name === 'string' ? { last_name: miniUser.last_name } : {}),
        ...(typeof miniUser.username === 'string' ? { username: miniUser.username } : {}),
        ...(typeof miniUser.photo_url === 'string' ? { photo_url: miniUser.photo_url } : {}),
      }
    }
  } catch {
    return null
  }
  return null
}

/** Verify the signed browser session cookie. Returns the user or null. */
export function verifySessionCookie(cookieHeader: string | undefined, botToken: string): SessionUser | null {
  if (!cookieHeader || !botToken) return null
  const cookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
  const value = cookie?.slice(SESSION_COOKIE_NAME.length + 1)
  if (!value) return null
  const separator = value.lastIndexOf('.')
  if (separator < 1) return null
  const payload = value.slice(0, separator)
  const received = hexToBuffer(value.slice(separator + 1))
  if (!received) return null
  const expected = createHmac('sha256', botToken).update(payload).digest()
  if (!safeEqual(received, expected)) return null
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionPayload
    if (
      !session.user ||
      !Number.isSafeInteger(session.user.id) ||
      (session.user.id || 0) <= 0 ||
      typeof session.user.first_name !== 'string' ||
      !Number.isSafeInteger(session.exp) ||
      session.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null
    }
    return session.user
  } catch {
    return null
  }
}

/**
 * Resolve the verified Telegram user for an inventory request, preferring
 * freshly validated Mini App initData over the browser session cookie.
 */
export function sessionUser(req: VercelRequest): SessionUser | null {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return null
  const initData = typeof req.headers['x-telegram-init-data'] === 'string' ? req.headers['x-telegram-init-data'] : ''
  if (initData) return verifyMiniAppInitData(initData, token)
  return verifySessionCookie(req.headers.cookie, token)
}

/** Build a signed session cookie value for the given user. */
export function buildSessionValue(user: SessionUser, botToken: string): { value: string; maxAge: number } {
  if (!Number.isSafeInteger(user.id) || (user.id || 0) <= 0 || typeof user.first_name !== 'string') {
    throw new Error('Invalid session user')
  }
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  const payload = Buffer.from(JSON.stringify({ user, exp })).toString('base64url')
  const signature = createHmac('sha256', botToken).update(payload).digest('hex')
  return { value: `${payload}.${signature}`, maxAge: SESSION_TTL_SECONDS }
}

/** Whether the request authenticated with a cookie (vs fresh Mini App initData). */
export function usedSessionCookie(req: VercelRequest): boolean {
  return !(typeof req.headers['x-telegram-init-data'] === 'string' && req.headers['x-telegram-init-data'])
}

/**
 * Lightweight CSRF guard for cookie-authenticated writes. Same-origin fetch
 * calls send no Origin on GET but send Origin/Referer on POST/PUT/DELETE in
 * browsers; a cross-site form or fetch with simple content types sends the
 * victim's Origin instead. Requests carrying initData are exempt because the
 * HMAC itself is the unforgeable credential.
 */
export function isAllowedWriteRequest(req: VercelRequest): boolean {
  if (!usedSessionCookie(req)) return true
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase()
  const origin = String(req.headers.origin || '').trim()
  const referer = String(req.headers.referer || '').trim()
  if (!origin && !referer) return true // non-browser caller (curl, SSR): SameSite=Lax still applies in browsers
  const originHost = origin ? hostOf(origin) : ''
  const refererHost = !origin && referer ? hostOf(referer) : ''
  const caller = originHost || refererHost
  return !!host && caller === host
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase()
  } catch {
    return ''
  }
}

/** Whether the current request arrived over HTTPS (directly or via proxy). */
export function isSecureRequest(req: VercelRequest): boolean {
  const forwarded = req.headers['x-forwarded-proto']
  const proto = Array.isArray(forwarded) ? forwarded[0] : forwarded
  const socket = req.socket as TLSSocket | undefined
  return (proto || '').split(',')[0].trim() === 'https' || socket?.encrypted === true
}

/** Session cookie header value; Secure is set only on HTTPS requests. */
export function sessionCookieHeader(value: string, maxAge: number, secure: boolean): string {
  return `${SESSION_COOKIE_NAME}=${value}; Path=/; HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Lax; Max-Age=${maxAge}`
}

/** Expired session cookie header value (clears the cookie). */
export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}
