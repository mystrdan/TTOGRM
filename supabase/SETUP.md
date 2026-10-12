# TTOGRM Supabase setup

The TTOGRM Supabase project is provisioned on the Free plan in `eu-west-2` (London).

- Project ref: `eugovevzpptsfstkjcaf`
- Project URL: `https://eugovevzpptsfstkjcaf.supabase.co`
- Telegram auth Edge Function: `https://eugovevzpptsfstkjcaf.supabase.co/functions/v1/telegram-auth`

## Current state

- The private inventory migration and verified market-sales migrations are applied, including the Gram currency naming migration (`202610120004_gram_currency_naming.sql`).
- The `telegram-auth` Edge Function is deployed.
- Browser roles cannot directly read or write the private inventory tables. Access is reserved for trusted server-side code.
- The function will return HTTP 503 until `TELEGRAM_BOT_TOKEN` is added as an Edge Function secret.

## Vercel deployment

The repository `mystrdan/TTOGRM` is linked to the Vercel project `ttogrm`, with `main` as the production branch.

- Project dashboard: https://vercel.com/capsicom/ttogrm
- Production alias: https://ttogrm-capsicom.vercel.app
- Telegram webhook endpoint: https://ttogrm-capsicom.vercel.app/api/telegram-webhook

Vercel Git integration is enabled so pushes to `main` can trigger production deployments automatically. Check the project dashboard for current build status and deployment URLs.

In **Vercel → Project → Settings → Environment Variables**, configure the variables required for the features you enable:

- `TELEGRAM_BOT_TOKEN`: bot token for server-side Telegram authentication and replies.
- `TELEGRAM_WEBHOOK_SECRET`: a random secret used to validate incoming Telegram webhook requests.
- `SUPABASE_URL`: `https://eugovevzpptsfstkjcaf.supabase.co`.
- `SUPABASE_SERVICE_ROLE_KEY`: needed for the server-side market-board API. Never expose this in frontend code.
- `VITE_TELEGRAM_AUTH_URL`: optional public endpoint URL for the Supabase auth function, if the frontend should call it instead of `/api/auth`.

Do not create a `VITE_TELEGRAM_BOT_TOKEN` or `VITE_SUPABASE_SERVICE_ROLE_KEY`. Vite-prefixed variables are exposed to browser code. After changing environment variables, trigger a fresh deployment for the target environment.

## Add the Telegram bot token securely

Do not place the token in source code, frontend variables, GitHub commits, logs, or chat messages. If a token has been shared outside the secret manager, rotate it with BotFather and configure the rotated token directly as a server-side secret.

Using the Supabase Dashboard is the simplest option: open this project, go to Edge Functions / Secrets, and add a secret named `TELEGRAM_BOT_TOKEN` with the token as its value.

Or, use a local ignored `.env` file containing only:

```dotenv
TELEGRAM_BOT_TOKEN=replace-with-your-rotated-token
```

Then run:

```sh
supabase secrets set --env-file .env --project-ref eugovevzpptsfstkjcaf
```

The repository ignores `.env`; never commit it or use a `VITE_*` variable for this secret.

## Deploy updates

From the repository root, after installing and authenticating the Supabase CLI:

```sh
supabase link --project-ref eugovevzpptsfstkjcaf
supabase db push
supabase functions deploy telegram-auth --no-verify-jwt
```

JWT verification is disabled at the gateway only because this endpoint performs its own Telegram signed-`initData` verification. The function must reject requests without valid signed data.

## Important product limitations

Telegram Mini App `initData` verifies the Telegram account that opened TTOGRM. It does not provide a complete list of groups/channels or all usernames connected to that account. Full inventory discovery remains separate work and may require an explicit, consent-based Telegram client authorization flow. Never request a Telegram login code, password, or session string inside the Mini App.

Wallet connection is planned as an optional TON-blockchain-only feature. Gram (GRAM) is the network's native currency; TON remains the blockchain name. A wallet address by itself does not prove ownership of every Telegram collectible username.

## Telegram bot commands and webhook

The Vercel webhook handler is at `api/telegram-webhook.ts`. Configure these as server-side Vercel environment variables:

- `TELEGRAM_BOT_TOKEN`: the bot token, shared only by server-side handlers.
- `TELEGRAM_WEBHOOK_SECRET`: a random secret string used to authenticate Telegram webhook requests.
- `SUPABASE_URL`: `https://eugovevzpptsfstkjcaf.supabase.co`.
- `SUPABASE_SERVICE_ROLE_KEY`: the project service-role secret, server-side only. Never use it in the frontend or commit it.

After deployment, set the webhook to `https://ttogrm.vercel.app/api/telegram-webhook` and use the same `TELEGRAM_WEBHOOK_SECRET` as Telegram's `secret_token`. Use Telegram's official `setWebhook` method; never commit a real token or secret in the command. The handler checks Telegram's `X-Telegram-Bot-Api-Secret-Token` header.

Register these commands with BotFather using `/setcommands`:

```text
start - Start TTOGRM
help - Show available commands
board - View the username market board
sales - Check reported sales in the last 24 hours
top - View the highest reported username sale
stats - Check market data status
currency - Explain Gram (GRAM) and the TON blockchain
inventory - Explain inventory discovery and demo data
```

## Market information board

- `market_sales` stores sale observations with a source, timestamp, price when known, and verification status. Price is stored in `sale_price_gram`; market prices and volume are denominated in Gram (GRAM), while TON is the blockchain name.
- The `get_public_market_board()` database function aggregates only verified records in the rolling 24-hour window.
- `GET /api/market-board` and the bot's `/board`, `/sales`, `/top`, and `/stats` commands use the same aggregate.
- The board intentionally shows unavailable values until `SUPABASE_SERVICE_ROLE_KEY` is configured and a trusted market ingestion feed supplies verified sales. A missing data feed is not interpreted as zero market activity.
- No automated Fragment sales ingestion has been implemented yet; do not manually mark unverified reports as verified without evidence.
