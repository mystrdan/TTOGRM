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
  if (!token) return null
  const initData = typeof req.headers['x-telegram-init-data'] === 'string' ? req.headers['x-telegram-init-data'] : ''
  if (initData) {
    const params = new URLSearchParams(initData)
    const receivedHash = params.get('hash') || ''
    params.delete('hash')
    const checkString = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${key}=${value}`).join('\n')
    const secret = createHmac('sha256', 'WebAppData').update(token).digest()
    const expected = createHmac('sha256', secret).update(checkString).digest()
    const received = /^[a-f0-9]{64}$/i.test(receivedHash) ? Buffer.from(receivedHash, 'hex') : Buffer.alloc(0)
    const authDate = Number(params.get('auth_date'))
    const now = Math.floor(Date.now() / 1000)
    if (received.length === expected.length && timingSafeEqual(received, expected) && Number.isSafeInteger(authDate) && authDate <= now + 30 && now - authDate <= 86400) {
      try {
        const rawUser = params.get('user')
        const miniUser = rawUser ? JSON.parse(rawUser) as { id?: number; first_name?: string } : null
        if (miniUser && Number.isSafeInteger(miniUser.id) && (miniUser.id || 0) > 0 && typeof miniUser.first_name === 'string') return { id: miniUser.id!, first_name: miniUser.first_name }
      } catch { /* Reject malformed Mini App user data. */ }
    }
    return null
  }
  const cookieHeader = req.headers.cookie
  if (!cookieHeader) return null
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
  // Prefer the current secret-key format. Legacy service_role JWTs still work during migration.
  const secretKey = process.env.SUPABASE_SECRET_KEY
  const legacyKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const key = secretKey || legacyKey
  return key ? { baseUrl, key, isNewSecretKey: Boolean(secretKey) } : null
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
    return res.status(405).json({ error: 'This action isn’t available.' })
  }
  const user = sessionUser(req)
  if (!user) return res.status(401).json({ error: 'Sign in with Telegram to access your private inventory.' })
  const cfg = config()
  if (!cfg) return res.status(503).json({ error: 'Your collection is temporarily unavailable. Please try again later.' })
  const endpoint = `${cfg.baseUrl}/rest/v1/username_entries`
  const headers = { apikey: cfg.key, ...(!cfg.isNewSecretKey ? { Authorization: `Bearer ${cfg.key}` } : {}), 'Content-Type': 'application/json', Prefer: 'return=representation' }

  try {
    if (req.method === 'GET') {
      const response = await fetch(`${endpoint}?select=id,username,entity_type,username_type,assignment_status,title,verification_status,created_at,updated_at&telegram_user_id=eq.${user.id}&order=created_at.desc`, { headers, cache: 'no-store' })
      if (!response.ok) return res.status(502).json({ error: 'Could not load your inventory.' })
      return res.status(200).json({ items: await response.json() })
    }
    if (req.method === 'DELETE') {
      const id = String(req.query.id || '')
      if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'That saved username could not be found. Please refresh and try again.' })
      const response = await fetch(`${endpoint}?id=eq.${encodeURIComponent(id)}&telegram_user_id=eq.${user.id}`, { method: 'DELETE', headers })
      if (!response.ok) return res.status(502).json({ error: 'Could not remove that username.' })
      return res.status(200).json({ deleted: true })
    }
    const input = validInput((req.body || {}) as InventoryInput)
    if (!input) return res.status(400).json({ error: 'Enter a valid Telegram username and choose its type and assignment.' })
    if (req.method === 'POST' || req.method === 'PUT') {
      const editingId = req.method === 'PUT' ? String((req.body as InventoryInput | undefined)?.id || '') : ''
      if (req.method === 'PUT' && !/^[0-9a-f-]{36}$/i.test(editingId)) return res.status(400).json({ error: 'A valid inventory item ID is required.' })
      // Compare normalized values in code instead of using SQL LIKE patterns: underscores
      // are valid Telegram username characters but are wildcards in LIKE/ILIKE filters.
      const duplicateUrl = `${endpoint}?select=id,username&telegram_user_id=eq.${user.id}`
      const duplicateResponse = await fetch(duplicateUrl, { headers, cache: 'no-store' })
      if (!duplicateResponse.ok) return res.status(502).json({ error: 'We couldn’t check whether this username is already saved. Please try again.' })
      const duplicateRows = await duplicateResponse.json() as Array<{ id: string; username: string }>
      if (duplicateRows.some((row) => row.id !== editingId && row.username.toLowerCase() === input.username.toLowerCase())) {
        return res.status(409).json({ error: 'That username is already in your collection.' })
      }
      const response = req.method === 'POST'
        ? await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ ...input, telegram_user_id: user.id, discovery_source: 'manual', verification_status: 'unverified' }) })
        : await fetch(`${endpoint}?id=eq.${encodeURIComponent(editingId)}&telegram_user_id=eq.${user.id}`, { method: 'PATCH', headers, body: JSON.stringify({ ...input, updated_at: new Date().toISOString() }) })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        const databaseError = body as { code?: string } | null
        // The database unique index is the final guard against concurrent duplicate requests.
        if (databaseError?.code === '23505') return res.status(409).json({ error: 'That username is already in your collection.' })
        return res.status(502).json({ error: req.method === 'POST' ? 'Could not save this username. Please try again.' : 'Could not update this username.' })
      }
      if (req.method === 'PUT' && (!Array.isArray(body) || body.length === 0)) return res.status(404).json({ error: 'Inventory item not found.' })
      return res.status(req.method === 'POST' ? 201 : 200).json({ item: Array.isArray(body) ? body[0] : body })
    }
    return res.status(405).json({ error: 'Method not allowed' })
  } catch {
    return res.status(502).json({ error: 'Your collection is temporarily unavailable. Please try again later.' })
  }
}
