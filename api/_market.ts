export type MarketSale = {
  username: string
  sale_price_ton: number | string | null
  sold_at: string
  source_url?: string | null
}

export type MarketBoard = {
  available: boolean
  windowStart: string
  soldCount: number
  volumeTon: number | null
  topSale: MarketSale | null
  recentSales: MarketSale[]
  updatedAt: string | null
  reason?: string
}

export async function loadMarketBoard(): Promise<MarketBoard> {
  const baseUrl = (process.env.SUPABASE_URL || 'https://eugovevzpptsfstkjcaf.supabase.co').replace(/\/$/, '')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const now = new Date()
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  if (!serviceKey) {
    return { available: false, windowStart, soldCount: 0, volumeTon: null, topSale: null, recentSales: [], updatedAt: null, reason: 'Market data backend is not configured.' }
  }

  try {
    const response = await fetch(`${baseUrl}/rest/v1/rpc/get_public_market_board`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
      cache: 'no-store',
    })
    if (!response.ok) {
      return { available: false, windowStart, soldCount: 0, volumeTon: null, topSale: null, recentSales: [], updatedAt: null, reason: 'Market statistics are not available yet.' }
    }
    const data = await response.json() as {
      soldCount?: number
      volumeTon?: number | null
      topSale?: MarketSale | null
      recentSales?: MarketSale[]
      updatedAt?: string | null
      windowStart?: string
    }
    return {
      available: true,
      windowStart: data.windowStart || windowStart,
      soldCount: Number(data.soldCount || 0),
      volumeTon: data.volumeTon == null ? null : Number(data.volumeTon),
      topSale: data.topSale || null,
      recentSales: Array.isArray(data.recentSales) ? data.recentSales : [],
      updatedAt: data.updatedAt || null,
    }
  } catch {
    return { available: false, windowStart, soldCount: 0, volumeTon: null, topSale: null, recentSales: [], updatedAt: null, reason: 'Unable to load market statistics.' }
  }
}
