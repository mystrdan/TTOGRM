import type { VercelRequest, VercelResponse } from '@vercel/node'
import { loadMarketBoard } from './_market.js'

/**
 * Safe operational diagnostics for the deployed app.
 * Reports readiness booleans and market counts only; never returns secret values,
 * Telegram profile data, or private inventory rows.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const botTokenConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN)
  const webhookSecretConfigured = Boolean(process.env.TELEGRAM_WEBHOOK_SECRET)
  const supabaseKeyConfigured = Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
  const supabaseUrlConfigured = Boolean(process.env.SUPABASE_URL)
  const marketBoard = await loadMarketBoard()

  const checks = {
    telegramBotTokenConfigured: botTokenConfigured,
    miniAppAuthReady: botTokenConfigured,
    browserLoginReady: botTokenConfigured && Boolean(process.env.VITE_TELEGRAM_BOT_USERNAME),
    webhookSecretConfigured,
    webhookReady: botTokenConfigured && webhookSecretConfigured,
    supabaseUrlConfigured,
    supabaseServerKeyConfigured: supabaseKeyConfigured,
    databaseMarketRpcReady: marketBoard.available,
  }

  const ready = checks.miniAppAuthReady && checks.supabaseUrlConfigured &&
    checks.supabaseServerKeyConfigured && checks.databaseMarketRpcReady

  return res.status(200).json({
    service: 'TTOGRM',
    status: ready && checks.webhookReady ? 'ready' : 'degraded',
    checks,
    market: {
      verifiedSalesLast24h: marketBoard.available ? marketBoard.soldCount : null,
      knownPriceVolumeGram: marketBoard.available ? marketBoard.volumeGram : null,
      updatedAt: marketBoard.updatedAt,
      feedStatus: !marketBoard.available
        ? 'unavailable'
        : marketBoard.soldCount > 0
          ? 'verified records present'
          : 'connected; no verified sales in the current 24-hour window',
    },
    checkedAt: new Date().toISOString(),
  })
}
