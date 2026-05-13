# `themes/l4-editorial-journal`

L4-tier editorial-journal theme. Ported from the retired
`blog-editorial-2026-05-05` starter's visual system — a quiet literary
journal: warm paper, dark ink, narrow measure, Fraunces display +
Source Serif 4 body, vermilion accent.

Full design reference (typography behaviors, page chrome, drop cap,
post-list grid, contact-form styling) lives upstream at
[`clam-cms/docs/design-references/editorial-blog-2026-05-05.md`](https://github.com/AotterClam/clam-cms/blob/main/docs/design-references/editorial-blog-2026-05-05.md).

## What's in this stub

The v0.0.9 mechanism stub covers **tokens + body-level type
behavior** only. Token table (matches the design reference):

| Token | Light | Dark | Role |
|---|---:|---:|---|
| `--paper` | `#f6f1e7` | `#1a1814` | Page background |
| `--ink` | `#1a1814` | `#f1ebdf` | Primary text |
| `--rule` | `#d4c8b3` | `#3d342a` | Hairlines |
| `--rule-strong` | `#3d342a` | `#5a4d40` | Form underlines, stronger separators |
| `--mute` | `#7a6d5e` | `#9a8d7e` | Metadata, secondary copy |
| `--accent` | `#a3331f` | `#e6594a` | Links, drop caps |
| `--accent-soft` | `#c9614a` | `#c9614a` | Secondary accent |
| `--selection` | `#f0d6a3` | `#4a3520` | Text selection |
| `--font-display` | — | — | Fraunces / Noto Serif TC / Source Serif 4 |
| `--font-body` | — | — | Source Serif 4 / Noto Serif TC |
| `--font-mono` | — | — | JetBrains Mono |
| `--measure` | `38rem` | — | Article measure |
| `--gutter` | `clamp(1.25rem, 4vw, 3rem)` | — | Responsive page padding |
| `html font-size` | `18px` | — | Reading-first default |
| `body line-height` | `1.65` | — | Long-form prose rhythm |
| `body font-feature-settings` | `kern`, `liga`, `onum` | — | OpenType behaviors |

## What's NOT in this stub (artist-tier deliverables)

These come from the source reference but require component / template
overrides that aren't part of the v0.0.9 mechanism stub scope:

- **Wordmark** — vermilion middle dot between brand words, display serif
- **Hero block** — mono eyebrow + large display title + muted intro
- **Post drop cap** — vermilion editorial drop cap on first body paragraph
- **Post-list grid** — fixed `7rem` date rail + flexible title/excerpt column; collapses to one column on narrow screens
- **Sticky header** — translucent paper background (`color-mix` + `saturate(140%)` + `blur(10px)`)
- **Theme/language popovers** — mono trigger styling, menuitemradio semantics
- **Contact form** — uppercase mono labels, underline-only inputs, inverted ink/paper submit
- **404** — centered huge display-serif `404` in accent
- **Heading scale** — `h1` `2.2rem → 3.4rem`; hero `h1` to `4rem`; Fraunces variable optical sizing (`opsz`, `SOFT`)
- **Metadata typography** — JetBrains Mono `0.75rem`, uppercase, `0.04em` tracking
- **Paragraph rhythm** — `p + p { text-indent: 1.5em }`; post body resets first-paragraph indent

When artist deliverables land, they slot under `src/theme/components/`
and `src/theme/templates/` per the
[`customize-design` skill](https://github.com/AotterClam/clam-cms/blob/main/skills/customize-design/SKILL.md).

## Status

Stub. Mechanism-only — tokens land at `src/theme/tokens.ts` in the
user's project. Mechanism is wired; component-level visual deliverables
pending. Track at
[Epic AotterClam/clam-cms#116](https://github.com/AotterClam/clam-cms/issues/116).
