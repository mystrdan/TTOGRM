import type { VercelRequest, VercelResponse } from '@vercel/node'
import { loadMarketBoard } from './_market'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const board = await loadMarketBoard()
  return res.status(board.available ? 200 : 503).json(board)
}
