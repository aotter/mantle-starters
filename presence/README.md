# `mantle-starters/presence`

> **This README ships with your scaffolded project.** If you're reading
> it on GitHub at `AotterClam/mantle-starters/presence`, the
> Getting-started block below **does not work on a raw clone** —
> `src/clamConfig.ts` contains literal `{{BRAND}}` / `{{LOCALES}}` /
> `{{DESCRIPTION}}` placeholders that `@aotterclam/create-mantle`
> substitutes at install time. A fresh-clone `pnpm dev` throws
> `SyntaxError: Expected property name or '}' in JSON` at boot.
>
> **To evaluate this starter end-to-end**, scaffold a throwaway site:
>
> ```bash
> npm create @aotterclam/mantle@alpha /tmp/eval-presence
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

Then:

```bash
pnpm validate
pnpm dev      # wrangler dev — http://localhost:8787
```

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
