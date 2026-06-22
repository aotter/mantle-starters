# `mantle-starters/blank`

> **This README ships with your scaffolded project.** If you're reading
> it on GitHub at `aotter/mantle-starters/blank`, the
> Getting-started block below **does not work on a raw clone** —
> `src/mantleConfig.ts` contains literal `{{BRAND}}` / `{{LOCALES}}` /
> `{{DESCRIPTION}}` placeholders that Mantle landing substitutes while
> committing the provision bundle. A fresh-clone `pnpm dev` throws
> `SyntaxError: Expected property name or '}' in JSON` at boot.
>
> **To evaluate this starter end-to-end**, use the Mantle landing
> provisioning flow. It fetches `provision-bundles/<type>.json`,
> substitutes these placeholders, commits the repo, and starts
> Cloudflare Workers CI.

**Headless CMS starter.** Ships zero UI. Use this when you have your own
frontend (Next.js, Astro, SvelteKit, native iOS/Android, partner
integration) and want mantle purely as a content + auth + MCP backend.

Type-specific bundles include the selected manifest, overlay notes, and
seed prompt up front. Continue from the after-launch handoff shown by
Mantle landing.

## Kiwa UI Credit

This starter includes selected free [Kiwa UI](https://kiwaui.com/)
primitives copied into `components/ui/`, plus `lib/utils.ts`,
`styles/globals.css`, and `kiwa-ui.json`. Kiwa source is MIT licensed;
see `kiwa/LICENSE` and `kiwa/manifest.json` for the copied files and
upstream commit.

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

## Layout

```
mantle-starters/blank/
├── manifests/example.yaml     # one-file demo: Schema + View
├── src/
│   ├── index.ts               # worker entrypoint (mountServerEndpoints + mountMcp)
│   ├── mantleConfig.ts          # env + manifests + handlers wiring
│   ├── loadManifests.ts
│   ├── handlers/index.ts      # empty registry — add Procedure handlers here
│   └── types.d.ts
├── package.json
├── tsconfig.json
└── wrangler.toml
```

## Getting started

```bash
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
```

> `--frozen-lockfile` matches what CI runs. Without it a local install
> can quietly regenerate `pnpm-lock.yaml` against any dep version
> published since the lockfile was committed; the drift only surfaces
> when CI rejects it.

The headless `/` preview works without auth. Fill
`BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and
`ADMIN_GITHUB_LOGIN` only when you want to exercise `/api/auth/*` or
Staff MCP locally. Then:

```bash
pnpm dev      # safe wrangler dev — http://localhost:8787
```

Hit `GET http://localhost:8787/api/views/published-notes` to see the
example View executing against an empty `notes` collection.

Production repos are created by Mantle landing. Landing substitutes the
launch placeholders, commits this bundle, and either connects Cloudflare
Workers CI or records the provider action the user still needs to take.

> **Note:** `blank` is the headless starter; there is no `/admin` UI and
> the `GITHUB_*` / `ADMIN_GITHUB_LOGIN` placeholders in `.dev.vars` are
> only consumed if you mount the optional MCP/admin auth surfaces. Plain
> `/api/views/*` works without them.

## Replacing the example

1. Open `manifests/example.yaml`.
2. Edit or replace the `Schema` and `View` to match your content.
3. If you need server-side Procedures (form handlers, webhooks, etc.),
   add a `Procedure` atom, bind it with a `Trigger.source.kind: http`,
   and register the handler in `src/handlers/index.ts`.
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
