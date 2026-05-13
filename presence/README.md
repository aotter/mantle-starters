# `clam-cms-starters/presence`

`presence` archetype starter for clam-cms v0.1.0 — a small public site
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
pnpm validate
pnpm dev      # wrangler dev — http://localhost:8787
```

Real-user installs go through the install Skill — see the
[Mantle install brief](https://github.com/AotterClam/clam-cms/blob/main/skills/install/SKILL.md)
and the [`presence` archetype brief](https://github.com/AotterClam/clam-cms/blob/main/skills/install/archetypes/presence.md).

## Replacing the example

1. `manifests/pages.yaml` — adjust the page Schema if you want
   additional fields (e.g. hero image URL, CTA copy).
2. `manifests/contact.yaml` — drop entirely if your presence site
   doesn't need a contact form, or tighten the Schema if you want
   additional contact fields.
3. `src/theme/` — customize visual tokens via `pnpm theme:fork
   tokens.ts`. See [`skills/customize-design`](https://github.com/AotterClam/clam-cms/blob/main/skills/customize-design/SKILL.md).
4. `pnpm validate` after any manifest edit.
