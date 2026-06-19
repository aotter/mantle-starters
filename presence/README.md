# `mantle-starters/presence`

> **This README ships with your scaffolded project.** If you're reading
> it on GitHub at `aotter/mantle-starters/presence`, the
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
> npx https://github.com/aotter/mantle-starters/releases/download/v0.0.11-alpha.13/aotter-create-mantle.tgz presence \
>   --project-name eval-presence \
>   --brand "Eval Presence" \
>   --description "Throwaway presence mantle evaluation" \
>   --locales "en" \
>   --github-owner "<your-github-login>" \
>   --summary "Evaluate presence starter"
> cd /tmp/eval-presence
> # then follow the Getting-started block below in that directory
> ```
>
> Or use the Mantle landing page: answer the launch questions, sign in
> with GitHub, then paste the generated launch command into your agent.
> It runs the same scaffolder through a short-lived launch session.

`presence` archetype starter for mantle v0.1.0 — a small public site
that exists to **be there**: landing page and secondary pages (About,
privacy, etc.). A CAPTCHA-gated contact form is available as the
optional `contact` feature overlay. Light on content, heavy on tone.

Backed by the same runtime + Cloudflare adapter as `publication` but
trimmed for the presence shape:

- **No `posts` / `post-translations` Schemas.** This is not a
  publication; the article-list logic is removed.
- **`pages` + `page-translations`** carries home, about, privacy, and
  any other URL-addressable pages.
- **Optional `contact` feature** adds the `contact-messages` Schema,
  `submit-contact` Procedure, contact route, and Turnstile-checked
  lifecycle hooks when selected during scaffold.

For an article-publishing starter, use [`publication/`](../publication/).
For a structured-form intake starter (RSVPs, lead capture, etc.), use
[`intake/`](../intake/).

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

Seed demo home + about pages and start the dev server:

```bash
pnpm fixture       # one-time: seeds dev D1/KV with demo home + about pages
pnpm dev           # safe wrangler dev — http://localhost:8787
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
canonical locale and the home page renders (`<!doctype html>` HTML,
not a JSON error) with your `--brand` filled in. `/<locale>/pages/about`
loads the seeded about page. If the optional `contact` feature was
selected, `/<locale>/pages/contact` renders the contact form.

Without `pnpm fixture`, `/<locale>/` and `/<locale>/pages/about` 404 —
the miniflare D1/KV start empty and the home / about routes look up
`page-translations` rows that don't exist yet.

The fixture is intentionally demo-shaped — edit `test/fixture/data.ts`
to replace the placeholder copy with content that introduces your site,
or author through `/admin` after signing in.

`pnpm validate` defaults to the **preview** phase — grammar + cross-Schema
checks only, so `pnpm dev` is unblocked during local iteration. Before
deploying, run the production check:

```bash
pnpm validate:deploy   # = `mantle validate --phase deploy`
```

It runs any pre-deploy-only checks. `pnpm deploy` chains it in front of
`wrangler deploy`, so the manual form is only needed for an ahead-of-time
check.

Real-user installs go through the install Skill — see the
[Mantle install brief](https://github.com/aotter/mantle/blob/main/skills/install/SKILL.md)
and the [`presence` archetype brief](https://github.com/aotter/mantle/blob/main/skills/install/archetypes/presence.md).

## Replacing the example

1. `manifests/pages.yaml` — adjust the page Schema if you want
   additional fields (e.g. hero image URL, CTA copy).
2. Optional contact behavior lives under the `contact` feature overlay;
   select it during scaffold when the site needs a contact form.
3. `src/theme/` — customize visual tokens via `pnpm theme:fork
   tokens.ts`. See [`skills/customize-design`](https://github.com/aotter/mantle/blob/main/skills/customize-design/SKILL.md).
4. `pnpm validate` after any manifest edit.
