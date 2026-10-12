import type { VercelRequest, VercelResponse } from '@vercel/node'
import { timingSafeEqual } from 'node:crypto'
import { loadMarketBoard, type MarketBoard } from './_market'

type TelegramMessage = {
  message_id: number
  chat: { id: number; type: string }
  text?: string
  from?: { first_name?: string }
}
type TelegramUpdate = { update_id: number; message?: TelegramMessage }

const HELP = [
  'TTOGRM — Every Telegram name. One place.',
  '',
  '/start — Welcome and quick overview',
  '/help — Show this command list',
  '/board — Username market information board',
  '/sales — Reported sales in the last 24 hours',
  '/top — Highest reported username sale',
  '/stats — Market data coverage and status',
  '',
  'Sales figures will only be shown when a trusted data source is connected. TTOGRM does not invent market numbers.',
].join('\n')

const DATA_PENDING = 'The TTOGRM sales data feed is not connected yet, so verified market figures are currently unavailable. We will not guess sales counts or prices.'

function secretMatches(received: string, expected: string) {
  const left = Buffer.from(received)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

function commandOf(text: string) {
  const first = text.trim().split(/\s+/, 1)[0] ?? ''
  return first.split('@', 1)[0].toLowerCase()
}

function formatTon(value: number | null) {
  return value === null ? 'Price undisclosed' : `${value.toLocaleString(undefined, { maximumFractionDigits: 3 })} TON`
}

function responseFor(command: string, firstName = '', board?: MarketBoard) {
  switch (command) {
    case '/start':
      return `Hi${firstName ? ` ${firstName}` : ''}! 👋\n\nTTOGRM helps you organize Telegram usernames across personal profiles, groups and channels, including collectible usernames.\n\nUse /help to see commands, or /board for username market information.\n\n${DATA_PENDING}`
    case '/help':
      return HELP
    case '/board': {
      if (!board?.available) return `📊 TTOGRM Market Info Board\n\nSales in 24h: —\nSales volume: —\nTop sale: —\n\n${DATA_PENDING}`
      const top = board.topSale ? `@${board.topSale.username} · ${formatTon(board.topSale.sale_price_ton === null ? null : Number(board.topSale.sale_price_ton))}` : 'No verified sale with a disclosed price'
      return `📊 TTOGRM Market Info Board · rolling 24h\n\n• Verified sales: ${board.soldCount}\n• Known-price volume: ${formatTon(board.volumeTon)}\n• Top sale: ${top}\n• Latest records loaded: ${board.recentSales.length}${board.updatedAt ? `\n• Latest sale time: ${board.updatedAt}` : ''}\n\nOnly verified ingested records are counted.`
    }
    case '/sales':
      if (!board?.available) return `🧾 Username sales · last 24 hours\n\nSold: —\nReported volume: —\n\n${DATA_PENDING}`
      return `🧾 Username sales · rolling 24 hours\n\nVerified sales: ${board.soldCount}\nKnown-price volume: ${formatTon(board.volumeTon)}\n\nOnly verified ingested records are counted.`
    case '/top': {
      if (!board?.available) return `🏆 Top username sale · last 24 hours\n\nUsername: —\nSale price: —\n\n${DATA_PENDING}`
      if (!board.topSale) return '🏆 No verified username sale with a disclosed price is recorded in the current 24-hour window.'
      return `🏆 Top username sale · rolling 24 hours\n\nUsername: @${board.topSale.username}\nSale price: ${formatTon(board.topSale.sale_price_ton === null ? null : Number(board.topSale.sale_price_ton))}\nSale time: ${board.topSale.sold_at}${board.topSale.source_url ? `\nSource: ${board.topSale.source_url}` : ''}`
    }
    case '/stats':
      return `TTOGRM service status\n\n• Bot command endpoint: active\n• Market data source: ${board?.available ? 'connected' : 'not connected'}\n• Verified sales in current 24h window: ${board?.available ? board.soldCount : 'unavailable'}\n\nA zero count means no verified records are loaded in the current window; it does not prove that no usernames were sold.`
    default:
      return 'I did not recognize that command. Send /help to see the available TTOGRM commands.'
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!expectedSecret) return res.status(503).json({ error: 'Telegram webhook is not configured' })
  const receivedSecret = req.headers['x-telegram-bot-api-secret-token']
  if (typeof receivedSecret !== 'string' || !secretMatches(receivedSecret, expectedSecret)) {
    return res.status(401).json({ error: 'Unauthorized webhook request' })
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) return res.status(503).json({ error: 'Telegram bot is not configured' })

  const update = req.body as TelegramUpdate
  const message = update?.message
  const text = typeof message?.text === 'string' ? message.text : ''
  if (!message || !text.startsWith('/') || !Number.isSafeInteger(message.chat?.id)) {
    return res.status(200).json({ ok: true, ignored: true })
  }

  const command = commandOf(text)
  const board = ['/board', '/sales', '/top', '/stats'].includes(command) ? await loadMarketBoard() : undefined
  const reply = responseFor(command, message.from?.first_name ?? '', board)
  try {
    const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: message.chat.id, text: reply, disable_web_page_preview: true }),
    })
    if (!telegramResponse.ok) {
      // Do not log the token or Telegram's request URL; return a generic server error only.
      return res.status(502).json({ error: 'Telegram could not deliver the command response' })
    }
    return res.status(200).json({ ok: true })
  } catch {
    return res.status(502).json({ error: 'Unable to deliver the command response' })
  }
}
