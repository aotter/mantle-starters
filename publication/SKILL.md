---
archetype: publication
status: ready
starter_repo: AotterClam/clam-cms-starters
starter_path: publication
overlays: []
applies_to: clam-cms@v0.1.0
---

# `publication` archetype

Follow the [Mantle install brief](https://raw.githubusercontent.com/AotterClam/clam-cms/main/skills/install/SKILL.md). This file only adds the archetype-specific register hints; Mantle voice rules apply only to the closing welcome letter, not to interview / refuse / adjustment phases.

## What this is

A site that publishes — articles, notes, project updates, a docs-lite section, plus a basic contact form. The `publication` starter carries the Schemas (`posts`, `post-translations`, `pages`, `contact-messages`), the public read path via KV, and the lifecycle/Procedure scaffolding for CAPTCHA + Slack-notify.

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

- **Yes, keep it** — provision will wire up Turnstile + Slack notify
- **Skip — presence + social links is enough** — we'll remove the form during scaffold
- **Add later** — leave the scaffold, route through extend Skill post-deploy

### 5. Multilingual content modeling (separate from audience-scope / UI locale)

> "Will posts get translated, or is each post written in one language only?"

- **One language only** — no translation needed; `post-translations` schema unused
- **Selective translation** — some posts translated, primary language is canonical (`post-translations` joins on slug)
- **Full bilingual / multilingual content** — every post written in two-plus languages

## Site defaults

- **Mood default:** editorial / playful. Heavier than `presence` but still grounded.
- **card1 verb register:** active. Pick a verb in the user's language that says "this site is open to publish" / "the writing surface is live" — translate the register, don't transliterate.
- **Avoid:** SEO-marketing voice. The user almost never opened with "I want to rank for X."

## Editor first-prompt template (becomes card3 body)

Template is in EN as a placeholder. The install Skill's step that fills `## editor first_prompt:` renders it in the user's language with `{{BRAND}}` substituted.

```text
Open the admin and list the posts collection (should be empty). Draft a "Hello, {{BRAND}}" post: one paragraph introducing the site, one paragraph on why it exists. Match the voice in mantle/site.md. Leave as draft so I can review before publishing.
```

## Schema/View/Procedure extensions

None. The starter carries everything. If the user wants newsletter signup, search, or a public widget on top of `publication`, route them to [`skills/extend`](https://raw.githubusercontent.com/AotterClam/clam-cms/main/skills/extend/SKILL.md) **after** deploy — don't add manifests during install.
