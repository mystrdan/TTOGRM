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
- Telegram bot webhook commands are implemented in `api/telegram-webhook.ts`: `/start`, `/help`, `/board`, `/sales`, `/top`, and `/stats`.
- The market information board UI and `GET /api/market-board` endpoint are implemented. A private verified-sales ledger and 24-hour aggregate function are provisioned; live market figures remain unavailable until trusted sales ingestion and server-side secrets are configured.
- A GitHub Actions workflow runs the production build on pushes and pull requests.

## Secrets and deployment

**Never commit the Telegram bot token. Never put it in frontend code, a `VITE_*` variable, an issue, or a log.** The token shared during development should be rotated before production.

### Supabase Edge Function

Function source: `supabase/functions/telegram-auth/index.ts`

1. Link the Supabase CLI to the intended TTOGRM project.
2. Store the token in a temporary local env file that is excluded by `.gitignore`, with one line in `KEY=value` format:
   ```dotenv
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   ```
   Then upload it using the Supabase CLI:
   ```bash
   supabase secrets set --env-file .env.local
   ```
   Keep `.env.local` out of Git, restrict local file permissions, and delete the file after the secret is uploaded. Never place the real token in a command argument, shell history, CI log, or committed file. You can also add the secret directly in the Supabase Dashboard's Edge Function secrets UI.
3. Deploy the function:
   ```bash
   supabase functions deploy telegram-auth --no-verify-jwt
   ```
   JWT verification is disabled at the gateway only because this endpoint performs its own Telegram signed-`initData` verification. The function must reject requests without valid signed data.
4. Set the frontend auth endpoint to `https://YOUR_PROJECT_REF.supabase.co/functions/v1/telegram-auth` in the app deployment environment, if using the Supabase function. The endpoint URL is not a secret.

### Vercel API route fallback

Configure `TELEGRAM_BOT_TOKEN` as a server-side environment variable in Vercel. The existing `POST /api/auth` endpoint reads it from `process.env`. Never use a `VITE_TELEGRAM_BOT_TOKEN` variable.

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
- **TON / Gram:** optional TON Connect integration for wallet access on the TON blockchain. Gram (GRAM) is the native currency; TON refers to the blockchain/network, not the current currency ticker. A wallet address alone does not prove that every Telegram username belongs to that user.
- **Security:** secrets stay server-side; never trust `initDataUnsafe`; validate signed Mini App initialization data on the server.

## Official references

- [Telegram Mini Apps](https://core.telegram.org/bots/webapps)
- [Telegram Mini App init data validation](https://docs.telegram-mini-apps.com/platform/init-data)
- [TON Connect overview](https://docs.ton.org/applications/ton-connect/overview)
- [Supabase Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)

## Supabase deployment

The live Supabase project has its private inventory and market-sales migrations applied, including `202610120004_gram_currency_naming.sql`, which renames the market price field to `sale_price_gram` and updates the summary RPC to return `volumeGram`. The `telegram-auth` Edge Function is deployed. See [`supabase/SETUP.md`](supabase/SETUP.md) for the project reference, bot webhook commands, market-board architecture, and safe secret setup. Authentication remains unconfigured until `TELEGRAM_BOT_TOKEN` is added as a Supabase secret; the sales board remains unavailable until a trusted ingestion feed is configured.
