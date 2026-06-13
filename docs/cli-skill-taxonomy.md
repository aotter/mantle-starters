# Mantle CLI And Skill Taxonomy

Tracking issue: [aotter/mantle-starters#253](https://github.com/aotter/mantle-starters/issues/253)

Mantle has three command surfaces. Keep them separate so OSS bootstrap stays
useful without turning the SDK CLI into a Cloudflare/GitHub control plane.

## 1. `create-mantle`: create-time scaffolding

Owner: `mantle-starters/packages/create-mantle`

Responsibilities:

- choose the archetype source;
- apply optional feature overlays with dependency resolution;
- apply optional bounded theme overlays;
- substitute install-time placeholders;
- emit generated feature glue and `.mantle/features.json`;
- initialize the consumer repo and install dependencies.

This is the shadcn/tool-ui-style surface: users select source recipes, the
scaffolder copies code they own, and generated glue keeps shared integration
points deterministic.

Current command shape:

```bash
npx https://github.com/aotter/mantle-starters/releases/download/<tag>/aotter-create-mantle.tgz publication \
  --project-name my-site \
  --brand "My Site" \
  --description "A publication site" \
  --locales "en,zh-TW" \
  --github-owner my-login \
  --summary "Install My Site" \
  --theme l4-minimal-ink \
  --feature contact
```

Current and future create-time feature candidates:

- `media-r2`: opt-in R2 bucket/binding/upload-policy setup for admin media
  uploads;
- `customer-account`, `customer-profile`, `members-only-purchase`:
  transaction starter features that prove dependency ordering;
- `github-admin-auth`: customer-owned GitHub App setup, preferably through the
  GitHub App Manifest Flow so users do not hand-fill OAuth App fields;
- `cloudflare-deploy`: one-time Worker/D1/R2/KV/domain/workflow bootstrap;
- `governance-manifest`: record provisioned resources for later inspection.

## 2. `mantle`: authoring and compiler loop

Owner: `mantle/packages/mantle-spec` today

Responsibilities:

- `mantle validate`;
- `mantle introspect`;
- `mantle emit-openapi`;
- `mantle emit-types`.

Do not add Cloudflare or GitHub provisioning here while the binary lives in
`@aotter/mantle-spec`. That package is the schema/manifest compiler surface,
not the deployment authority.

## 3. Starter lifecycle scripts

Owner: each generated consumer project

Responsibilities:

- `pnpm provision:plan` (print the Cloudflare dashboard first-deploy + GitHub OAuth App handoff);
- `pnpm provision:up` (after first deploy, write non-secret config and set Worker secrets via Wrangler);
- `pnpm deploy`;
- starter-specific seed, smoke, and setup helpers.

Feature overlays may contribute generated provision steps through
`scripts/.mantle-provision.mjs`, but the base `scripts/provision.mjs` owns the
user-facing lifecycle and shared context. The default happy path should not
ask for a Cloudflare API token; users authorize Cloudflare/GitHub in their own
browser, and the coding agent uses Wrangler after that handoff.

## Hosted governance boundary

Hosted can charge for fleet-level governance, not for hiding normal OSS setup.

Good paid surface:

- version drift and upgrade orchestration;
- policy/audit history;
- deployment and manifest inventory;
- multi-repo/account visibility;
- guardrails around secrets, domains, resources, and CI health.

Good free/OSS bootstrap surface:

- one project setup;
- customer-owned GitHub and Cloudflare resources;
- generated workflow PRs;
- source overlays selected at create time.

The free path should leave the customer with a runnable, ownable project. The
paid path should help teams govern many such projects over time.
