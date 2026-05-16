---
archetype: intake
status: ready
starter_repo: AotterClam/clam-mantle-starters
starter_path: intake
overlays: []
applies_to: clam-mantle@v0.1.0
---

# `intake` archetype

Follow the [Mantle install brief](https://raw.githubusercontent.com/AotterClam/clam-mantle/main/skills/install/SKILL.md). This file only adds the archetype-specific register hints; Mantle voice rules apply only to the closing welcome letter, not to interview / refuse / adjustment phases.

## What this is

A public site that **takes structured input** from visitors — leads, signups, applications, requests-for-quote — beyond the basic contact form. Own starter directory in `clam-mantle-starters/intake/`; ships the publication shape (landing + articles + contact) plus a structured `leads` Schema with `leads-recent` View and CAPTCHA + Slack-notify lifecycle.

## Interview probes to emphasize

- **What's the one decision** the form helps the user make about each lead? (Reply / qualify / route — informs the Schema fields.)
- Are submitters anonymous, or do they self-identify by email? (Almost always email; confirm.)
- Will the same person see all leads, or will there be assignment later? (Assignment is `leads-inbox` territory; flag if it comes up.)
- Any one piece of info that disqualifies a lead instantly? (Captured as a Procedure validation, not a UI field.)

## Site defaults

- **Mood default:** clear / functional. Light on flourish — users come to ask for something.
- **card1 verb register:** open-for-business. (zh-TW illustrative: "開始收件", "可以開始接洽"; pick the natural verb that says "ready to receive submissions".)
- **Avoid:** anything that hides what happens to the lead after submission. Form transparency is part of trust.

## Editor first-prompt template (becomes card3 body)

```text
打開後台，看一下 leads collection — 應該是空的。然後幫我把 "{{BRAND}}" 首頁的開場改一下：一句話講這個 form 是收什麼的、幾天內會回覆。語氣參考 mantle/site.md。draft，等我看過。
```

(EN illustrative:)
```text
Open the admin and look at the leads collection (should be empty). Then update the home opener for "{{BRAND}}": one sentence on what the form is for and the response window. Match the voice in mantle/site.md. Draft for my review.
```

## Schema/View/Procedure shape

The starter ships:

- **Schema `leads`** — name, email, company, need, timeline, `leadStatus` (NOT the reserved `status` column; pipeline values `new` / `qualified` / `contacted` / `won` / `lost`).
- **View `leads-recent`** — staff-only, all leads desc by `createdAt`.
- **Procedure `submit-lead`** — `handler.kind: builtin`, `op: create`, `schema: leads`. CAPTCHA `before_create` (`errorPolicy: abort`); Slack-notify `after_create` (default `errorPolicy: continue`).
- **Trigger** — `source.kind: http`, `path: /api/leads`, gated to anonymous.

If the interview surfaces additional fields the lead actually needs, edit `manifests/leads.yaml` directly during the adjustment window. If the user wants assignment / qualification / pipeline state-machine workflow, they're asking for `leads-inbox`, which is **roadmap**. Acknowledge, deliver `intake` as a holding pattern, mark the future in `mantle/site.md` `futures:`.

## See also

- [`skills/extend`](https://raw.githubusercontent.com/AotterClam/clam-mantle/main/skills/extend/SKILL.md) — adding additional Schemas / Views / Procedures / Triggers after install.
