import "jsr:@supabase/functions-js/edge-runtime.d.ts"

type TelegramUser = {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
}

function safeEqualHex(left: string, right: string) {
  // Strict 64-hex on both sides: matches api/_telegram-auth.ts and rejects
  // odd-length or overlong digests instead of crashing on them.
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false
  const a = new Uint8Array(left.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)))
  const b = new Uint8Array(right.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)))
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i]
  return mismatch === 0
}

async function hmacSha256(key: Uint8Array, value: string) {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value)))
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function validateInitData(raw: string, botToken: string) {
  const params = new URLSearchParams(raw)
  const receivedHash = params.get("hash")
  const authDate = Number(params.get("auth_date"))
  if (!receivedHash || !Number.isSafeInteger(authDate) || authDate <= 0) throw new Error("Invalid Telegram initialization data")

  const now = Math.floor(Date.now() / 1000)
  if (authDate > now + 30 || now - authDate > 60 * 60 * 24) throw new Error("Telegram session expired. Reopen the Mini App.")

  const checkString = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")

  const secretKey = await hmacSha256(new TextEncoder().encode("WebAppData"), botToken)
  const calculatedHash = toHex(await hmacSha256(secretKey, checkString))
  if (!safeEqualHex(receivedHash, calculatedHash)) throw new Error("Telegram signature could not be verified")

  const userRaw = params.get("user")
  if (!userRaw) throw new Error("Telegram user information is missing")
  let user: TelegramUser
  try {
    user = JSON.parse(userRaw) as TelegramUser
  } catch {
    throw new Error("Telegram user information is malformed")
  }
  if (!Number.isSafeInteger(user.id) || user.id <= 0 || typeof user.first_name !== "string") {
    throw new Error("Telegram user information is invalid")
  }

  // Verified profile fields only: string-typed extras pass through, matching
  // api/_telegram-auth.ts. Non-string values are dropped rather than echoed.
  return {
    id: user.id,
    first_name: user.first_name,
    ...(typeof user.last_name === "string" ? { last_name: user.last_name } : {}),
    ...(typeof user.username === "string" ? { username: user.username } : {}),
    ...(typeof user.photo_url === "string" ? { photo_url: user.photo_url } : {}),
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    })
  }

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")
  if (!botToken) {
    return new Response(JSON.stringify({ error: "Telegram authentication is not configured yet" }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    })
  }

  let body: { initData?: unknown }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    })
  }
  if (typeof body.initData !== "string" || !body.initData) {
    return new Response(JSON.stringify({ error: "Missing Telegram initialization data" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    })
  }

  try {
    const user = await validateInitData(body.initData, botToken)
    return new Response(JSON.stringify({ authenticated: true, user }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to verify Telegram identity"
    return new Response(JSON.stringify({ error: message }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    })
  }
})
