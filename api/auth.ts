import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyMiniAppInitData } from './_telegram-auth.js'

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) {
    return res.status(503).json({ error: 'Telegram authentication is not configured yet' })
  }

  const initData = typeof req.body?.initData === 'string' ? req.body.initData : ''
  if (!initData) return res.status(400).json({ error: 'Missing Telegram initialization data' })

  // Single shared Mini App verifier (same HMAC, freshness, and user-shape
  // rules as the inventory route) so the two endpoints cannot drift apart.
  const user = verifyMiniAppInitData(initData, botToken)
  if (!user) return res.status(401).json({ error: 'Telegram signature could not be verified' })
  return res.status(200).json({ authenticated: true, user })
}
