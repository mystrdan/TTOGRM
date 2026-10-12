# TTOGRM

**Every Telegram name. One place.**

TTOGRM is a Telegram-native username portfolio concept for organizing usernames associated with a person's Telegram profile, groups, and channels, including basic usernames and collectible usernames.

## MVP scope

- Telegram Mini App interface.
- Username inventory organized by personal profile, groups, and channels.
- Clear distinction between basic usernames, collectible usernames, assignment, and verified wallet ownership.
- Optional TON wallet connection.
- Private-by-default collection view.

## Important discovery limitation

Telegram Mini App initialization data identifies the user who opened the Mini App; it does **not** provide a complete list of that user's groups, channels, or all usernames. The Bot API also cannot enumerate every chat a user owns.

A complete inventory may require a separate, explicit MTProto account-authorization flow and chat discovery. That approach must be validated before promising completeness. Do not ask users to paste Telegram login codes, passwords, or session strings into the Mini App, and do not store MTProto credentials in the browser.

## Current status

- React + TypeScript Mini App interface is in place.
- Telegram Mini App initialization data validation is implemented in two server-side options: Vercel API route and Supabase Edge Function.
- Both validators read `TELEGRAM_BOT_TOKEN` only from server-side environment/secrets, check the auth timestamp, validate the Telegram HMAC signature, and return a minimal verified user profile.
- The dashboard still uses clearly labelled demo inventory data.
- MTProto username discovery and TON wallet connection are not implemented yet.
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

## Planned architecture

- **Frontend:** React + TypeScript + Vite, designed to run inside Telegram.
- **Telegram identity:** validate signed Telegram Mini App `initData` on a trusted server before treating the Telegram user ID as authenticated.
- **Username discovery:** investigate a secure, explicit MTProto authorization service and document visibility limitations.
- **TON:** optional TON Connect integration, used only to identify assets held by the connected wallet. A wallet address alone does not prove that every Telegram username belongs to that user.
- **Security:** secrets stay server-side; never trust `initDataUnsafe`; validate signed Mini App initialization data on the server.

## Official references

- [Telegram Mini Apps](https://core.telegram.org/bots/webapps)
- [Telegram Mini App init data validation](https://docs.telegram-mini-apps.com/platform/init-data)
- [TON Connect overview](https://docs.ton.org/applications/ton-connect/overview)
- [Supabase Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)
