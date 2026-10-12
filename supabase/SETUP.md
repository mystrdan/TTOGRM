# TTOGRM Supabase setup

The TTOGRM Supabase project is provisioned on the Free plan in `eu-west-2` (London).

- Project ref: `eugovevzpptsfstkjcaf`
- Project URL: `https://eugovevzpptsfstkjcaf.supabase.co`
- Telegram auth Edge Function: `https://eugovevzpptsfstkjcaf.supabase.co/functions/v1/telegram-auth`

## Current state

- The private inventory and verified market-sales migrations are applied, including Gram currency naming (`202610120004_gram_currency_naming.sql`) and case-insensitive per-account username uniqueness (`202610120005_username_uniqueness.sql`).
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
- `SUPABASE_SECRET_KEY`: preferred current server-only Supabase secret API key (`sb_secret_...`), used by the server-side market-board and private inventory APIs. Never expose this in frontend code. `SUPABASE_SERVICE_ROLE_KEY` (legacy JWT key) remains a temporary fallback.
- `VITE_TELEGRAM_AUTH_URL`: optional public endpoint URL for the Supabase auth function, if the frontend should call it instead of `/api/auth`.
- `VITE_TELEGRAM_BOT_USERNAME`: the bot username without `@`, required for Telegram Login Widget sign-in on desktop and regular browsers.

For browser login, also link the production domain to your bot through BotFather `/setdomain`. The Telegram Login Widget callback is verified server-side by `POST /api/telegram-login`; it does not authorize private inventory reads by itself.

Do not create a `VITE_TELEGRAM_BOT_TOKEN`, `VITE_SUPABASE_SECRET_KEY`, or `VITE_SUPABASE_SERVICE_ROLE_KEY`. Vite-prefixed variables are exposed to browser code. After changing environment variables, trigger a fresh deployment for the target environment.

## Configure the Supabase server key in Vercel

1. Open the [TTOGRM Vercel project](https://vercel.com/capsicom/ttogrm).
2. Go to **Settings → Environment Variables**.
3. Add a variable named `SUPABASE_SECRET_KEY`.
4. In Supabase, open project `eugovevzpptsfstkjcaf` and navigate to **Settings → API Keys**.
5. In the **Publishable and secret API keys** tab, copy the **secret** key (it begins with `sb_secret_`). Do not copy the publishable key.
6. Paste that value directly into Vercel's value field. Select **Production** and also **Preview** if you want preview deployments to use the database. Save.
7. Ensure `SUPABASE_URL` is set to `https://eugovevzpptsfstkjcaf.supabase.co`.
8. Redeploy the latest production deployment so the serverless functions receive the new variable.

The current API routes prefer `SUPABASE_SECRET_KEY` and send it in the `apikey` header only, as required for Supabase's new non-JWT secret keys. They retain `SUPABASE_SERVICE_ROLE_KEY` as a fallback for the older JWT-based key. If the project does not yet show a **secret** key, create the new API keys in **Settings → API Keys** first. Supabase is deprecating the legacy `service_role` key by the end of 2026, so prefer the new format.

Never put this key in `src/`, browser code, GitHub Actions logs, a public repository, or a `VITE_*` variable. Anyone who gets it can bypass RLS. TTOGRM's API must therefore authenticate the Telegram user and scope each query to that user before accessing private records.

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

TON Connect UI is mounted for browser, desktop, and compatible Telegram Mini App wallet flows. The public manifest is at `https://ttogrm-capsicom.vercel.app/tonconnect-manifest.json`. Wallet connection is optional and does not itself authenticate a Telegram account. Gram (GRAM) is the network's native currency; TON remains the blockchain name. A wallet address by itself does not prove ownership of every Telegram collectible username.

## Telegram bot commands and webhook

The Vercel webhook handler is at `api/telegram-webhook.ts`. Configure these as server-side Vercel environment variables:

- `TELEGRAM_BOT_TOKEN`: the bot token, shared only by server-side handlers.
- `TELEGRAM_WEBHOOK_SECRET`: a random secret string used to authenticate Telegram webhook requests.
- `SUPABASE_URL`: `https://eugovevzpptsfstkjcaf.supabase.co`.
- `SUPABASE_SECRET_KEY`: preferred current server-only Supabase secret API key (`sb_secret_...`). `SUPABASE_SERVICE_ROLE_KEY` is supported only as a legacy fallback. Never use either key in frontend code or commit it.

After deployment, set the webhook to `https://ttogrm-capsicom.vercel.app/api/telegram-webhook` and use the same `TELEGRAM_WEBHOOK_SECRET` as Telegram's `secret_token`. Use Telegram's official `setWebhook` method; never commit a real token or secret in the command. The handler checks Telegram's `X-Telegram-Bot-Api-Secret-Token` header.

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
- The board intentionally shows unavailable values until `SUPABASE_SECRET_KEY` (or the legacy `SUPABASE_SERVICE_ROLE_KEY`) is configured and a trusted market ingestion feed supplies verified sales. A missing data feed is not interpreted as zero market activity.
- No automated Fragment sales ingestion has been implemented yet; do not manually mark unverified reports as verified without evidence.
