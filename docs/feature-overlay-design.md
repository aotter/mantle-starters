# Feature Overlay Design

Status: proposal
Target repository: `aotter/mantle-starters`
Primary public domain: `https://mantle.tools/`

## Summary

Mantle feature overlays should follow a shadcn-style source registry model:
metadata-driven install, source copied into the generated app, and a small
amount of generated glue for integration points.

The goal is not to build a runtime plugin system or a new package manager. The
goal is to make optional application behavior installable as source recipes:

- developers and AI agents can inspect and edit the resulting source;
- the scaffolder can resolve feature dependencies without guessing;
- shared integration files are composed intentionally instead of overwritten;
- the generated project records which features were installed.

This keeps the core starter minimal while preserving the "you own the code"
philosophy.

## Design Principles

### 1. Source-first, not package-first

Feature behavior that product teams customize should be copied as source into
the generated app.

Examples:

- contact form template and route
- Slack notification handler
- customer account pages
- wishlist UI
- email sender stubs
- feature-specific provision steps
- localized copy

Stable primitives can remain in packages:

- `@aotter/mantle`
- runtime helpers
- Cloudflare helper functions
- provision helper APIs
- registry/compose utility code

This is the same split as shadcn-style source recipes: package the substrate,
copy the application code.

### 2. Registry metadata is the entry point

The scaffolder should never infer feature identity from physical directory
layout alone. A feature is declared by a registry item.

The registry item says:

- canonical feature name;
- applicable archetypes;
- registry dependencies;
- npm dependencies;
- source files to copy;
- compose fragments to process;
- optional variants.

The filesystem layout can be friendly, but the registry metadata is the source
of truth.

### 3. Minimal archetype core

Archetype directories should contain only the minimal default behavior for that
archetype.

For example, `publication`, `presence`, and `intake` should not ship a contact
form by default. `contact` is an opt-in feature. If the user never asks for it,
the contact source, routes, Turnstile config, lifecycle hooks, and provision
steps should never enter the project.

### 4. Generated glue, not whole-file clobbering

Features should not overwrite application integration files such as:

- `src/index.ts`
- `src/loadManifests.ts`
- `src/handlers/index.ts`
- `src/mantleConfig.ts`
- `scripts/provision.mjs`
- `wrangler.toml`

Those files are integration points. Letting feature layers overwrite them
silently recreates the same failure mode that feature overlays are meant to
solve.

Instead, features provide source files and compose fragments. The scaffolder
generates glue files such as:

- `src/.mantle/generated.manifests.ts`
- `src/.mantle/generated.handlers.ts`
- `src/.mantle/generated.routes.ts`
- `src/.mantle/generated.env.d.ts`
- `scripts/.mantle-provision.mjs`

The app core imports generated registries.

### 5. Default-deny collision policy

If two non-theme layers write the same output path, the scaffolder should fail
unless that path is an explicitly registered composable target.

This prevents accidental last-wins overwrites.

Composable targets include:

- `wrangler.toml`
- `.dev.vars.example`
- `.mantle/features.json`
- `src/.mantle/*`
- `scripts/.mantle-provision.mjs`
- i18n compose outputs

Theme overlays should be further constrained to bounded theme slots. A theme
must not clobber arbitrary feature or app integration files.

## Relationship To shadcn

This design intentionally copies the shadcn registry shape where it fits.

Useful conventions to mirror:

- `registry.json` as a registry index;
- `registry-item.json` per installable item;
- `name`, `type`, `title`, `description`;
- `registryDependencies` for item dependencies;
- `dependencies` and `devDependencies` for npm dependencies;
- `files[].path`, `files[].type`, `files[].target`;
- `docs` and `meta` for extra metadata.

Mantle-specific data should live under `meta.mantle`, not as many new top-level
fields. That keeps the shape familiar to developers who already understand
source registries.

## Registry Layout

Recommended repo layout:

```text
registry.json
registry/
  archetypes/
    registry.json
    publication/
      registry-item.json
      files/
    presence/
      registry-item.json
      files/
  features/
    registry.json
    contact/
      registry-item.json
      files/
    customer-account/
      registry-item.json
      files/
    wishlist/
      registry-item.json
      files/
  themes/
    registry.json
    l4-minimal-ink/
      registry-item.json
      files/
```

Top-level registry index:

```json
{
  "$schema": "https://mantle.tools/schema/registry.json",
  "name": "mantle-starters",
  "homepage": "https://mantle.tools/",
  "include": [
    "registry/archetypes/registry.json",
    "registry/features/registry.json",
    "registry/themes/registry.json"
  ]
}
```

## Registry Item Types

Use shadcn-style registry item types with Mantle-specific additions:

```text
registry:archetype
registry:feature
registry:theme
registry:file
registry:compose
registry:lib
```

Meanings:

- `registry:archetype`: a minimal starter app core.
- `registry:feature`: an opt-in application capability.
- `registry:theme`: a bounded theme override.
- `registry:file`: source copied into the generated project.
- `registry:compose`: input consumed by the scaffolder to generate glue.
- `registry:lib`: shared helper code copied into the generated project when
  needed.

## Feature Item Example

```json
{
  "$schema": "https://mantle.tools/schema/registry-item.json",
  "name": "contact",
  "type": "registry:feature",
  "title": "Contact Form",
  "description": "CAPTCHA-gated contact form with lifecycle hooks and optional Slack notification.",
  "registryDependencies": [],
  "dependencies": [],
  "devDependencies": [],
  "files": [
    {
      "path": "files/src/features/contact/manifests/contact.yaml",
      "type": "registry:file",
      "target": "src/features/contact/manifests/contact.yaml"
    },
    {
      "path": "files/src/features/contact/handlers/slackNotify.ts",
      "type": "registry:file",
      "target": "src/features/contact/handlers/slackNotify.ts"
    },
    {
      "path": "files/src/features/contact/templates/contact.tsx",
      "type": "registry:file",
      "target": "src/features/contact/templates/contact.tsx"
    },
    {
      "path": "files/_compose/manifests.json",
      "type": "registry:compose",
      "target": ".mantle/compose/contact/manifests.json"
    },
    {
      "path": "files/_compose/handlers.json",
      "type": "registry:compose",
      "target": ".mantle/compose/contact/handlers.json"
    },
    {
      "path": "files/_compose/routes.json",
      "type": "registry:compose",
      "target": ".mantle/compose/contact/routes.json"
    },
    {
      "path": "files/_compose/wrangler.toml",
      "type": "registry:compose",
      "target": ".mantle/compose/contact/wrangler.toml"
    },
    {
      "path": "files/_compose/.dev.vars.example",
      "type": "registry:compose",
      "target": ".mantle/compose/contact/.dev.vars.example"
    },
    {
      "path": "files/_compose/provision.steps.mjs",
      "type": "registry:compose",
      "target": ".mantle/compose/contact/provision.steps.mjs"
    }
  ],
  "meta": {
    "mantle": {
      "applicableArchetypes": ["publication", "presence", "intake"],
      "default": false,
      "compose": {
        "manifests": true,
        "handlers": true,
        "routes": true,
        "env": true,
        "wrangler": true,
        "provision": true,
        "i18n": true
      }
    }
  },
  "docs": "Production deploys require a real Cloudflare Turnstile secret. Local development can use dev-stub."
}
```

## Archetype Item Example

```json
{
  "$schema": "https://mantle.tools/schema/registry-item.json",
  "name": "publication",
  "type": "registry:archetype",
  "title": "Publication",
  "description": "Articles, pages, docs-lite, and localized content.",
  "files": [
    {
      "path": "files/**",
      "type": "registry:file",
      "target": "."
    }
  ],
  "meta": {
    "mantle": {
      "supportsFeatures": ["contact", "newsletter"],
      "recommendedFeatures": []
    }
  }
}
```

## Feature Dependencies

Use `registryDependencies` for feature dependencies.

Example:

```json
{
  "name": "wishlist",
  "type": "registry:feature",
  "registryDependencies": ["customer-account"],
  "meta": {
    "mantle": {
      "applicableArchetypes": ["transaction"]
    }
  }
}
```

The resolver:

1. reads requested features;
2. validates that each feature applies to the selected archetype;
3. recursively adds `registryDependencies`;
4. detects unknown features;
5. detects missing dependencies;
6. detects cycles;
7. returns a topologically sorted feature list.

If the user requests `wishlist`, the CLI can say:

```text
wishlist requires customer-account. Adding both.
```

## Variants

Variants are file-set choices inside a feature. They should not become a
nested feature system.

Example:

```json
{
  "name": "email-sender",
  "type": "registry:feature",
  "meta": {
    "mantle": {
      "applicableArchetypes": ["transaction"],
      "requiresVariant": true,
      "variants": [
        {
          "name": "resend-stub",
          "title": "Resend Stub",
          "files": [
            {
              "path": "variants/resend-stub/emailSender.ts",
              "type": "registry:file",
              "target": "src/features/email-sender/emailSender.ts"
            }
          ]
        },
        {
          "name": "ses-stub",
          "title": "SES Stub",
          "files": [
            {
              "path": "variants/ses-stub/emailSender.ts",
              "type": "registry:file",
              "target": "src/features/email-sender/emailSender.ts"
            }
          ]
        }
      ]
    }
  }
}
```

Resolver behavior:

- if a feature has `requiresVariant: true`, the caller must choose one;
- two selected features cannot choose conflicting variants for the same feature;
- variants can add files and compose fragments;
- variants should not add unrelated feature dependencies.

## Generated Project Layout

Example generated app after installing `publication` with `contact`:

```text
src/
  features/
    contact/
      manifests/contact.yaml
      handlers/slackNotify.ts
      templates/contact.tsx
      i18n/en.json
      i18n/zh-TW.json
  .mantle/
    generated.manifests.ts
    generated.handlers.ts
    generated.routes.ts
    generated.env.d.ts

.mantle/
  features.json
  compose/
    contact/
      manifests.json
      handlers.json
      routes.json
      wrangler.toml
      .dev.vars.example
      provision.steps.mjs

scripts/
  provision.mjs
  .mantle-provision.mjs
```

`src/index.ts` and other core app files import generated registries. They do
not need to know every feature by hand.

## Feature Manifest

The scaffolder emits `.mantle/features.json`.

Example:

```json
{
  "registry": {
    "name": "mantle-starters",
    "url": "https://mantle.tools/registry.json",
    "version": "0.0.11-alpha.15"
  },
  "archetype": {
    "name": "publication",
    "type": "registry:archetype"
  },
  "theme": {
    "name": "l4-minimal-ink",
    "type": "registry:theme"
  },
  "features": [
    {
      "name": "contact",
      "type": "registry:feature",
      "version": "0.0.11-alpha.15",
      "files": [
        "src/features/contact/manifests/contact.yaml",
        "src/features/contact/handlers/slackNotify.ts",
        "src/features/contact/templates/contact.tsx"
      ]
    }
  ],
  "resolvedAt": "2026-05-22T00:00:00.000Z"
}
```

Future agents and provision scripts should read this file instead of inferring
feature intent from filesystem shape.

## Compose Targets

### Manifests

Features should provide manifest declarations as source files and register them
through a compose fragment.

Example `.mantle/compose/contact/manifests.json`:

```json
{
  "imports": [
    {
      "name": "contactYaml",
      "path": "../../features/contact/manifests/contact.yaml"
    }
  ],
  "manifests": ["contactYaml"]
}
```

Generated output:

```ts
import contactYaml from "../features/contact/manifests/contact.yaml";

export const featureManifests = [contactYaml] as const;
```

The app's `loadManifests.ts` imports base manifests plus generated feature
manifests.

### Handlers

Features register handler factories rather than overwriting
`src/handlers/index.ts`.

Example `.mantle/compose/contact/handlers.json`:

```json
{
  "imports": [
    {
      "name": "slackNotify",
      "path": "../../features/contact/handlers/slackNotify.js"
    },
    {
      "name": "cloudflareTurnstileCheck",
      "path": "@aotter/mantle/cloudflare"
    }
  ],
  "handlers": [
    {
      "ref": "captchaCheck",
      "factory": "cloudflareTurnstileCheck",
      "options": {
        "secretEnv": "TURNSTILE_SECRET_KEY",
        "devDefault": "dev-stub"
      }
    },
    {
      "ref": "slackNotify",
      "factory": "slackNotify"
    }
  ]
}
```

Generated output:

```ts
import type { AnyHandler } from "@aotter/mantle/runtime";
import { cloudflareTurnstileCheck } from "@aotter/mantle/cloudflare";
import { slackNotify } from "../features/contact/handlers/slackNotify.js";

export interface FeatureHandlerEnv {
  readonly TURNSTILE_SECRET_KEY?: string;
}

export function buildFeatureHandlers(
  env: FeatureHandlerEnv,
): Readonly<Record<string, AnyHandler>> {
  return {
    captchaCheck: cloudflareTurnstileCheck({
      secret: env.TURNSTILE_SECRET_KEY ?? "dev-stub",
    }) as AnyHandler,
    slackNotify: slackNotify as AnyHandler,
  };
}
```

The base handler registry merges base handlers with `buildFeatureHandlers(env)`.
Duplicate handler refs are an error.

### Routes

Features register routes through route fragments.

Example `.mantle/compose/contact/routes.json`:

```json
{
  "imports": [
    {
      "name": "renderContactPage",
      "path": "../../features/contact/routes/renderContactPage.js"
    }
  ],
  "routes": [
    {
      "method": "GET",
      "path": "/:locale/pages/contact",
      "handler": "renderContactPage"
    }
  ]
}
```

Generated route glue should be explicit TypeScript, not opaque runtime loading.

### i18n

i18n should be a registered compose target because features often add user
visible strings.

Recommended convention:

```text
src/features/contact/i18n/en.json
src/features/contact/i18n/zh-TW.json
```

The scaffolder merges locale JSON objects with conflict detection:

- same key and same value: allowed;
- same key and different value: error unless explicitly marked as override;
- missing locale file: warning or error depending on archetype locale policy.

### `.dev.vars.example`

This is documentation, not structured config. Ordered text fragment concat is
enough.

Generated output includes source separators:

```text
# --- from feature: contact ---
TURNSTILE_SECRET_KEY=dev-stub
```

### `wrangler.toml`

Do not parse and re-emit the entire file if avoidable. `wrangler.toml` carries
human comments, ordering, and environment blocks.

Support targeted structural composition for explicit sections:

- `[vars]`
- `[env.test.vars]`
- `[[d1_databases]]`
- `[[kv_namespaces]]`
- queues and other known Workers binding blocks

Rules:

- adding a new key is allowed;
- setting the same key to the same value is allowed;
- setting the same key to a different value is an error;
- array-style binding blocks require unique binding names;
- generated comments should identify feature source where practical.

Example feature fragment:

```toml
[vars]
TURNSTILE_SITE_KEY = "1x00000000000000000000AA"

[env.test.vars]
TURNSTILE_SITE_KEY = "1x00000000000000000000AA"
```

### Provision Steps

Each feature can export provision steps.

Example:

```js
export const installSteps = [
  {
    phase: "resources",
    id: "turnstile-widget",
    plan: async (ctx) => {
      ctx.addResource("Cloudflare Turnstile widget", ctx.names.projectName);
    },
    up: async (ctx) => {
      const widget = await ctx.cloudflare.createTurnstileWidget({
        name: ctx.names.projectName,
        domain: ctx.hostname,
      });
      ctx.state.set("contact.turnstileSiteKey", widget.sitekey);
      ctx.state.setSecret("contact.turnstileSecret", widget.secret);
    }
  },
  {
    phase: "config",
    id: "turnstile-site-key",
    up: async (ctx) => {
      ctx.wrangler.upsertVar(
        "TURNSTILE_SITE_KEY",
        ctx.state.get("contact.turnstileSiteKey"),
      );
    }
  },
  {
    phase: "secrets",
    id: "turnstile-secret",
    up: async (ctx) => {
      await ctx.secrets.put(
        "TURNSTILE_SECRET_KEY",
        ctx.state.getSecret("contact.turnstileSecret"),
      );
    }
  }
];
```

Allowed phases:

```text
resources
config
secrets
postDeploy
```

Ordering:

```text
(phase order, feature topo order, in-array order)
```

The generated `scripts/.mantle-provision.mjs` imports selected feature steps.
The base `scripts/provision.mjs` owns the user-facing CLI and shared context.

## CLI Shape

Create-time install:

```bash
pnpm create mantle my-site --archetype publication --feature contact
```

Multiple features:

```bash
pnpm create mantle shop --archetype transaction --feature wishlist
```

If `wishlist` depends on `customer-account`, the CLI should print the resolved
additions:

```text
wishlist requires customer-account. Adding both.
```

Future commands can follow the same philosophy:

```bash
pnpm mantle add contact
pnpm mantle add wishlist
pnpm mantle diff contact
```

Those are not required for the first version. The first version can be
create-time only.

## Install Flow

```text
user interview
  -> install skill maps user language to feature IDs
  -> create-mantle receives archetype, theme, requested features
  -> registry resolver loads items
  -> resolver validates applicability, dependencies, variants
  -> resolver returns topo-sorted feature set
  -> scaffolder copies archetype core source
  -> scaffolder copies selected feature source
  -> scaffolder copies selected theme source within bounded theme slots
  -> scaffolder applies compose fragments
  -> scaffolder generates glue files
  -> scaffolder emits .mantle/features.json
  -> scaffolder runs pnpm install
```

## Runtime Flow

```text
src/index.ts
  -> imports base routes
  -> imports generated feature routes
  -> mounts both

src/loadManifests.ts
  -> imports base manifests
  -> imports generated feature manifests
  -> returns combined manifest list

src/handlers/index.ts
  -> imports base handlers
  -> imports generated feature handlers
  -> returns combined handler registry
```

Runtime behavior remains source-based and explicit. There is no dynamic plugin
loader.

## Provision Flow

```text
pnpm run provision:plan
  -> creates base provision context
  -> loads .mantle/features.json
  -> loads generated feature provision steps
  -> prints base resources plus feature resources

pnpm run provision:up
  -> creates base resources
  -> runs feature steps in phase/topo order
  -> deploys
  -> sets secrets
  -> runs postDeploy steps
```

Provision should expose helpers through context instead of letting every
feature hand-edit shared files independently.

## Collision Policy

Layer copy order:

```text
1. archetype core
2. selected feature source, in topo order
3. selected variants, in feature topo order
4. selected theme, bounded to theme slots
5. generated glue
```

Rules:

- same output path from two non-theme `registry:file` entries is an error;
- same output path from `registry:compose` entries is allowed only for known
  compose targets;
- duplicate handler refs are an error;
- duplicate route method/path pairs are an error unless explicitly marked as
  override;
- duplicate manifest collection names are an error;
- duplicate env keys with different values are an error;
- theme files can only target bounded theme paths.

This is stricter than the current last-wins overlay behavior by design.

## What Not To Build Yet

Do not build these in the first iteration:

- uninstall transactions;
- semantic upgrade engine;
- package-lock replacement;
- runtime plugin loader;
- marketplace workflow;
- general patch language;
- arbitrary file mutation recipes.

The first version should be a source registry and create-time installer.

## Compose Policy

This section is the implementation contract for the [Compose Targets](#compose-targets)
and [Collision Policy](#collision-policy) sections. Today `create-mantle` ships
only `.dev.vars.example` composition through `COMPOSABLE_TARGETS` and
`appendComposable`; the other composers described below are policy that future
implementations must follow.

### 1. Compose Collision Matrix

Error-message shape for hard collisions:

```text
Feature overlay collision at `<path>`: `<owner.id>` already wrote it, `<layer.id>` attempted to write it again.
```

| Target path/kind | Conflict detection point | Policy | Error-message shape |
|---|---|---|---|
| `.dev.vars.example` | `writeFileForLayer` when `COMPOSABLE_TARGETS` routes a second write to `appendComposable` | Append non-empty fragments in layer order. `appendComposable` does not prefix the first writer with a separator; only the second layer onward is appended below `# --- from <layer.id> ---`. No key parsing. This codifies the behavior already shipped for #190. | No collision error for repeated writes; malformed file content is outside compose policy. |
| `wrangler.toml` `[vars]` section | Future Wrangler composer while merging feature `_compose/wrangler.toml` fragments into the generated TOML target | Merge by key. Same key and same value is allowed; same key and different value is a hard error. | Template above with `<path>` = `wrangler.toml [vars].<key>`. |
| `wrangler.toml` `[env.<env>.vars]` section | Future Wrangler composer per environment block | Merge by `<env>` and key. Same env/key/value is allowed; same env/key with different value is a hard error. | Template above with `<path>` = `wrangler.toml [env.<env>.vars].<key>`. |
| `wrangler.toml` `[[d1_databases]]` binding | Future Wrangler composer while indexing array-style binding blocks | Binding names are unique by the `binding` field. Two bindings may legitimately point at the same `database_id`. Re-declaring the same binding with the same binding object is allowed only by structural equality: deep equality, key order insensitive. Divergent config is a hard error. | Template above with `<path>` = `wrangler.toml [[d1_databases]].<binding>`. |
| `wrangler.toml` `[[kv_namespaces]]` binding | Future Wrangler composer while indexing array-style binding blocks | Binding names are unique. Re-declaring the same binding with the same binding object is allowed only by structural equality: deep equality, key order insensitive. Divergent config is a hard error. | Template above with `<path>` = `wrangler.toml [[kv_namespaces]].<binding>`. |
| `wrangler.toml` queues | Future Wrangler composer while indexing producer and consumer queue bindings | Queue binding identifiers are unique within their queue kind. Re-declaring the same binding object is allowed only by structural equality: deep equality, key order insensitive. Divergent producer or consumer config is a hard error. | Template above with `<path>` = `wrangler.toml queues.<binding>`. |
| Manifest ref IDs | Future manifest composer before emitting `generated.manifests.ts` | Manifest refs are unique. Reusing a ref for the same manifest source is allowed; reusing it for a different source is a hard error. | Template above with `<path>` = `src/.mantle/generated.manifests.ts#<ref>`. |
| Handler refs (`generatedHandlersSource`) | `generatedHandlersSource` or its future data-driven replacement before object emission | Handler refs are unique across base and feature handlers. Duplicate ref is allowed only when factory/options match by structural equality: deep equality, key order insensitive. Any different factory/options is a hard error. | Template above with `<path>` = `src/.mantle/generated.handlers.ts#<ref>`. |
| Route slug overrides | `generatedRoutesSource` or its future data-driven replacement before emitting `buildFeatureSlugOverrides` | A `(collection, slug)` pair may be owned by one feature. Same pair from another feature is a hard error unless a future schema adds an explicit override marker. | Template above with `<path>` = `src/.mantle/generated.routes.ts#<collection>/<slug>`. |
| i18n keys | Future i18n composer while merging locale JSON objects | Same locale/key/value is allowed. Same locale/key with different value is a hard error unless explicitly marked as an override. Missing locale follows the archetype locale policy. | Template above with `<path>` = `i18n/<locale>#<key>`. |
| Provision step IDs | Future provision composer before emitting `scripts/.mantle-provision.mjs` | Step IDs are unique after phase scoping. Same phase/id from another feature is a hard error; same feature cannot emit duplicate IDs. | Template above with `<path>` = `scripts/.mantle-provision.mjs#<phase>/<step.id>`. |
| `generated.*` glue files (`src/.mantle/generated.*.ts`) | `writeGeneratedFeatureGlue` and future generated-output writers | Scaffolder-owned output is regenerated as a whole. Feature fragments do not write these files directly; collisions are detected on refs inside the generated file, not on the file path. | Use the ref-specific generated file messages above. Direct feature writes to `src/.mantle/generated.*.ts` use the generic path collision shape. |
| Theme bounds (`src/theme/**`) | `shouldCopyPath`, `isThemeOverridePath`, and future registry target validation | Theme layers may write only bounded theme paths. Features must not write `src/theme/**`. Theme attempts outside the bound are hard errors. | Template above with `<path>` = `src/theme/<path>`. |

### 2. Generated-Output Stability Contract

Scaffolder-owned paths are regenerated by install and by future
`create-mantle update` runs:

- `src/.mantle/generated.*.ts`
- `.mantle/features.json`
- future `scripts/.mantle-provision.mjs`

Scaffolder-owned means users and agents should treat the file as derived
output. The scaffolder may overwrite it without a three-way merge, and user
customizations belong in copied source files or upstream feature compose fragments
instead.

User-owned paths are everything copied from `_common/`, the selected archetype,
feature layers, and the selected theme. `update` must preserve user edits to
these paths: it applies upstream changes only when the lock proves the local
file is still clean, otherwise it reports a conflict.

Receipts split intent from machine state:

- `.mantle/features.json` is the scaffolder-owned canonical feature receipt.
  It is regenerated on every install, and no hand-edits are supported.
  `writeFeaturesManifest` in `packages/create-mantle/src/index.ts` currently
  overwrites this receipt unconditionally.
- Future `.mantle/scaffold.lock.json` records final bytes for update safety, as
  proposed in #192. It is machine-only and should not be hand-edited.

### 3. Ordering / Determinism

Two installs with the same inputs must produce byte-identical
scaffolder-owned output.

Determinism rules:

- Feature iteration order is the `resolveFeatures` topological sort, with an
  alphabetical tiebreak for independent features.
- Composable text fragment order follows layer push order, which is resolver
  topological order with the same alphabetical tiebreak as feature iteration.
  This applies to `.dev.vars.example` and future array-style Wrangler targets
  such as `[[d1_databases]]`, `[[kv_namespaces]]`, and queues.
- `appendComposable` emits the first non-empty fragment without a separator;
  only subsequent fragments receive `# --- from <layer.id> ---`.
- Import dedup is sorted by module specifier, then imported binding name. The
  current `renderImports` first-seen behavior must be tightened when
  `registry:compose` fragments replace the built-in `FEATURE_CONTRIBUTIONS`
  table.
- Manifest entry order is a stable sort by feature declaration order after the
  stable topological sort.
- Route override emission is alphabetical by slug, then collection.
- Provision step emission is phase order, then feature topological order, then
  in-array order.

### 4. `_compose/` Schema Versioning

`_compose/glue.json` lives in the upstream `mantle-starters` tarball at
`<feature-path>/_compose/glue.json`. It carries `schemaVersion: 1` when JSON
fragments replace the current built-in contribution registry. Version 1 is the
initial contract for manifest refs, handler refs, route overrides, env
declarations, Wrangler fragments, i18n fragments, and provision references.

The user's project stores `.mantle/features.json` and future
`.mantle/scaffold.lock.json`; it does not store migrate-able `_compose/`
fragments. At install or update time, `create-mantle` reads the upstream
feature fragments and declares the `_compose/` schemaVersion range it supports.
Encountering a newer fragment schemaVersion stops with a clear
`scaffolder upgrade required` error before regenerating scaffolder-owned
output.

### 5. Theme vs Feature Collision Matrix

| Path pattern | Who can write it | Co-write allowed? | Resolution |
|---|---|---|---|
| `src/theme/**` | Theme layer only | No | Feature attempts are hard errors. Theme files replace the starter theme within the bounded slot. |
| `src/theme/index.ts` | Theme layer only | No | Same as `src/theme/**`; this explicit file is included in `isThemeOverridePath`. |
| `src/theme.default/**` | Archetype layer only | No | Themes and features must not write archetype baseline theme templates such as `src/theme.default/templates/index.ts`. |
| Feature source paths such as `src/features/**` | Feature layer only | No | Theme attempts outside `src/theme/**` fail in `shouldCopyPath`. |
| Generated glue such as `src/.mantle/generated.routes.ts` | Scaffolder only | No direct co-write | Features and themes contribute through approved compose inputs; the scaffolder owns the generated file. |
| Approved theme imports from generated glue | Scaffolder-generated code may read theme modules | Read-only only | The contact `generatedRoutesSource` import from `../themeWiring.js` is an allowed read-only import, not a co-write. |
| Any path outside `src/theme/**` | Base, archetype, or feature layers depending on registry target | No for themes | Theme attempts fail; non-theme duplicate paths follow the compose collision matrix. |

Features must not write `src/theme/**` or `src/theme.default/**`. Themes must
not write outside `src/theme/**` except through approved glue imports generated
by the scaffolder.

### 6. Provision Step Semantics (Sketch)

Full provision design is tracked in #199. This section only fixes the compose
contract that the future provision loader must implement.

Provision steps are emitted into future `scripts/.mantle-provision.mjs`, ordered
by phase, feature topological order, then in-array order. Step IDs are unique
within phase, and completed steps are recorded in a lock-style receipt so
failed runs can resume without repeating completed work.
`scripts/provision.mjs` is user-invoked separately from `create-mantle`
install/update; provision steps do not run during scaffolding.

Provision `up()` operations must be idempotent where the provider API allows
it. When an API is not naturally idempotent, the step must check recorded state
or provider state before creating resources. Partial failure stops execution
and reports the failed step, completed step IDs, and any state needed for
manual recovery.

Rollback is not automatic. A future optional `down()` hook may support manual
cleanup, but v1 does not promise transactional rollback across Cloudflare
resources, Wrangler config, secrets, and post-deploy actions. Atomicity is
therefore best-effort at the step boundary: a step either records completion
after its side effects are durable, or leaves enough state for the next run to
detect and reconcile the partial side effect.

### Open Questions

- Should provision progress live in `.mantle/scaffold.lock.json` or a separate
  `.mantle/provision.lock.json`?
- Should route override conflicts allow an explicit override marker in schema
  version 1, or wait for a later schema bump?

## Suggested Implementation Phases

### Phase 1: Registry and resolver

Ship:

- registry item schema;
- `registry.json` and item loading;
- `registry:archetype`, `registry:feature`, `registry:theme`;
- `--feature` CLI flag;
- feature dependency resolver;
- applicability checks;
- variant checks;
- `.mantle/features.json`;
- fake feature tests for unknown feature, missing dep, cycle, topo order,
  variant conflict, and missing variant.

Do not migrate contact yet.

### Phase 2: Compose framework

Already shipped in the Phase 1 PR (built on top of the resolver to avoid a
single-feature-only generator):

- default-deny collision policy;
- generated manifests/handlers/routes glue driven by an internal
  `FEATURE_CONTRIBUTIONS` registry (one entry per feature) rather than a
  hardcoded `hasContact` boolean — adding a feature is one entry, not a
  threaded boolean parameter through every generator;
- `.dev.vars.example` fragment concat (registered as the first composable
  target; subsequent feature layers append below a
  `# --- from <layer-id> ---` separator).

Still deferred:

- `registry:compose` JSON fragment loading from per-feature `_compose/`
  directories (current generator dispatches on `feature.name` from the
  built-in registry; the design above describes the eventual data-driven
  shape);
- targeted `wrangler.toml` composition;
- generated env declarations and feature provision step loader.

Use fake features and a small non-contact sample feature to test composition.

### Phase 3: Contact migration

Ship:

- remove contact from `publication`, `presence`, and `intake` core;
- add `registry/features/contact`;
- copy contact source under `src/features/contact`;
- compose manifests, handlers, routes, env, i18n, `wrangler.toml`, local vars,
  and provision steps;
- update README/SKILL docs so contact is opt-in.

This phase validates the mechanism with a real cross-archetype feature.

### Phase 4: Transaction features

Ship later:

- `email-sender`;
- `customer-account`;
- `wishlist`;
- any required variants.

These should consume the registry mechanism rather than define it.

## Open Questions

- Should registry item versions be tied to `sources.json`/release tags, package
  versions, or explicit item-level versions?
- How much of the current `sources.json` should remain during migration?
- Should generated glue live under `src/.mantle/` or `src/mantle.generated/`?
- Should `.mantle/compose/` be committed into generated apps, or should compose
  fragments be discarded after generated glue is emitted?
- Should `pnpm mantle add <feature>` be supported soon after create-time
  install, or intentionally deferred?

## Recommended Decision

Adopt a shadcn-style Mantle Registry:

- registry metadata controls installation;
- feature source is copied into the generated app;
- generated glue connects feature source to app integration points;
- `.mantle/features.json` records installed intent;
- package only stable primitives, not product-specific application behavior.

This gives developers an immediately recognizable philosophy:

```text
You own the code. Mantle only installed it with structure.
```
