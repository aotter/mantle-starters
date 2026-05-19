# `mantle-starters/presence`

> **This README ships with your scaffolded project.** If you're reading
> it on GitHub at `AotterClam/mantle-starters/presence`, the
> Getting-started block below **does not work on a raw clone** —
> `src/clamConfig.ts` contains literal `{{BRAND}}` / `{{LOCALES}}` /
> `{{DESCRIPTION}}` placeholders that the `create-mantle` scaffolder
> substitutes at install time. A fresh-clone `pnpm dev` throws
> `SyntaxError: Expected property name or '}' in JSON` at boot.
>
> **To evaluate this starter end-to-end**, scaffold a throwaway site:
>
> ```bash
> cd /tmp
> npx https://github.com/AotterClam/mantle-starters/releases/latest/download/aotterclam-create-mantle.tgz presence \
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
> Or paste the two-URL prompt from <https://mantle.aotterclam.ai/> into
> your agent. See the [top-level README](../README.md) for the template
> model.

`presence` archetype starter for mantle v0.1.0 — a small public site
that exists to **be there**: landing page, secondary pages
(About, Contact, etc.), and a CAPTCHA-gated contact form. Light on
content, heavy on tone.

Backed by the same runtime + Cloudflare adapter as `publication` but
trimmed for the presence shape:

- **No `posts` / `post-translations` Schemas.** This is not a
  publication; the article-list logic is removed.
- **`pages` + `page-translations`** carries home, about, contact, and
  any other URL-addressable pages.
- **Contact form** wired via the `contact-messages` Schema +
  `submit-contact` Procedure + Turnstile-checked lifecycle hooks.

For an article-publishing starter, use [`publication/`](../publication/).
For a structured-form intake starter (RSVPs, lead capture, etc.), use
[`intake/`](../intake/).

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

Seed demo home + about pages and start the dev server:

```bash
pnpm fixture       # one-time: seeds dev D1/KV with demo home + about pages
pnpm dev           # wrangler dev — http://localhost:8787
```

Open <http://localhost:8787>. The root URL 302-redirects to your
canonical locale and the home page renders (`<!doctype html>` HTML,
not a JSON error) with your `--brand` filled in. `/<locale>/pages/about`
loads the seeded about page; `/<locale>/pages/contact` renders the
contact form (template-only — no DB row needed even without the fixture).

Without `pnpm fixture`, `/<locale>/` and `/<locale>/pages/about` 404 —
the miniflare D1/KV start empty and the home / about routes look up
`page-translations` rows that don't exist yet. The contact page still
renders.

The fixture is intentionally demo-shaped — edit `test/fixture/data.ts`
to replace the placeholder copy with content that introduces your site,
or author through `/admin` after signing in.

`pnpm validate` defaults to the **preview** phase — grammar + cross-Schema
checks only. It exits 0 on a fresh scaffold even when the Mantle welcome
letter is still a placeholder, so `pnpm dev` is unblocked during local
iteration. Before deploying, run the strict gate:

```bash
pnpm validate:deploy   # = `mantle validate --phase deploy`
```

It re-enables `MANTLE_LETTER_NOT_WRITTEN` and any future pre-deploy-only
checks. `pnpm deploy` chains it in front of `wrangler deploy`, so the
manual form is only needed for an ahead-of-time check.

Real-user installs go through the install Skill — see the
[Mantle install brief](https://github.com/AotterClam/mantle/blob/main/skills/install/SKILL.md)
and the [`presence` archetype brief](https://github.com/AotterClam/mantle/blob/main/skills/install/archetypes/presence.md).

## Replacing the example

1. `manifests/pages.yaml` — adjust the page Schema if you want
   additional fields (e.g. hero image URL, CTA copy).
2. `manifests/contact.yaml` — drop entirely if your presence site
   doesn't need a contact form, or tighten the Schema if you want
   additional contact fields.
3. `src/theme/` — customize visual tokens via `pnpm theme:fork
   tokens.ts`. See [`skills/customize-design`](https://github.com/AotterClam/mantle/blob/main/skills/customize-design/SKILL.md).
4. `pnpm validate` after any manifest edit.
