import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac, timingSafeEqual } from 'node:crypto'

type TelegramUser = {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
}

function safeEqualHex(left: string, right: string) {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) return false
  const a = Buffer.from(left, 'hex')
  const b = Buffer.from(right, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

function validateInitData(raw: string, botToken: string) {
  const params = new URLSearchParams(raw)
  const receivedHash = params.get('hash')
  const authDate = Number(params.get('auth_date'))

  if (!receivedHash || !Number.isFinite(authDate) || authDate <= 0) {
    throw new Error('Invalid Telegram initialization data')
  }

  const now = Math.floor(Date.now() / 1000)
  if (authDate > now + 30 || now - authDate > 60 * 60 * 24) {
    throw new Error('Telegram session expired. Reopen the Mini App.')
  }

  const checkString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const calculatedHash = createHmac('sha256', secretKey).update(checkString).digest('hex')

  if (!safeEqualHex(receivedHash, calculatedHash)) {
    throw new Error('Telegram signature could not be verified')
  }

  const userRaw = params.get('user')
  if (!userRaw) throw new Error('Telegram user information is missing')

  let user: TelegramUser
  try {
    user = JSON.parse(userRaw) as TelegramUser
  } catch {
    throw new Error('Telegram user information is malformed')
  }

  if (!Number.isSafeInteger(user.id) || user.id <= 0 || typeof user.first_name !== 'string') {
    throw new Error('Telegram user information is invalid')
  }

  return {
    id: user.id,
    first_name: user.first_name,
    ...(user.last_name ? { last_name: user.last_name } : {}),
    ...(user.username ? { username: user.username } : {}),
    ...(user.photo_url ? { photo_url: user.photo_url } : {}),
  }
}

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

  try {
    const user = validateInitData(initData, botToken)
    return res.status(200).json({ authenticated: true, user })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to verify Telegram identity'
    return res.status(401).json({ error: message })
  }
}
