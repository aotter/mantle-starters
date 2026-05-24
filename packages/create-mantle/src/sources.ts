/**
 * Sources of truth for archetype → starter-monorepo + theme dispatch.
 *
 * `create-mantle` fetches `sources.json` from the `mantle-starters`
 * monorepo at runtime (per Epic #116 / sub-issue #121). Adding a new
 * archetype or theme = update `sources.json` in that repo. The npx
 * package does not need a new version unless the merge logic changes.
 *
 * Fetch failures fall back to a bundled snapshot (`STALE_FALLBACK_SOURCES`)
 * so installs can still complete in offline / GH-unreachable cases. The
 * snapshot tracks the current public starter + theme keys and is
 * updated whenever the live shape evolves significantly.
 */

export const STARTERS_REPO = "aotter/mantle-starters";
export const PREMIUM_REPO = "aotter/mantle-starters-premium";

export type SourceKind = "public" | "private";

export interface ThemeSource {
  readonly path: string;
}

export interface FeatureVariantSource {
  readonly name: string;
  readonly title?: string;
}

export interface FeatureSourceEntry {
  readonly path?: string;
  readonly title?: string;
  readonly summary?: string;
  readonly description?: string;
  readonly registryDependencies?: readonly string[];
  readonly requires?: readonly string[];
  readonly applicableArchetypes?: readonly string[];
  readonly requiresVariant?: boolean;
  readonly variants?: readonly FeatureVariantSource[];
}

export interface ArchetypeSourceEntry {
  readonly path: string;
  readonly overlays?: readonly string[];
}

export interface SourcesJson {
  readonly archetypes: Readonly<Record<string, ArchetypeSourceEntry>>;
  readonly features?: Readonly<Record<string, FeatureSourceEntry>>;
  readonly themes: Readonly<Record<string, ThemeSource>>;
  readonly roadmap: readonly string[];
  readonly version?: string;
}

/**
 * Resolved view used by the install pipeline. `kind` + `repo` are
 * derived (currently always public + STARTERS_REPO); the rest mirrors
 * `ArchetypeSourceEntry`.
 */
export interface ArchetypeSource extends ArchetypeSourceEntry {
  readonly kind: SourceKind;
  readonly repo: string;
}

export interface FeatureSelection {
  readonly name: string;
  readonly variant?: string | null;
}

export interface ResolvedFeature {
  readonly name: string;
  readonly type: "registry:feature";
  readonly path?: string;
  readonly title?: string;
  readonly description?: string;
  readonly variant: string | null;
  readonly registryDependencies: readonly string[];
}

/**
 * Bundled stale snapshot of `sources.json`. Tracks the live
 * `sources.json` shape (1:1 archetype-to-directory mapping post-split,
 * `transaction` ready as of PR #29). Theme keys stay current so
 * `--theme <key>` can still resolve when GH is unreachable. Refresh
 * whenever the live shape evolves significantly.
 */
export const STALE_FALLBACK_SOURCES: SourcesJson = {
  archetypes: {
    presence: { path: "presence" },
    publication: { path: "publication" },
    intake: { path: "intake" },
    transaction: { path: "transaction" },
    blank: { path: "blank" },
  },
  features: {
    contact: {
      path: "_common/features/contact",
      title: "Contact Form",
      summary: "Contact form with CAPTCHA guard and Slack notification stub.",
      applicableArchetypes: ["publication", "presence", "intake"],
    },
  },
  themes: {
    "l4-minimal-ink": { path: "themes/l4-minimal-ink" },
    "l4-editorial-warm": { path: "themes/l4-editorial-warm" },
    "l4-editorial-journal": { path: "themes/l4-editorial-journal" },
    "l4-playful-pop": { path: "themes/l4-playful-pop" },
  },
  roadmap: ["reservation", "community", "membership"],
  version: "0.0.11-alpha.14",
};

/**
 * Fetch the live `sources.json` from `mantle-starters` at the given
 * ref. Returns the bundled stale snapshot on any fetch / validation
 * failure, after writing a warning to stderr — installs proceed.
 */
export async function fetchSourcesJson(ref: string): Promise<SourcesJson> {
  const url = `https://raw.githubusercontent.com/${STARTERS_REPO}/${encodeURIComponent(ref)}/sources.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const data: unknown = await res.json();
    return validateSourcesJson(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(
      `create-mantle: failed to fetch ${url} (${msg}); using bundled stale fallback.\n`,
    );
    return STALE_FALLBACK_SOURCES;
  }
}

function validateSourcesJson(data: unknown): SourcesJson {
  if (typeof data !== "object" || data === null) {
    throw new Error("sources.json: root is not an object");
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.archetypes !== "object" || obj.archetypes === null) {
    throw new Error("sources.json: missing archetypes object");
  }
  if (typeof obj.themes !== "object" || obj.themes === null) {
    throw new Error("sources.json: missing themes object");
  }
  if (
    obj.features !== undefined &&
    (typeof obj.features !== "object" || obj.features === null)
  ) {
    throw new Error("sources.json: features must be an object when present");
  }
  if (!Array.isArray(obj.roadmap)) {
    throw new Error("sources.json: roadmap is not an array");
  }
  return data as SourcesJson;
}

/**
 * Resolve an archetype to its starter path + (optional) overlays.
 * Throws with a helpful message for roadmap or unknown values.
 */
export function resolveArchetype(
  archetype: string,
  sources: SourcesJson,
): ArchetypeSource {
  const hit = sources.archetypes[archetype];
  if (hit) {
    return {
      kind: "public",
      repo: STARTERS_REPO,
      path: hit.path,
      overlays: hit.overlays,
    };
  }
  if (sources.roadmap.includes(archetype)) {
    throw new Error(
      `Archetype "${archetype}" is roadmap-only and does not have a starter yet. ` +
        `The install Skill should have refused before invoking create-mantle.`,
    );
  }
  throw new Error(
    `Unknown archetype "${archetype}". Known: ${Object.keys(sources.archetypes).join(", ")}.`,
  );
}

/**
 * Resolve an optional theme key to its overlay path. Returns `null`
 * for missing/empty key; throws on unknown key.
 */
export function resolveTheme(
  theme: string | null | undefined,
  sources: SourcesJson,
): ThemeSource | null {
  if (!theme) return null;
  const hit = sources.themes[theme];
  if (hit) return hit;
  const known = Object.keys(sources.themes);
  const list = known.length > 0 ? known.join(", ") : "(no themes in bundled stale fallback)";
  throw new Error(`Unknown theme "${theme}". Known: ${list}.`);
}

export function resolveFeatures(
  requested: ReadonlyArray<FeatureSelection>,
  archetype: string,
  sources: SourcesJson,
): readonly ResolvedFeature[] {
  if (requested.length === 0) return [];
  const features = sources.features ?? {};
  const requestedVariants = new Map<string, string | null>();
  for (const selection of requested) {
    const name = selection.name.trim();
    if (!name) continue;
    const variant = selection.variant?.trim() || null;
    const existing = requestedVariants.get(name);
    if (existing !== undefined && existing !== variant) {
      throw new Error(
        `Feature "${name}" was requested with conflicting variants: ` +
          `${existing ?? "(none)"} and ${variant ?? "(none)"}.`,
      );
    }
    requestedVariants.set(name, variant);
  }

  const resolved: ResolvedFeature[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (name: string, stack: readonly string[]): void => {
    const feature = features[name];
    if (!feature) {
      const known = Object.keys(features);
      const list = known.length > 0 ? known.join(", ") : "(no features)";
      throw new Error(`Unknown feature "${name}". Known: ${list}.`);
    }
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      throw new Error(
        `Feature dependency cycle detected: ${[...stack, name].join(" -> ")}.`,
      );
    }
    if (
      feature.applicableArchetypes &&
      !feature.applicableArchetypes.includes(archetype)
    ) {
      throw new Error(
        `Feature "${name}" does not apply to archetype "${archetype}". ` +
          `Applicable archetypes: ${feature.applicableArchetypes.join(", ")}.`,
      );
    }

    visiting.add(name);
    const registryDependencies =
      feature.registryDependencies ?? feature.requires ?? [];
    for (const dep of registryDependencies) {
      visit(dep, [...stack, name]);
    }
    visiting.delete(name);
    visited.add(name);

    const variant = requestedVariants.get(name) ?? null;
    if (feature.requiresVariant && !variant) {
      throw new Error(`Feature "${name}" requires a variant.`);
    }
    if (variant) {
      const variants = feature.variants ?? [];
      if (!variants.some((v) => v.name === variant)) {
        const list = variants.length > 0
          ? variants.map((v) => v.name).join(", ")
          : "(no variants)";
        throw new Error(
          `Unknown variant "${variant}" for feature "${name}". Known: ${list}.`,
        );
      }
    }

    resolved.push({
      name,
      type: "registry:feature",
      path: feature.path,
      title: feature.title,
      description: feature.description ?? feature.summary,
      variant,
      registryDependencies,
    });
  };

  for (const name of requestedVariants.keys()) {
    visit(name, []);
  }
  return resolved;
}

/**
 * @deprecated use `resolveArchetype(archetype, sources)` with a fetched
 * `SourcesJson`. Retained for back-compat with v0.0.8-alpha tests; runs
 * against the bundled stale fallback only.
 */
export function resolveSource(archetype: string): ArchetypeSource {
  return resolveArchetype(archetype, STALE_FALLBACK_SOURCES);
}

/**
 * @deprecated read `sources.roadmap` from a fetched `SourcesJson`
 * instead. Re-exported for back-compat.
 */
export const ROADMAP_ARCHETYPES: readonly string[] =
  STALE_FALLBACK_SOURCES.roadmap;

/**
 * @deprecated read `sources.archetypes` from a fetched `SourcesJson`
 * instead. Re-exported as a flat snapshot for back-compat.
 */
export const SOURCES: Readonly<Record<string, ArchetypeSource>> = Object.fromEntries(
  Object.entries(STALE_FALLBACK_SOURCES.archetypes).map(([k, v]) => [
    k,
    {
      kind: "public" as const,
      repo: STARTERS_REPO,
      path: v.path,
      ...(v.overlays !== undefined ? { overlays: v.overlays } : {}),
    },
  ]),
);
