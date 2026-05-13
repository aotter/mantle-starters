# `clam-cms-starters/intake`

`intake` archetype starter for clam-cms v0.1.0 — public site that
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
[`skills/extend`](https://github.com/AotterClam/clam-cms/blob/main/skills/extend/SKILL.md).

## Getting started

```bash
pnpm install
pnpm validate
pnpm dev      # wrangler dev — http://localhost:8787
```

Real-user installs go through the install Skill — see the
[Mantle install brief](https://github.com/AotterClam/clam-cms/blob/main/skills/install/SKILL.md)
and the [`intake` archetype brief](https://github.com/AotterClam/clam-cms/blob/main/skills/install/archetypes/intake.md).
