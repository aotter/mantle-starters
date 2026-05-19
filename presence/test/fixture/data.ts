import type { SiteConfig } from "@aotter/mantle/spec";

/**
 * Fixture data for the presence starter's local-dev demo.
 *
 * `pnpm fixture` runs `apply-dev.ts`, which builds idempotent SQL +
 * KV blobs from this data and applies them to the miniflare DB so
 * the home / about routes have content on first `pnpm dev`. Without
 * this seed every page-shaped route 404s — presence ships nothing
 * pre-seeded in the runtime itself.
 *
 * The brand / description strings below are `{{BRAND}}` / `{{DESCRIPTION}}`
 * placeholders that `@aotter/create-mantle` substitutes at install
 * time. After scaffold the values reflect what the operator typed.
 */
export const FIXTURE_NOW = 1_730_000_000_000;
export const FIXTURE_AUTHOR_ID = "u-staff-1";

export const FIXTURE_SITE: SiteConfig = {
  brand: "{{BRAND}}",
  title: "{{BRAND}}",
  description: "{{DESCRIPTION}}",
  origin: "http://localhost:8787",
  locales: ["en"],
  canonicalLocale: "en",
  // Presence has no media-image fields in its manifests, so its
  // `siteDefaults.media.purposes` is undeclared; the runtime keeps
  // upload tools disabled (aotter/mantle#262). v0.0.11-alpha.9
  // made `SiteConfig.media` required on the runtime read shape.
  media: { purposes: [] },
};

export interface FixturePage {
  readonly slug: string;
  readonly translations: ReadonlyArray<{
    readonly locale: string;
    readonly title: string;
    readonly intro: string;
    readonly body: string;
  }>;
}

export const FIXTURE_PAGES: readonly FixturePage[] = [
  {
    slug: "home",
    translations: [
      {
        locale: "en",
        title: "Welcome to {{BRAND}}",
        intro: "{{DESCRIPTION}}",
        body: "This is the home page of your presence site. Edit `test/fixture/data.ts` to replace this copy with content that introduces what {{BRAND}} does. Once `pnpm dev` is running, you can also author through `/admin` after signing in.",
      },
    ],
  },
  {
    slug: "about",
    translations: [
      {
        locale: "en",
        title: "About",
        intro: "Who runs {{BRAND}} and why.",
        body: "Replace this paragraph with a short About section — usually a couple of sentences on the person or team behind the site, what they do, and how to reach them. The fixture seeds this so the route renders on first install; production content should be created via `/admin` or MCP authoring, not by editing fixture files.",
      },
    ],
  },
];
