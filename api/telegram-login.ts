import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { buildSessionValue, isSecureRequest, sessionCookieHeader } from './_telegram-auth'

type TelegramLoginUser = {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

function safeEqualHex(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false
  const a = Buffer.from(left, 'hex')
  const b = Buffer.from(right, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) return res.status(503).json({ error: 'Telegram browser login is not configured yet' })
  const user = req.body?.user as TelegramLoginUser | undefined
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0 || typeof user.first_name !== 'string' ||
      typeof user.hash !== 'string' || !Number.isSafeInteger(user.auth_date)) {
    return res.status(400).json({ error: 'Invalid Telegram login payload' })
  }

  const now = Math.floor(Date.now() / 1000)
  if (user.auth_date > now + 30 || now - user.auth_date > 60 * 60 * 24) {
    return res.status(401).json({ error: 'Telegram login expired. Please sign in again.' })
  }

  const checkString = Object.entries(user)
    .filter(([key, value]) => key !== 'hash' && value !== undefined && value !== null)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('\n')
  const secretKey = createHash('sha256').update(botToken).digest()
  const calculatedHash = createHmac('sha256', secretKey).update(checkString).digest('hex')
  if (!safeEqualHex(user.hash, calculatedHash)) {
    return res.status(401).json({ error: 'Telegram login signature could not be verified' })
  }

  const profile = {
      id: user.id,
      first_name: user.first_name,
      ...(user.last_name ? { last_name: user.last_name } : {}),
      ...(user.username ? { username: user.username } : {}),
      ...(user.photo_url ? { photo_url: user.photo_url } : {}),
    }
  // Secure cookies are required in production, but plain HTTP is needed for local
  // development. Set the flag based on the request instead of forcing it always on.
  const { value, maxAge } = buildSessionValue(profile, botToken)
  res.setHeader('Set-Cookie', sessionCookieHeader(value, maxAge, isSecureRequest(req)))

  return res.status(200).json({
    authenticated: true,
    user: profile
  })
}
