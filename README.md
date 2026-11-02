# PO Checker

A local Windows dashboard that saves new Inbox messages from exact sender addresses during the current server run. Message history and sender settings are stored in a local SQLite database. Microsoft tokens are kept separately in the current Windows user's encrypted cache.

## Prerequisites and setup

- Install a current Node.js LTS release.
- In the [Microsoft Entra admin center](https://entra.microsoft.com), open **Identity → Applications → App registrations → New registration**. Choose **Personal Microsoft accounts** as the supported account type, register the app, and copy its Application (client) ID. Microsoft documents the [registration and account-type choices](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app?tabs=client-secret).
- In the app registration, open **Authentication → Advanced settings** and enable **Allow public client flows** for device-code sign-in. Under **API permissions**, add **Microsoft Graph → Delegated permissions → `Mail.Read`**. The app uses a public-client flow, so do not create a client secret. See Microsoft's [public client and device-code guidance](https://learn.microsoft.com/en-us/entra/identity-platform/msal-client-applications) and [Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference).
- Install dependencies with `npm install`, then run `npm run build` and `npm start`. Open `http://127.0.0.1:4174`, enter the app's client ID, and complete device-code sign-in.

`npm run dev` runs Express and Vite for development. `npm run lint` and `npm test` run lint and automated checks. `launch.bat` starts the production server and opens the dashboard when the API is ready. Closing the browser leaves collection running; stopping the server ends that collection run.

## Collection behavior

The server records a fresh UTC cutoff as soon as it starts. Only Inbox messages received strictly after that time can be saved. Browser refreshes, reconnects, and sender changes do not reset it. A server restart creates a new cutoff; messages received while stopped stay excluded. New senders are checked against the entire current run window. Matching uses the exact sender email address, ignoring case, and never the display name. Inbox-only polling may miss messages moved elsewhere before a check. The collector does not download attachments, mark mail read, send mail, or modify Outlook messages.

## Local data and privacy

The database is `data/po-checker.db` under the app directory (or `DATA_DIR` if set). The MSAL token cache is stored under `%APPDATA%\POChecker\msal-cache.bin` and uses Windows current-user encryption through [Microsoft Authentication Extensions for Node](https://learn.microsoft.com/en-us/entra/identity-platform/msal-node-extensions). History remains on disk after sign-out, but the dashboard hides it until the same account reconnects. To erase local data, stop the server, delete the app's `data` directory, and remove `%APPDATA%\POChecker`. Do not copy either location into source control.

## Troubleshooting

- If sign-in fails, verify the client ID, supported account types, public-client setting, and delegated `Mail.Read` consent.
- If secure cache initialization fails, confirm the app runs under a normal Windows user profile. The app fails closed rather than saving tokens without encryption.
- If Graph reports expired sign-in, sign out and sign in again.
- If a message is missing, confirm it is still in Inbox, arrived after the displayed run cutoff, and its actual sender address is on the allowlist.

The local endpoint shapes and request parameters are documented in [docs/API.md](docs/API.md).

The API binds only to loopback. State-changing API calls reject foreign browser origins. Email bodies are displayed as plain text.
