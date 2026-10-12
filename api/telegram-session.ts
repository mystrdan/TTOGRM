import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac, timingSafeEqual } from 'node:crypto'

type SessionPayload = { user: { id: number; first_name: string; last_name?: string; username?: string; photo_url?: string }; exp: number }

function readCookie(header: string | undefined, name: string) {
  if (!header) return undefined
  const entry = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
  return entry?.slice(name.length + 1)
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', 'ttogrm_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0')
    return res.status(200).json({ authenticated: false })
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) return res.status(503).json({ error: 'Telegram browser login is not configured' })
  const cookie = readCookie(req.headers.cookie, 'ttogrm_session')
  if (!cookie) return res.status(200).json({ authenticated: false })
  const separator = cookie.lastIndexOf('.')
  if (separator < 1) return res.status(200).json({ authenticated: false })
  const payload = cookie.slice(0, separator)
  const received = cookie.slice(separator + 1)
  const expected = createHmac('sha256', botToken).update(payload).digest()
  if (!/^[a-f0-9]{64}$/i.test(received)) return res.status(200).json({ authenticated: false })
  const actual = Buffer.from(received, 'hex')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return res.status(200).json({ authenticated: false })
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionPayload
    if (!session.user || !Number.isSafeInteger(session.user.id) || !Number.isSafeInteger(session.exp) || session.exp <= Math.floor(Date.now() / 1000)) {
      res.setHeader('Set-Cookie', 'ttogrm_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0')
      return res.status(200).json({ authenticated: false })
    }
    return res.status(200).json({ authenticated: true, user: session.user })
  } catch {
    return res.status(200).json({ authenticated: false })
  }
}
