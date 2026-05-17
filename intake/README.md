# `mantle-starters/intake`

> **This README ships with your scaffolded project.** If you're reading
> it on GitHub at `AotterClam/mantle-starters/intake`, the
> Getting-started block below **does not work on a raw clone** —
> `src/clamConfig.ts` contains literal `{{BRAND}}` / `{{LOCALES}}` /
> `{{DESCRIPTION}}` placeholders that `@aotterclam/create-mantle`
> substitutes at install time. A fresh-clone `pnpm dev` throws
> `SyntaxError: Expected property name or '}' in JSON` at boot.
>
> **To evaluate this starter end-to-end**, scaffold a throwaway site:
>
> ```bash
> npm create @aotterclam/mantle@alpha /tmp/eval-intake
> cd /tmp/eval-intake
> # then follow the Getting-started block below in that directory
> ```
>
> Or paste the two-URL prompt from <https://mantle.aotterclam.ai/> into
> your agent. See the [top-level README](../README.md) for the template
> model.

`intake` archetype starter for mantle v0.1.0 — public site that
**takes structured input** from visitors (lead capture, signups,
applications, requests-for-quote). Backed by the `publication` shape
(landing + articles + contact) **plus** a structured `leads` Schema
with a staff-only `leads-recent` View and CAPTCHA + Slack-notify
lifecycle.

For a brand-presence site without leads/articles, use
[`presence/`](../presence/).
For a publication-only starter without a leads form, use
[`publication/`](../publication/).

## What's added over `publication/`

- **`leads` Schema** — `name`, `email`, `company`, `need`, `timeline`,
  `status`. `status` is staff-only (`new` → `qualified` → `contacted`
  → `won`/`lost`); visitors never set it.
- **`leads-recent` View** — staff-only View of new leads, ordered
  desc by `createdAt`.
- **`submit-lead` Procedure** — `handler.kind: builtin`, `op: create`,
  `schema: leads`. CAPTCHA `before_create`, Slack-notify `after_create`
  (same `kind: ref` handlers as `submit-contact`).
- **`POST /api/leads` Trigger** — anonymous, accepts the form
  submission.

If your intake form needs additional fields, edit `manifests/leads.yaml`
directly. To add a fully separate Schema, route through
[`skills/extend`](https://github.com/AotterClam/mantle/blob/main/skills/extend/SKILL.md).

## Getting started

```bash
pnpm install
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and fill in `BETTER_AUTH_SECRET=` — without it the worker
returns `auth_not_configured` on every request. Generate a value:

```bash
openssl rand -hex 32
# copy the output, paste it after `BETTER_AUTH_SECRET=` in .dev.vars
```

That's the only field you have to set for the public site. The remaining
`GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` / `ADMIN_GITHUB_LOGIN` placeholders
are only consumed by `/admin` sign-in; public routes ignore them.
`TURNSTILE_SECRET_KEY=dev-stub` is fine for local development.

Then:

```bash
pnpm validate
pnpm dev      # wrangler dev — http://localhost:8787
```

Real-user installs go through the install Skill — see the
[Mantle install brief](https://github.com/AotterClam/mantle/blob/main/skills/install/SKILL.md)
and the [`intake` archetype brief](https://github.com/AotterClam/mantle/blob/main/skills/install/archetypes/intake.md).
