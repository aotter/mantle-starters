---
archetype: presence
status: ready
starter_repo: aotter/mantle-starters
starter_path: presence
overlays: []
---

# `presence` archetype

Follow the [Mantle install brief](https://raw.githubusercontent.com/aotter/mantle/main/skills/install/SKILL.md). This file only adds archetype-specific register and product-shape hints.

## What this is

A small public site that exists to **be there** — a brand page, an event page, a personal page, a quiet hotel-lobby kind of presence. Light on content, heavy on tone. Own starter directory in `mantle-starters/presence/`; trimmed for the presence shape (`pages` + `page-translations`; no `posts`). Contact form behavior is opt-in via the `contact` feature overlay.

## Interview probes to emphasize

- **What single thing** do you want a first visitor to feel or remember?
- Is there a person, a place, or a thing this is "about"?
- Any concrete fact a visitor must be able to find (address, hours, a date)?
- Anything you want to leave out on purpose? (Often emotionally weighted.)

## Site defaults

- **Mood default:** minimal / editorial. Lean spare.
- **Ready-state wording:** quiet. (zh-TW illustrative: "上線" beats "開站"; "建好" beats "完成". In the user's language, pick the natural verb at the same restrained register; don't translate.)
- **Avoid:** marketing voice, growth-language, "join the journey" framing.

## Post-deploy first content task

Use this only after production provision and owner sign-in. It is not an
install-time prompt and should not block scaffold or deploy.

```text
打開後台，列出目前的 collections。再幫我把首頁 "{{BRAND}}" 的內容草稿補上：一句話的開場 + 三個你從 launch-state / AGENTS.md 看到的關鍵點。先不要發佈，等我看過。
```

(EN equivalent, illustrative — render natively in the user's language:)
```text
Open the admin and list the current collections. Then draft the home for "{{BRAND}}": one opening sentence + three points drawn from launch-state / AGENTS.md. Leave it as a draft so I can read it before publishing.
```

## Schema/View/Procedure extensions

None. `presence` ships ready-to-go. Customization belongs in [`skills/customize-design`](https://raw.githubusercontent.com/aotter/mantle/main/skills/customize-design/SKILL.md) after deploy.
