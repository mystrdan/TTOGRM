# TTOGRM

**Every Telegram name. One place.**

TTOGRM is a Telegram-native username portfolio concept for organizing usernames associated with a person's Telegram profile, groups, and channels, including basic usernames and collectible usernames.

## MVP scope

- Telegram Mini App interface.
- Username inventory organized by personal profile, groups, and channels.
- Clear distinction between basic usernames, collectible usernames, assignment, and verified wallet ownership.
- Optional wallet connection on the TON blockchain; Gram (GRAM) is its native currency.
- Private-by-default collection view.

## Important discovery limitation

Telegram Mini App initialization data identifies the user who opened the Mini App; it does **not** provide a complete list of that user's groups, channels, or all usernames. The Bot API also cannot enumerate every chat a user owns.

A complete inventory may require a separate, explicit MTProto account-authorization flow and chat discovery. That approach must be validated before promising completeness. Do not ask users to paste Telegram login codes, passwords, or session strings into the Mini App, and do not store MTProto credentials in the browser.

## Current status

- React + TypeScript Mini App interface is in place.
- Telegram Mini App initialization data validation is implemented in two server-side options: Vercel API route and Supabase Edge Function.
- Both validators read `TELEGRAM_BOT_TOKEN` only from server-side environment/secrets, check the auth timestamp, validate the Telegram HMAC signature, and return a minimal verified user profile.
- The dashboard still uses clearly labelled demo inventory data.
- MTProto username discovery and wallet connection on the TON blockchain are not implemented yet.
- Telegram bot webhook commands are implemented in `api/telegram-webhook.ts`: `/start`, `/help`, `/board`, `/sales`, `/top`, `/stats`, `/currency`, and `/inventory`.
- The market information board UI and `GET /api/market-board` endpoint are implemented. A private verified-sales ledger and 24-hour aggregate function are provisioned; live market figures remain unavailable until trusted sales ingestion and server-side secrets are configured.
- A GitHub Actions workflow runs the production build on pushes and pull requests.
- Vercel project `ttogrm` is connected to this repository with `main` as its production branch. Project: https://vercel.com/capsicom/ttogrm. The first deployment was initiated; check the Vercel dashboard for its current build status.

## Secrets and deployment

**Never commit the Telegram bot token. Never put it in frontend code, a `VITE_*` variable, an issue, or a log.** Rotate any token that has been shared outside the secret manager.

### Vercel project

Repository: https://github.com/mystrdan/TTOGRM  
Vercel project: https://vercel.com/capsicom/ttogrm  
Production alias: https://ttogrm-capsicom.vercel.app

The project is linked to GitHub. Pushes to `main` are intended to deploy to production automatically; other branches can be used for previews.

Set the following variables in **Vercel → Project → Settings → Environment Variables** as needed. Secrets must be server-side only and must not use the `VITE_` prefix:

- `TELEGRAM_BOT_TOKEN` — required by `/api/auth` and the bot webhook.
- `TELEGRAM_WEBHOOK_SECRET` — required to validate incoming Telegram webhook requests.
- `SUPABASE_URL` — `https://eugovevzpptsfstkjcaf.supabase.co`.
- `SUPABASE_SERVICE_ROLE_KEY` — required by the market API; server-side only.
- `VITE_TELEGRAM_AUTH_URL` — optional public endpoint URL if the frontend should use the Supabase Edge Function at `https://eugovevzpptsfstkjcaf.supabase.co/functions/v1/telegram-auth`.

After setting or changing environment variables, redeploy the relevant Vercel environment so the new values are loaded.

### Supabase Edge Function

Function source: `supabase/functions/telegram-auth/index.ts`

1. Link the Supabase CLI to the intended TTOGRM project.
2. Store the token in a temporary local env file that is excluded by `.gitignore`, with one line in `KEY=value` format:
   ```dotenv
   TELEGRAM_BOT_TOKEN=your_rotated_bot_token_here
   ```
   Then upload it using the Supabase CLI:
   ```bash
   supabase secrets set --env-file .env.local --project-ref eugovevzpptsfstkjcaf
   ```
   Keep `.env.local` out of Git, restrict local file permissions, and delete the file after the secret is uploaded. Never place the real token in a command argument, shell history, CI log, or committed file. You can also add the secret directly in the Supabase Dashboard's Edge Function secrets UI.
3. Deploy the function:
   ```bash
   supabase functions deploy telegram-auth --no-verify-jwt --project-ref eugovevzpptsfstkjcaf
   ```
   JWT verification is disabled at the gateway only because this endpoint performs its own Telegram signed-`initData` verification. The function must reject requests without valid signed data.
4. Set `VITE_TELEGRAM_AUTH_URL` to the deployed function URL in the Vercel project if using this function. The endpoint URL is not a secret.

### Telegram webhook

Configure `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` as server-side Vercel environment variables. After deployment, set the Telegram webhook to `https://ttogrm-capsicom.vercel.app/api/telegram-webhook` and use the same `TELEGRAM_WEBHOOK_SECRET` as Telegram's `secret_token`. Use Telegram's official `setWebhook` method; never commit a real token or secret in the command. The handler checks Telegram's `X-Telegram-Bot-Api-Secret-Token` header.

Register commands with BotFather using `/setcommands`:

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

## Development

Requirements: Node.js 20+

```bash
npm install
npm run dev
```

## Database foundation

A private-first schema migration is staged at `supabase/migrations/202610120001_private_inventory.sql`. It defines username inventory and discovery-run tables, enables RLS, and revokes direct table access from browser-facing `anon` and `authenticated` roles. Trusted server-side functions must validate Telegram identity and scope every read/write to that verified Telegram user. The private inventory migration is applied to the dedicated TTOGRM Supabase project.

## Planned architecture

- **Frontend:** React + TypeScript + Vite, designed to run inside Telegram.
- **Telegram identity:** validate signed Telegram Mini App `initData` on a trusted server before treating the Telegram user ID as authenticated.
- **Username discovery:** investigate a secure, explicit MTProto authorization service and document visibility limitations.
- **TON / Gram:** optional TON Connect integration for wallet access on the TON blockchain. Gram (GRAM) is the native currency; TON refers to the blockchain/network, not the currency ticker. A wallet address alone does not prove that every Telegram username belongs to that user.
- **Security:** secrets stay server-side; never trust `initDataUnsafe`; validate signed Mini App initialization data on the server.

## Official references

- [Telegram Mini Apps](https://core.telegram.org/bots/webapps)
- [Telegram Mini App init data validation](https://docs.telegram-mini-apps.com/platform/init-data)
- [TON Connect overview](https://docs.ton.org/applications/ton-connect/overview)
- [Supabase Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)

## Supabase deployment

The live Supabase project has its private inventory and market-sales migrations applied, including `202610120004_gram_currency_naming.sql`, which renames the market price field to `sale_price_gram` and updates the summary RPC to return `volumeGram`. The `telegram-auth` Edge Function is deployed. See [`supabase/SETUP.md`](supabase/SETUP.md) for the project reference, bot webhook commands, market-board architecture, and safe secret setup. Confirm that the rotated `TELEGRAM_BOT_TOKEN` is configured as a Supabase secret before relying on authentication; the sales board remains unavailable until a trusted ingestion feed is configured.
