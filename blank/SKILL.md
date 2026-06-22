---
archetype: blank
status: ready
starter_repo: aotter/mantle-starters
starter_path: blank
overlays: []
---

# `blank` archetype

Follow the [Mantle install brief](https://raw.githubusercontent.com/aotter/mantle/main/skills/install/SKILL.md). This file only adds archetype-specific register and product-shape hints.

## What this is

Blank is the launch base for new Mantle provisioning. It starts as a
small deployable Mantle backend — API + MCP first, minimal public
surface — and the user's coding agent grows the selected type on top
after the first Cloudflare deploy succeeds.

## Interview probes to emphasize

- Confirm the selected type intent from `.mantle/launch-state.json`.
- Ask what the first useful page or workflow should prove.
- Identify the first Schema/View pair and seed only tiny example data.
- Decide whether the first UI should be built in this Worker or whether the user is bringing an external frontend.

## Site defaults

- **Mood default:** no premade theme. Apply brand and L4 direction with the user after the first deploy.
- **Ready-state wording:** concrete and active. (zh-TW illustrative: "網站已上線，接著做第一個頁面"; EN illustrative: "the site is live; next we shape the first page".)
- **Avoid:** theme picker language and copying old starter directories wholesale.

## Post-deploy first content task

Use this only after production provision and owner sign-in. It is not an
install-time prompt and should not block scaffold or deploy.

```text
打開後台，先列出目前的 collections（example 應該還在）。再讓我看一下 /api/views/published-notes 在空 collection 下回什麼。然後 propose 一個第一個真正要用的 Schema 草稿 — 我會直接改 manifests YAML，不要 apply。
```

(EN illustrative:)
```text
Open the live Workers URL and confirm the blank site boots. Then read `.mantle/launch-state.json`, propose the first small 4-atoms manifest for the selected type, and seed one tiny example in my default language before changing layout code.
```

## Schema/View/Procedure extensions

Defer real schema design until after deploy. The starter ships exactly
one demo Schema/View (`notes` / `published-notes`); replace or remove
it when the first type overlay lands.

## See also

- [`skills/extend`](https://raw.githubusercontent.com/aotter/mantle/main/skills/extend/SKILL.md) — designing the user's real Schemas / Views / Procedures / Triggers.
