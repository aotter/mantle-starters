---
archetype: publication
status: ready
starter_repo: aotter/mantle-starters
starter_path: publication
overlays: []
---

# `publication` archetype

Follow the [Mantle install brief](https://raw.githubusercontent.com/aotter/mantle/main/skills/install/SKILL.md). This file only adds archetype-specific register and product-shape hints.

## What this is

A site that publishes — articles, notes, project updates, and a docs-lite section. The `publication` starter carries the core Schemas (`posts`, `post-translations`, `pages`) and the public read path via KV. Basic contact form behavior is opt-in via the `contact` feature overlay.

## Interview probes (pickers — present one at a time, not all at once)

Each probe is a multiple-choice picker the user picks from. Ask one, react to the answer, then move to the next — multi-round conversation, not a flat checklist. The install Skill's "Multi-round purpose discovery" stance orchestrates this.

### 1. Purpose — what's this publication for? (ask first)

> "A few shapes this could be — pick what fits, or tell me something else:"

- **Personal log / journal** — training, parenting, hobbies, ongoing personal project
- **Subject-matter writing** — essays, analysis, tutorials, deep dives in a domain
- **Project / team news** — release notes, updates, changelog-as-blog
- **Brand-voice diary** — building in public, founder log, behind-the-scenes
- **Mixed** — multiple streams under one site
- **Something else** (let user describe)

### 2. Author shape (after purpose)

> "Who's writing? Just you, or a team?"

- **Solo author** — just me, period
- **Solo for now, maybe invite guests later** — bootstrap-owner-only constraint reads as "for now"
- **Multi-author team from day one** — multiple GitHub identities will need access

### 3. Publishing cadence (informs voice register)

> "What rhythm do you imagine?"

- **Irregular** — when there's something to say
- **Weekly-ish** — a regular slot but flexible
- **Daily / near-daily** — high frequency
- **Project-tied** — drops when something ships, otherwise quiet

### 4. Contact form (the publication starter scaffolds it; user opts in or out)

> "There's a contact form scaffolded — readers can reach you directly. Want it?"

- **Yes, keep it** — first deploy still works; wire Turnstile after launch from Cloudflare dashboard + agent handoff
- **Skip — presence + social links is enough** — we'll remove the form during scaffold
- **Add later** — leave the scaffold, route through extend Skill post-deploy

### 5. Multilingual content modeling (separate from audience-scope / UI locale)

> "Will posts get translated, or is each post written in one language only?"

- **One language only** — no translation needed; `post-translations` schema unused
- **Selective translation** — some posts translated, primary language is canonical (`post-translations` joins on slug)
- **Full bilingual / multilingual content** — every post written in two-plus languages

## Site defaults

- **Mood default:** editorial / playful. Heavier than `presence` but still grounded.
- **Ready-state wording:** active. Pick a verb in the user's language that says "this site is open to publish" / "the writing surface is live" — translate the register, don't transliterate.
- **Avoid:** SEO-marketing voice. The user almost never opened with "I want to rank for X."

## Post-deploy first content task

Use this only after production provision and owner sign-in. It is not an
install-time prompt and should not block scaffold or deploy.

```text
Open the admin and list the posts collection (should be empty). Draft a "Hello, {{BRAND}}" post: one paragraph introducing the site, one paragraph on why it exists. Use the launch-state / AGENTS.md context for voice. Leave as draft so I can review before publishing.
```

## Schema/View/Procedure extensions

None. The starter carries everything. If the user wants newsletter signup, search, or a public widget on top of `publication`, route them to [`skills/extend`](https://raw.githubusercontent.com/aotter/mantle/main/skills/extend/SKILL.md) **after** deploy — don't add manifests during install.
