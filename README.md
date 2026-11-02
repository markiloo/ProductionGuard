# PO Checker — Gmail Inbox collector

A local Windows dashboard that saves new Gmail Inbox messages from exact sender addresses during each server run. It uses Gmail's IMAP service, so there is no Microsoft Graph, Microsoft account, or Google Cloud app registration.

## Gmail setup

1. Turn on [Google 2-Step Verification](https://myaccount.google.com/security).
2. Create a [Google app password](https://myaccount.google.com/apppasswords) for this local collector. Google may not offer app passwords for some managed or Advanced Protection accounts; see [Google's guidance](https://support.google.com/accounts/answer/185833?hl=en).
3. Install Node.js, run `npm install` and `npm run build` from this directory, then run `launch.bat`. In the dashboard enter your Gmail address and the app password. Do not enter your normal Google password.

Gmail IMAP is enabled automatically for personal accounts according to [Gmail Help](https://support.google.com/mail/answer/7126229?hl=en). The app connects only to `imap.gmail.com:993` over TLS and opens `INBOX` read-only.

## Commands

- `npm run dev`: Express API and Vite dashboard for development.
- `npm run lint`, `npm test`, `npm run build`: checks and production bundle.
- `npm start`: production server at `http://127.0.0.1:4174`.
- `launch.bat`: starts the production server and opens the dashboard after it is ready.

Closing the browser leaves collection running. Stop the server console to end the run. Each server start records a fresh UTC cutoff; only mail received strictly after it can be saved. Restarting excludes mail received while the server was stopped. Adding a sender checks the whole current-run window. Exact sender addresses are matched, not domains or display names. Inbox-only polling can miss messages moved out before a check.

## Local data and privacy

Saved mail and sender settings live in `data/po-checker.db` (or `DATA_DIR` if set). The app password is in `data/gmail-credential.dpapi`, encrypted for the current Windows user with DPAPI and kept outside SQLite. Sign-out removes this encrypted credential and hides history until that same Gmail address reconnects. To erase all local data, stop the server and delete the `data` directory. These files are ignored by Git.

The collector does not download attachment parts, mark mail read, send mail, or modify messages. Text is displayed as escaped text and cannot load remote email content.

## Troubleshooting

- For an app-password error, verify 2-Step Verification and create a new app password. A changed Google account password can revoke existing app passwords.
- Check that the message is still in Gmail Inbox, came after the displayed run cutoff, and its actual From address is on the allowlist.
- A transient connection error is retried on later checks; verify network access to `imap.gmail.com:993`.

See [docs/API.md](docs/API.md) for endpoint shapes.
