# `mantle-starters/intake`

> **This README ships with your scaffolded project.** If you're reading
> it on GitHub at `aotter/mantle-starters/intake`, the
> Getting-started block below **does not work on a raw clone** —
> `src/mantleConfig.ts` contains literal `{{BRAND}}` / `{{LOCALES}}` /
> `{{DESCRIPTION}}` placeholders that the `create-mantle` scaffolder
> substitutes at install time. A fresh-clone `pnpm dev` throws
> `SyntaxError: Expected property name or '}' in JSON` at boot.
>
> **To evaluate this starter end-to-end**, scaffold a throwaway site:
>
> ```bash
> cd /tmp
> npx https://github.com/aotter/mantle-starters/releases/download/v0.0.11-alpha.13/aotter-create-mantle.tgz intake \
>   --project-name eval-intake \
>   --brand "Eval Intake" \
>   --description "Throwaway intake mantle evaluation" \
>   --locales "en" \
>   --github-owner "<your-github-login>" \
>   --summary "Evaluate intake starter"
> cd /tmp/eval-intake
> # then follow the Getting-started block below in that directory
> ```
>
> Or use the Mantle landing page: answer the launch questions, sign in
> with GitHub, then paste the generated launch command into your agent.
> It runs the same scaffolder through a short-lived launch session.

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
[`skills/extend`](https://github.com/aotter/mantle/blob/main/skills/extend/SKILL.md).

## Getting started

```bash
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
```

> `--frozen-lockfile` matches CI; without it a local install can
> silently regenerate `pnpm-lock.yaml` against newer deps and the
> drift only surfaces when CI rejects it.

Public routes work without auth. Fill `BETTER_AUTH_SECRET`,
`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `ADMIN_GITHUB_LOGIN`
only when you want to exercise `/admin`, `/api/auth/*`, or Staff MCP
locally.
`TURNSTILE_SECRET_KEY=dev-stub` is fine for local development.

Seed demo content and start the dev server:

```bash
pnpm validate
pnpm fixture     # one-time: seeds dev D1/KV with demo posts + pages
pnpm dev         # safe wrangler dev — http://localhost:8787
```

Production installs use the shared provision flow:

```bash
pnpm run provision:plan
pnpm exec wrangler login
pnpm run provision:up -- --worker-url <worker_url> --github-username <github-login> --client-id <client-id>
```

Set `GITHUB_CLIENT_SECRET` in the environment before `provision:up`.
The script writes non-secret config and Worker secrets; it does not ask
for a Cloudflare API token.

Open <http://localhost:8787>. The root URL 302-redirects to your
canonical locale (`<!doctype html>` HTML, not a JSON error). Without
`pnpm fixture` every route 404s — the miniflare D1/KV start empty.
The intake's structured-lead form lives at `/api/leads` (anonymous
POST); the public storefront chrome mirrors publication's.

`pnpm validate` defaults to the **preview** phase (grammar + cross-Schema only),
so `pnpm dev` is unblocked during local iteration. Before deploying, run the
production check:

```bash
pnpm validate:deploy   # = `mantle validate --phase deploy`
```

It runs any pre-deploy-only checks. `pnpm deploy` already chains it in front of
`wrangler deploy`, so manual invocation is only needed when you want the check
without deploying.

Real-user installs go through the install Skill — see the
[Mantle install brief](https://github.com/aotter/mantle/blob/main/skills/install/SKILL.md)
and the [`intake` archetype brief](https://github.com/aotter/mantle/blob/main/skills/install/archetypes/intake.md).
