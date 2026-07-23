# `mantle-starters/blank`

> **This README ships with your materialized project.** If you're reading
> it on GitHub at `aotter/mantle-starters/blank`, the
> Getting-started block below **does not work on a raw clone** —
> `src/mantle/config.ts` contains literal `{{BRAND}}` / `{{LOCALES}}` /
> `{{DESCRIPTION}}` placeholders that the provision flow substitutes.
>
> **To evaluate this starter end-to-end**, run `pnpm materialize <type>
> --out <dir>` from the repository root, or use Mantle landing for the
> hosted GitHub and Cloudflare flow.

**Blank-first Mantle starter.** Ships a Hono/Cloudflare Worker runtime,
Mantle API/MCP surfaces, and a seed-driven Hono JSX public page. `blank`
has the full project skeleton but no visible homepage sections; typed
launches such as `presence`, `publication`, and `intake` fill
`src/web/content/*` and selected `manifests/*.yaml`.

Type-specific bundles include the selected manifest, overlay notes, and
seed prompt up front. Continue from `.mantle/handoff.md` in the generated
project.

## Kiwa UI Credit

This starter includes selected free [Kiwa UI](https://kiwaui.com/)
primitives copied into `components/ui/`, plus `lib/utils.ts`,
`styles/globals.css`, and `kiwa-ui.json`. Kiwa source is MIT licensed;
see `kiwa/LICENSE` and `kiwa/manifest.json` for the copied files and
upstream commit.

## Project shape

```txt
src/
  index.ts                    # Worker fetch entrypoint
  renderer.tsx                # Hono JSX document renderer
  worker/
    app.ts                    # Hono app composition + OAuth/MCP wrapper
    auth.ts                   # Better Auth setup boundary
    routes/
      home.tsx                # c.render(<HomePage />)
      assets.ts               # generated CSS, SVGs, Kiwa enhance JS
    features/                 # type overlays add server behavior here
  web/
    pages/HomePage.tsx        # public page body
    content/                  # seed-driven site/home content modules
    client/                   # browser behavior served as /assets/kiwa-home.js
    mantleOceanHero.ts        # Mantle SVG assets
  mantle/
    config.ts                 # CmsConfig/env/bindings
    manifests.ts              # loads root manifests/*.yaml
    handlers/index.ts         # Procedure handler registry

manifests/                    # 4 atoms: Schema, View, Procedure, Trigger
components/, lib/, styles/     # Kiwa-managed convention; keep root-level
.mantle/                      # launch state, overlay notes, handoff
```

`manifests/` is the authoritative Mantle model. `src/mantle/*` only
wires those atoms to the Cloudflare adapter. Kiwa components stay at
root because `kiwa-ui.json` follows Kiwa's `@/components` and
`@/lib/utils` convention.

## URL surface

```
GET  /api/views/<name>            view REST per View atom
METHOD <trigger path>             manifest-declared HTTP Trigger routes
ALL  /mcp/staff                   Staff MCP JSON-RPC dispatcher
ALL  /mcp                         User/read MCP JSON-RPC dispatcher
```

No public read routes (`/{locale}/...`, `/sitemap.xml`, `.md` mirrors,
`llms.txt`). Add `mountPublicRoutes` from
`@aotter/mantle/cloudflare` if you change your mind.

### Auth

MCP requests must carry a verified bearer token. The runtime's
Cloudflare adapter now uses Better Auth for browser sign-in and MCP
OAuth/DCR. This starter wires the dual MCP surface (`/mcp/staff` for
staff authoring, `/mcp` for end-user/read tools), but ships only a small
public homepage for `/`. Add your own frontend and policy surface before
claiming a custom production workflow.

## Getting started

```bash
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
```

> `--frozen-lockfile` matches what CI runs. Without it a local install
> can quietly regenerate `pnpm-lock.yaml` against any dep version
> published since the lockfile was committed; the drift only surfaces
> when CI rejects it.

The headless `/` preview works without auth. Mantle Platform hosted auth
uses `MANTLE_PLATFORM_AUTH_ISSUER`, `MANTLE_PLATFORM_AUTH_CLIENT_ID`,
and `MANTLE_SITE_OWNER_EMAIL`. Hosted clients use public PKCE by default;
`MANTLE_PLATFORM_AUTH_CLIENT_SECRET` is only needed if you later register a
confidential hosted client.
Standalone/self-hosted auth can still use `GITHUB_CLIENT_ID`,
`GITHUB_CLIENT_SECRET`, and `ADMIN_GITHUB_LOGIN`. Fill one auth path only
when you want to exercise `/api/auth/*` or Staff MCP locally. Then:

```bash
pnpm dev      # safe wrangler dev — http://localhost:8787
```

Hit `GET http://localhost:8787/api/views/published-notes` to see the
example View executing against an empty `notes` collection. Type-specific
bundles replace that loader with their selected manifest.

For production, push the generated repo and configure Cloudflare, or use
Mantle landing to automate the GitHub and Cloudflare steps.

> **Note:** `blank` has no visitor homepage sections, but it does mount
> `/admin`, `/api/auth/*`, and Staff MCP. Those surfaces need either
> Mantle Platform hosted auth or self-hosted GitHub OAuth. Plain
> `/api/views/*` works without auth.

## Replacing the example

1. Open `manifests/example.yaml`.
2. Edit or replace the `Schema` and `View` to match your content.
3. If you need server-side Procedures (form handlers, webhooks, etc.),
   add a `Procedure` atom, bind it with a `Trigger.source.kind: http`,
   and register the handler in `src/mantle/handlers/index.ts`.
4. Validate with `pnpm validate` (runs the spec CLI in preview phase — grammar + cross-Schema only). Before deploying, run `pnpm validate:deploy` (= `mantle validate --phase deploy`) for production-only checks. `pnpm run deploy` chains it in front of `wrangler deploy` automatically.

## What you get from the npm packages

`@aotter/mantle/cloudflare` mounts the routes above against
`@aotter/mantle/runtime` use cases. Nothing is starter-specific
once you've wired the bindings — bearer-token MCP auth, view executor,
and HTTP Trigger dispatcher all come straight from the runtime packages.

If your frontend renders posts (or anything you'd like to expose for
LLM crawlers), the runtime can ship an `.md` mirror of any entry; see
`@aotter/mantle/runtime/serializeEntryAsMarkdown` and
`composeLlmsTxt`.
