# `email-sender-smtp` feature overlay

Self-hosted SMTP transactional email for Workers. This installs a
source-owned `SmtpEmailSender` adapter that implements Mantle's narrow
`EmailSender` port via `worker-mailer`.

## What the scaffolder ships

| Path in scaffolded project | Origin | Notes |
|---|---|---|
| `src/auth/senders/smtp.ts` | feature source | `SmtpEmailSender` plus `buildSmtpEmailSenderFromEnv(env)` |
| `.dev.vars.example` | feature fragment | Documents local SMTP env vars |
| `package.json` | scaffolder compose | Adds `worker-mailer` as a runtime dependency |

## Env

| Var | Secret | Default | Notes |
|---|---:|---|---|
| `SMTP_HOST` | no | none | SMTP server host, for example `smtp.example.com` |
| `SMTP_PORT` | no | `465` in helper | Prefer 465 implicit TLS on Workers; 587 STARTTLS is provider/runtime-sensitive |
| `SMTP_USER` | no | none | SMTP auth username, usually the mailbox |
| `SMTP_PASS` | yes | none | `wrangler secret put SMTP_PASS` |
| `EMAIL_FROM` | no | none | RFC 5322 From header, for example `Acme <auth@example.com>` |

Workers cannot connect to outbound port 25. This adapter rejects port
25 at config-build time and defaults to 465 implicit TLS when
`SMTP_PORT` is absent.

## Wiring

Pair this feature with `customer-account`, then use the sender when
building Better Auth methods:

```ts
import { ConsoleEmailSender } from "@aotter/mantle/cloudflare";
import { buildFeatureAuthMethods } from "./.mantle/generated.auth-methods.js";
import { buildSmtpEmailSenderFromEnv } from "./auth/senders/smtp.js";

const customerEmailSender =
  buildSmtpEmailSenderFromEnv(env) ?? new ConsoleEmailSender();

const auth = createAuth({
  /* ... */
  methods: [
    /* staff/social methods first */
    ...buildFeatureAuthMethods(env, customerEmailSender),
  ],
});
```

`buildSmtpEmailSenderFromEnv(env)` returns `null` when SMTP is entirely
unset so local dev can fall back to `ConsoleEmailSender`. If any SMTP
setting is present but required peers are missing, it throws a clear
partial-config error instead of silently dropping mail.
