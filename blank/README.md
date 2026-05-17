# `mantle-starters/blank`

> **This README ships with your scaffolded project.** If you're reading
> it on GitHub at `AotterClam/mantle-starters/blank`, the
> Getting-started block below **does not work on a raw clone** —
> `src/clamConfig.ts` contains literal `{{BRAND}}` / `{{LOCALES}}` /
> `{{DESCRIPTION}}` placeholders that `@aotterclam/create-mantle`
> substitutes at install time. A fresh-clone `pnpm dev` throws
> `SyntaxError: Expected property name or '}' in JSON` at boot.
>
> **To evaluate this starter end-to-end**, scaffold a throwaway site:
>
> ```bash
> npm create @aotterclam/mantle@alpha /tmp/eval-blank
> cd /tmp/eval-blank
> # then follow the Getting-started block below in that directory
> ```
>
> Or paste the two-URL prompt from <https://mantle.aotterclam.ai/> into
> your agent. See the [top-level README](../README.md) for the template
> model.

**Headless CMS starter.** Ships zero UI. Use this when you have your own
frontend (Next.js, Astro, SvelteKit, native iOS/Android, partner
integration) and want mantle purely as a content + auth + MCP backend.

If you want a working public site out of the box with HTML chrome,
i18n, theme stack, and contact form, use the sibling
[`publication/`](../publication/) starter instead.

## URL surface

```
GET  /api/views/<name>            view REST per View atom
METHOD <trigger path>             manifest-declared HTTP Trigger routes
ALL  /staff/mcp                   Staff MCP JSON-RPC dispatcher
ALL  /mcp                         User/read MCP JSON-RPC dispatcher
```

No public read routes (`/{locale}/...`, `/sitemap.xml`, `.md` mirrors,
`llms.txt`). Add `mountPublicRoutes` from
`@aotterclam/mantle/cloudflare` if you change your mind.

### Auth

MCP requests must carry a verified bearer token. The runtime's
Cloudflare adapter now uses Better Auth for browser sign-in and MCP
OAuth/DCR. `publication` wires the production-ready dual MCP surface
(`/staff/mcp` for staff authoring, `/mcp` for end-user/read tools).
`blank` wires the same Better Auth factory and dual mounts, but ships
no public HTML. Add your own frontend and policy surface before
claiming a custom production workflow.

## Layout

```
mantle-starters/blank/
├── manifests/example.yaml     # one-file demo: Schema + View
├── src/
│   ├── index.ts               # worker entrypoint (mountServerEndpoints + mountMcp)
│   ├── clamConfig.ts          # env + manifests + handlers wiring
│   ├── loadManifests.ts
│   ├── handlers/index.ts      # empty registry — add Procedure handlers here
│   └── types.d.ts
├── package.json
├── tsconfig.json
└── wrangler.toml
```

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

Then:

```bash
pnpm dev      # wrangler dev — http://localhost:8787
```

Hit `GET http://localhost:8787/api/views/published-notes` to see the
example View executing against an empty `notes` collection.

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
4. Validate with `pnpm validate` (runs the spec CLI).

## What you get from the npm packages

`@aotterclam/mantle/cloudflare` mounts the routes above against
`@aotterclam/mantle/runtime` use cases. Nothing is starter-specific
once you've wired the bindings — bearer-token MCP auth, view executor,
and HTTP Trigger dispatcher all come straight from the runtime packages.

If your frontend renders posts (or anything you'd like to expose for
LLM crawlers), the runtime can ship an `.md` mirror of any entry; see
`@aotterclam/mantle/runtime/serializeEntryAsMarkdown` and
`composeLlmsTxt`.
