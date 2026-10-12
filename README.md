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
- `POST /api/auth` validates Telegram Mini App initialization data server-side using the bot token, checks expiry, and returns a minimal verified user profile.
- The dashboard still uses clearly labelled demo inventory data.
- MTProto username discovery and TON wallet connection are not implemented yet.
- A GitHub Actions workflow runs the production build on pushes and pull requests.

### Required environment

Configure `TELEGRAM_BOT_TOKEN` as a server-side environment variable in the deployment platform before expecting Telegram identity verification to succeed. Never expose this token to frontend code or commit it to the repository. Without the variable, the auth endpoint intentionally returns a configuration error.

## Development

Requirements: Node.js 20+

```bash
npm install
npm run dev
```

## Planned architecture

- **Frontend:** React + TypeScript + Vite, designed to run inside Telegram.
- **Telegram identity:** validate Telegram Mini App `initData` on a trusted server before treating the Telegram user ID as authenticated.
- **Username discovery:** investigate a secure, explicit MTProto authorization service and document the visibility limitations.
- **TON:** optional TON Connect integration, used only to identify assets held by the connected wallet. A wallet address alone does not prove that every Telegram username belongs to that user.
- **Security:** secrets stay server-side; never trust `initDataUnsafe`; validate signed Mini App initialization data on the server.

## Official references

- [Telegram Mini Apps](https://core.telegram.org/bots/webapps)
- [Telegram Mini App init data validation](https://docs.telegram-mini-apps.com/platform/init-data)
- [TON Connect overview](https://docs.ton.org/applications/ton-connect/overview)
