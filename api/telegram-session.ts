import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clearSessionCookieHeader, verifySessionCookie } from './_telegram-auth'

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', clearSessionCookieHeader())
    return res.status(200).json({ authenticated: false })
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) return res.status(503).json({ error: 'Telegram browser login is not configured' })
  const user = verifySessionCookie(req.headers.cookie, botToken)
  if (!user) {
    // Clear expired or tampered cookies so the browser does not keep retrying them.
    res.setHeader('Set-Cookie', clearSessionCookieHeader())
    return res.status(200).json({ authenticated: false })
  }
  return res.status(200).json({ authenticated: true, user })
}
