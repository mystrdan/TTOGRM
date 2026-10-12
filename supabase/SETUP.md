# TTOGRM Supabase setup

The TTOGRM Supabase project is provisioned on the Free plan in `eu-west-2` (London).

- Project ref: `eugovevzpptsfstkjcaf`
- Project URL: `https://eugovevzpptsfstkjcaf.supabase.co`
- Telegram auth Edge Function: `https://eugovevzpptsfstkjcaf.supabase.co/functions/v1/telegram-auth`

## Current state

- The private inventory migration is applied.
- The `telegram-auth` Edge Function is deployed.
- Browser roles cannot directly read or write the private inventory tables. Access is reserved for trusted server-side code.
- Telegram authentication will return HTTP 503 until the bot token is added as an Edge Function secret.

## Add the Telegram bot token securely

Do not place the token in source code, frontend variables, GitHub commits, logs, or chat messages. Set it directly as a Supabase Edge Function secret.

Using the Supabase CLI:

```sh
supabase secrets set TELEGRAM_BOT_TOKEN --project-ref eugovevzpptsfstkjcaf
```

If your CLI version prompts for a value, enter it at the prompt. Alternatively, set the secret in the Supabase Dashboard under Edge Functions / Secrets. Do not commit a local `.env` file.

Because the token was previously shared in a chat, rotate it with BotFather before production use, then set the newly rotated token as the secret.

## Deploy updates

From the repository root, after installing and authenticating the Supabase CLI:

```sh
supabase link --project-ref eugovevzpptsfstkjcaf
supabase db push
supabase functions deploy telegram-auth
```

## Important product limitations

Telegram Mini App `initData` verifies the Telegram account that opened TTOGRM. It does not provide a complete list of groups/channels or all usernames connected to that account. Full inventory discovery remains separate work and may require an explicit, consent-based Telegram client authorization flow. Never request a Telegram login code, password, or session string inside the Mini App.

TON wallet connection is planned as an optional TON-only feature. A wallet address by itself does not prove ownership of every Telegram collectible username.
