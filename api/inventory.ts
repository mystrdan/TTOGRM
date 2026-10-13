import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAllowedWriteRequest, sessionUser } from './_telegram-auth.js'
type InventoryInput = {
  id?: string
  username?: string
  entity_type?: 'personal' | 'group' | 'channel'
  username_type?: 'basic' | 'collectible'
  assignment_status?: 'assigned' | 'unassigned' | 'unknown'
  title?: string | null
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
  // Reject cross-site cookie-authenticated writes; initData requests carry their
  // own unforgeable HMAC and are exempt.
  if ((req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') && !isAllowedWriteRequest(req)) {
    return res.status(403).json({ error: 'This action was blocked for your protection. Please refresh and try again.' })
  }
  const cfg = config()
  if (!cfg) return res.status(503).json({ error: 'Your collection is temporarily unavailable. Please try again later.' })
  const endpoint = `${cfg.baseUrl}/rest/v1/username_entries`
  const headers = { apikey: cfg.key, ...(!cfg.isNewSecretKey ? { Authorization: `Bearer ${cfg.key}` } : {}), 'Content-Type': 'application/json', Prefer: 'return=representation' }

  try {
    if (req.method === 'GET') {
      // Keep inventory reads bounded: validate client pagination and enforce a
      // conservative server-side maximum so one request cannot stream the whole table.
      const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200)
      const offset = Math.max(Number(req.query.offset) || 0, 0)
      const response = await fetch(`${endpoint}?select=id,username,entity_type,username_type,assignment_status,title,verification_status,created_at,updated_at&telegram_user_id=eq.${user.id}&order=created_at.desc&limit=${limit}&offset=${offset}`, { headers, cache: 'no-store' })
      if (!response.ok) return res.status(502).json({ error: 'Could not load your inventory.' })
      return res.status(200).json({ items: await response.json() })
    }
    if (req.method === 'DELETE') {
      const id = String(req.query.id || '')
      if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'That saved username could not be found. Please refresh and try again.' })
      const response = await fetch(`${endpoint}?id=eq.${encodeURIComponent(id)}&telegram_user_id=eq.${user.id}`, { method: 'DELETE', headers })
      if (!response.ok) return res.status(502).json({ error: 'Could not remove that username.' })
      const deleted = await response.json().catch(() => null)
      // Supabase returns an empty array when no row matched both the id and the
      // verified owner. Surface 404 so retries and cross-user IDs are not
      // reported as successful deletions.
      if (!Array.isArray(deleted) || deleted.length === 0) {
        return res.status(404).json({ error: 'That saved username could not be found. Please refresh and try again.' })
      }
      return res.status(200).json({ deleted: true })
    }
    const input = validInput((req.body || {}) as InventoryInput)
    if (!input) return res.status(400).json({ error: 'Enter a valid Telegram username and choose its type and assignment.' })
    if (req.method === 'POST' || req.method === 'PUT') {
      const editingId = req.method === 'PUT' ? String((req.body as InventoryInput | undefined)?.id || '') : ''
      if (req.method === 'PUT' && !/^[0-9a-f-]{36}$/i.test(editingId)) return res.status(400).json({ error: 'A valid inventory item ID is required.' })
      // Compare normalized values in code instead of using SQL LIKE patterns: underscores
      // are valid Telegram username characters but are wildcards in LIKE/ILIKE filters.
      // Bounded: the per-account unique index keeps this set small, but never
      // stream the whole table for a duplicate check.
      const duplicateUrl = `${endpoint}?select=id,username&telegram_user_id=eq.${user.id}&limit=500`
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
