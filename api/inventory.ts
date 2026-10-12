import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac, timingSafeEqual } from 'node:crypto'

type SessionPayload = { user: { id: number; first_name: string }; exp: number }
type InventoryInput = {
  id?: string
  username?: string
  entity_type?: 'personal' | 'group' | 'channel'
  username_type?: 'basic' | 'collectible'
  assignment_status?: 'assigned' | 'unassigned' | 'unknown'
  title?: string | null
}

function sessionUser(req: VercelRequest): SessionPayload['user'] | null {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const cookieHeader = req.headers.cookie
  if (!token || !cookieHeader) return null
  const cookie = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith('ttogrm_session='))
  const value = cookie?.slice('ttogrm_session='.length)
  if (!value) return null
  const separator = value.lastIndexOf('.')
  if (separator < 1) return null
  const payload = value.slice(0, separator)
  const signature = value.slice(separator + 1)
  if (!/^[a-f0-9]{64}$/i.test(signature)) return null
  const expected = createHmac('sha256', token).update(payload).digest()
  const received = Buffer.from(signature, 'hex')
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionPayload
    if (!session.user || !Number.isSafeInteger(session.user.id) || !Number.isSafeInteger(session.exp) || session.exp <= Math.floor(Date.now() / 1000)) return null
    return session.user
  } catch {
    return null
  }
}

function config() {
  const baseUrl = (process.env.SUPABASE_URL || 'https://eugovevzpptsfstkjcaf.supabase.co').replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return key ? { baseUrl, key } : null
}

function validInput(body: InventoryInput) {
  const username = String(body.username || '').trim().replace(/^@/, '')
  return /^[A-Za-z0-9_]{5,32}$/.test(username) &&
    ['personal', 'group', 'channel'].includes(String(body.entity_type)) &&
    ['basic', 'collectible'].includes(String(body.username_type)) &&
    ['assigned', 'unassigned', 'unknown'].includes(String(body.assignment_status))
    ? { username, entity_type: body.entity_type, username_type: body.username_type, assignment_status: body.assignment_status, title: typeof body.title === 'string' ? body.title.trim().slice(0, 100) || null : null }
    : null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Vary', 'Cookie')
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method || '')) {
    res.setHeader('Allow', 'GET, POST, PUT, DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const user = sessionUser(req)
  if (!user) return res.status(401).json({ error: 'Sign in with Telegram to access your private inventory.' })
  const cfg = config()
  if (!cfg) return res.status(503).json({ error: 'Private inventory storage is not configured yet.' })
  const endpoint = `${cfg.baseUrl}/rest/v1/username_entries`
  const headers = { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }

  try {
    if (req.method === 'GET') {
      const response = await fetch(`${endpoint}?select=id,username,entity_type,username_type,assignment_status,title,verification_status,created_at,updated_at&telegram_user_id=eq.${user.id}&order=created_at.desc`, { headers, cache: 'no-store' })
      if (!response.ok) return res.status(502).json({ error: 'Could not load your inventory.' })
      return res.status(200).json({ items: await response.json() })
    }
    if (req.method === 'DELETE') {
      const id = String(req.query.id || '')
      if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'A valid inventory item ID is required.' })
      const response = await fetch(`${endpoint}?id=eq.${encodeURIComponent(id)}&telegram_user_id=eq.${user.id}`, { method: 'DELETE', headers })
      if (!response.ok) return res.status(502).json({ error: 'Could not remove that username.' })
      return res.status(200).json({ deleted: true })
    }
    const input = validInput((req.body || {}) as InventoryInput)
    if (!input) return res.status(400).json({ error: 'Enter a valid Telegram username and choose its type and assignment.' })
    if (req.method === 'POST') {
      const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ ...input, telegram_user_id: user.id, discovery_source: 'manual', verification_status: 'unverified' }) })
      const body = await response.json().catch(() => null)
      if (!response.ok) return res.status(502).json({ error: 'Could not save this username. Please try again.' })
      return res.status(201).json({ item: Array.isArray(body) ? body[0] : body })
    }
    const id = String((req.body as InventoryInput | undefined)?.id || '')
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'A valid inventory item ID is required.' })
    const response = await fetch(`${endpoint}?id=eq.${encodeURIComponent(id)}&telegram_user_id=eq.${user.id}`, { method: 'PATCH', headers, body: JSON.stringify({ ...input, updated_at: new Date().toISOString() }) })
    const body = await response.json().catch(() => null)
    if (!response.ok) return res.status(502).json({ error: 'Could not update this username.' })
    if (!Array.isArray(body) || body.length === 0) return res.status(404).json({ error: 'Inventory item not found.' })
    return res.status(200).json({ item: body[0] })
  } catch {
    return res.status(502).json({ error: 'Private inventory service is temporarily unavailable.' })
  }
}
