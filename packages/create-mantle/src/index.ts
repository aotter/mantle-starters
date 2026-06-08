import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { findLeftovers, substitute, type PlaceholderValues } from "./placeholder.js";
import {
  fetchSourcesJson,
  resolveArchetype,
  resolveFeatures,
  resolveTheme,
  STALE_FALLBACK_SOURCES,
  type ArchetypeSource,
  type FeatureSelection,
  type ResolvedFeature,
  type SourcesJson,
  type ThemeSource,
} from "./sources.js";
import { cleanupTempDir, downloadAndExtractTarball } from "./tarball.js";

export type {
  ArchetypeSource,
  FeatureSelection,
  ResolvedFeature,
  SourcesJson,
  ThemeSource,
} from "./sources.js";
export type { PlaceholderValues } from "./placeholder.js";
export {
  STARTERS_REPO,
  PREMIUM_REPO,
  STALE_FALLBACK_SOURCES,
  SOURCES,
  ROADMAP_ARCHETYPES,
  fetchSourcesJson,
  resolveArchetype,
  resolveFeatures,
  resolveTheme,
  resolveSource,
} from "./sources.js";
export { substitute, findLeftovers } from "./placeholder.js";

export interface CreateOptions {
  readonly archetype: string;
  readonly projectName: string;
  readonly destination: string;
  readonly brand: string;
  readonly description: string;
  readonly locales: ReadonlyArray<string>;
  readonly githubOwner: string;
  readonly summary: string;
  /** Optional theme overlay key (resolves against `sources.themes`). */
  readonly theme?: string | null;
  /** Optional source-first feature recipes to install. */
  readonly features?: ReadonlyArray<FeatureSelection>;
  /** Override the starter ref (e.g., release tag); defaults to `main`. */
  readonly starterRef?: string;
  /** Skip `pnpm install` (used in tests). */
  readonly skipInstall?: boolean;
  /** Skip `git init` (used in tests). */
  readonly skipGitInit?: boolean;
}

export interface RunNotes {
  readonly archetype: string;
  readonly theme: string | null;
  readonly features: ReadonlyArray<RunNoteFeature>;
  readonly starter_source: string;
  readonly theme_source: string | null;
  readonly overlays: ReadonlyArray<string>;
  readonly files_written: ReadonlyArray<string>;
  readonly next_step: string;
}

export interface RunNoteFeature {
  readonly name: string;
  readonly type: "registry:feature";
  readonly variant: string | null;
  readonly path?: string;
  readonly registry_dependencies: readonly string[];
}

const PLACEHOLDER_PATH_BLOCKLIST = new Set([
  "node_modules",
  ".git",
  ".wrangler",
  ".wrangler-test",
  ".pnpm-store",
  "dist",
  ".tsbuildinfo",
]);

const FILE_EXTENSIONS_FOR_SUBSTITUTION = new Set([
  ".md",
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".txt",
  ".html",
  ".css",
]);

const LOCALE_LANG = /^[a-z]{2,3}$/i;
const LOCALE_REGION = /^[a-z]{2}$/i;
const LOCALE_COMPACT = /^[a-z]{4,5}$/i;
const LOCALE_SCRIPT_SUBTAG = /^[a-z]{2,3}[-_][a-z]{4}(?:[-_][a-z]{2})?$/i;

export class InvalidMantleLocaleError extends Error {
  constructor(
    public readonly invalidLocales: ReadonlyArray<string>,
    source: string,
  ) {
    const hasScriptSubtag = invalidLocales.some((raw) =>
      LOCALE_SCRIPT_SUBTAG.test(raw),
    );
    super(
      `Invalid Mantle locale tag(s) in ${source}: ` +
        invalidLocales.map((s) => `"${s || "<empty>"}"`).join(", ") +
        `. Use Mantle v0.1 locale form like "en" or "zh-TW": a 2/3-letter language plus optional 2-letter region. ` +
        (hasScriptSubtag
          ? `Script subtags such as "zh-Hant", "zh-Hans", "sr-Latn", or "sr-Cyrl" are valid BCP 47 but unsupported in Mantle v0.1; use "zh-TW" for Traditional Chinese or "zh-CN" for Simplified Chinese. `
          : "") +
        `See mantle ADR-0010.`,
    );
    this.name = "InvalidMantleLocaleError";
  }
}

export function canonicalizeMantleLocaleList(
  locales: ReadonlyArray<string>,
  source = "locales",
): ReadonlyArray<string> {
  const canonical: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const raw of locales) {
    const locale = raw.trim();
    const value = canonicalizeMantleLocale(locale);
    if (!value) {
      invalid.push(raw);
      continue;
    }
    if (!seen.has(value)) {
      seen.add(value);
      canonical.push(value);
    }
  }
  if (canonical.length === 0) {
    throw new InvalidMantleLocaleError(
      invalid.length > 0 ? invalid : [...locales],
      source,
    );
  }
  if (invalid.length > 0) {
    throw new InvalidMantleLocaleError(invalid, source);
  }
  return canonical;
}

function canonicalizeMantleLocale(raw: string): string | null {
  if (!raw) return null;
  const parts = raw.split(/[-_]/);
  if (parts.length === 1) {
    const compact = parts[0]!;
    if (LOCALE_LANG.test(compact)) return compact.toLowerCase();
    if (LOCALE_COMPACT.test(compact)) {
      const lang = compact.slice(0, -2);
      const region = compact.slice(-2);
      if (LOCALE_LANG.test(lang) && LOCALE_REGION.test(region)) {
        return `${lang.toLowerCase()}-${region.toUpperCase()}`;
      }
    }
    return null;
  }
  if (parts.length === 2) {
    const [lang, region] = parts;
    if (lang && region && LOCALE_LANG.test(lang) && LOCALE_REGION.test(region)) {
      return `${lang.toLowerCase()}-${region.toUpperCase()}`;
    }
  }
  return null;
}

/**
 * Bootstrap a new mantle consumer project from the starters
 * monorepo. Fetches `sources.json` at the requested ref, downloads
 * the tarball, merges `_common/` + `<archetype>/` + (optional)
 * `themes/<theme-key>/` into the destination, substitutes
 * `{{PLACEHOLDER}}` macros, and returns a RunNotes shape.
 */
export async function createMantle(opts: CreateOptions): Promise<RunNotes> {
  const locales = canonicalizeMantleLocaleList(opts.locales);
  const ref = opts.starterRef ?? "main";
  const sources = await fetchSourcesJson(ref);
  const source = resolveArchetype(opts.archetype, sources);

  const extractedRoot = downloadAndExtractTarball(source, ref);
  try {
    return installFromExtractedRoot({ ...opts, locales, extractedRoot, sources });
  } finally {
    cleanupTempDir(extractedRoot);
  }
}

/**
 * Pure-local variant for tests + reuse: given an already-extracted
 * starters tree, merge + substitute + finalize against `destination`.
 * `sources` defaults to the bundled stale fallback when omitted.
 */
export function installFromExtractedRoot(
  opts: CreateOptions & {
    extractedRoot: string;
    sources?: SourcesJson;
  },
): RunNotes {
  const locales = canonicalizeMantleLocaleList(opts.locales);
  const sources = opts.sources ?? STALE_FALLBACK_SOURCES;
  const source = resolveArchetype(opts.archetype, sources);
  const themeSource = resolveTheme(opts.theme ?? null, sources);
  const resolvedFeatures = resolveFeatures(
    opts.features ?? [],
    opts.archetype,
    sources,
  );

  const filesWritten = mergeStarterIntoDestination({
    extractedRoot: opts.extractedRoot,
    source,
    themeSource,
    features: resolvedFeatures,
    destination: opts.destination,
  });
  const values = buildPlaceholderValues({ ...opts, locales });
  substitutePlaceholdersInTree(opts.destination, values, filesWritten);
  renameDotfilesAfterTemplate(opts.destination, filesWritten);
  mergeFeatureDependenciesIntoPackageJson({
    extractedRoot: opts.extractedRoot,
    destination: opts.destination,
    features: resolvedFeatures,
  });
  resolveCatalogSpecifiers({
    extractedRoot: opts.extractedRoot,
    destination: opts.destination,
    filesWritten,
  });
  const generatedFiles = writeFeaturesManifest({
    destination: opts.destination,
    sources,
    archetype: opts.archetype,
    theme: opts.theme ?? null,
    features: resolvedFeatures,
  });
  const generatedGlueFiles = writeGeneratedFeatureGlue({
    destination: opts.destination,
    archetype: opts.archetype,
    features: resolvedFeatures,
    extractedRoot: opts.extractedRoot,
  });
  const allFiles = [...filesWritten, ...generatedFiles, ...generatedGlueFiles].sort();
  validateNoLeftovers(opts.destination, allFiles);
  if (!opts.skipGitInit) {
    gitInit(opts.destination);
  }
  if (!opts.skipInstall) {
    pnpmInstall(opts.destination);
  }
  return {
    archetype: opts.archetype,
    theme: opts.theme ?? null,
    features: resolvedFeatures.map(toRunNoteFeature),
    starter_source: `${source.repo}/${source.path}`,
    theme_source: themeSource ? `${source.repo}/${themeSource.path}` : null,
    overlays: source.overlays ?? [],
    files_written: allFiles,
    next_step:
      "Mantle: replace HTML comments in mantle/site.md with prose from interview; then commit + invoke provision skill.",
  };
}

function toRunNoteFeature(feature: ResolvedFeature): RunNoteFeature {
  return {
    name: feature.name,
    type: feature.type,
    variant: feature.variant,
    path: feature.path,
    registry_dependencies: feature.registryDependencies,
  };
}

function buildPlaceholderValues(opts: CreateOptions): PlaceholderValues {
  return {
    ARCHETYPE: opts.archetype,
    BRAND: opts.brand,
    DESCRIPTION: opts.description,
    LOCALES: JSON.stringify(opts.locales),
    CANONICAL_LOCALE: opts.locales[0] ?? "en",
    SITE_URL: "https://example.com",
    GITHUB_OWNER: opts.githubOwner,
    INSTALL_TIMESTAMP: new Date().toISOString(),
    INSTALL_SUMMARY: opts.summary,
  };
}

function writeFeaturesManifest(args: {
  destination: string;
  sources: SourcesJson;
  archetype: string;
  theme: string | null;
  features: readonly ResolvedFeature[];
}): readonly string[] {
  const dir = join(args.destination, ".mantle");
  mkdirSync(dir, { recursive: true });
  const relPath = ".mantle/features.json";
  const path = join(args.destination, relPath);
  const manifest = {
    registry: {
      name: "mantle-starters",
      url: "https://mantle.tools/registry.json",
      ...(args.sources.version ? { version: args.sources.version } : {}),
    },
    archetype: {
      name: args.archetype,
      type: "registry:archetype",
    },
    theme: args.theme
      ? {
          name: args.theme,
          type: "registry:theme",
        }
      : null,
    features: args.features.map((feature) => ({
      name: feature.name,
      type: feature.type,
      ...(feature.path ? { path: feature.path } : {}),
      ...(feature.title ? { title: feature.title } : {}),
      ...(feature.description ? { description: feature.description } : {}),
      ...(feature.variant ? { variant: feature.variant } : {}),
      registryDependencies: feature.registryDependencies,
    })),
    resolvedAt: new Date().toISOString(),
  };
  writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
  return [relPath];
}

export interface ImportSpec {
  readonly from: string;
  readonly default?: string;
  readonly named?: ReadonlyArray<string>;
}

interface FeatureGlueRoutes {
  readonly perArchetype?: Readonly<
    Record<string, { readonly imports?: ReadonlyArray<ImportSpec>; readonly decls?: ReadonlyArray<string> }>
  >;
  readonly imports?: ReadonlyArray<ImportSpec>;
  readonly overrides?: ReadonlyArray<{
    readonly collection: string;
    readonly slug: string;
    readonly render: string;
  }>;
}

interface FeatureEnvVar {
  readonly name: string;
  readonly type: "string" | "number" | "boolean";
  readonly optional?: boolean;
  readonly secret?: boolean;
  readonly devDefault?: string;
  readonly description?: string;
}

interface FeatureProvisionSpec {
  readonly from: string;
  readonly binding?: string;
}

interface FeatureAuthMethodsSpec {
  readonly imports?: ReadonlyArray<ImportSpec>;
  readonly entries?: ReadonlyArray<string>;
}

interface FeatureGlueSpec {
  readonly schemaVersion: number;
  readonly manifests?: {
    readonly imports?: ReadonlyArray<ImportSpec>;
    readonly entries?: ReadonlyArray<string>;
  };
  readonly handlers?: {
    readonly imports?: ReadonlyArray<ImportSpec>;
    readonly entries?: ReadonlyArray<string>;
  };
  readonly routes?: FeatureGlueRoutes;
  readonly env?: ReadonlyArray<FeatureEnvVar>;
  readonly provision?: FeatureProvisionSpec;
  /** schemaVersion >= 2. Features contributing customer-facing auth
   *  methods (magic-link, email-OTP, OAuth socials) declare imports +
   *  entries here; the scaffolder aggregates them into
   *  `src/.mantle/generated.auth-methods.ts` exporting
   *  `buildFeatureAuthMethods(env, sender)`. */
  readonly auth_methods?: FeatureAuthMethodsSpec;
  /** schemaVersion >= 3. Features that ship runtime npm dependencies
   *  (e.g. `email-sender-smtp` → `worker-mailer`) declare them here as
   *  a `{ name: version-or-"catalog:" }` map. The scaffolder merges
   *  them into the consumer's `package.json` `dependencies` block
   *  alphabetically; conflicting version specs from multiple features
   *  error at install time (matching the wrangler.toml binding-conflict
   *  rule). `"catalog:"` resolves through the same pnpm-catalog
   *  expansion pass that handles `_common/` package.json entries. */
  readonly dependencies?: Readonly<Record<string, string>>;
}

// schemaVersion 1: manifests / handlers / routes / env / provision.
// schemaVersion 2: adds the `auth_methods` compose target.
// schemaVersion 3: adds the `dependencies` compose target.
const SUPPORTED_GLUE_SCHEMA_VERSIONS: ReadonlySet<number> = new Set([1, 2, 3]);

function loadFeatureGlueSpec(
  extractedRoot: string,
  feature: ResolvedFeature,
): FeatureGlueSpec | null {
  if (!feature.path) return null;
  const gluePath = join(extractedRoot, feature.path, "_compose", "glue.json");
  if (!existsSync(gluePath)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(gluePath, "utf8"));
  } catch (err) {
    throw new Error(
      `Invalid JSON in "${feature.path}/_compose/glue.json": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(
      `Invalid "${feature.path}/_compose/glue.json": expected a JSON object.`,
    );
  }
  const spec = raw as { schemaVersion?: unknown };
  if (typeof spec.schemaVersion !== "number") {
    throw new Error(
      `Missing numeric "schemaVersion" in "${feature.path}/_compose/glue.json".`,
    );
  }
  if (!SUPPORTED_GLUE_SCHEMA_VERSIONS.has(spec.schemaVersion)) {
    const supported = [...SUPPORTED_GLUE_SCHEMA_VERSIONS].sort().join(", ");
    throw new Error(
      `Unsupported _compose/glue.json schemaVersion ${spec.schemaVersion} in "${feature.path}". Scaffolder upgrade required (supported: ${supported}).`,
    );
  }
  return spec as FeatureGlueSpec;
}

interface FeatureWithSpec {
  readonly feature: ResolvedFeature;
  readonly spec: FeatureGlueSpec;
}

function writeGeneratedFeatureGlue(args: {
  destination: string;
  archetype: string;
  features: readonly ResolvedFeature[];
  extractedRoot: string;
}): readonly string[] {
  mkdirSync(join(args.destination, "src", ".mantle"), { recursive: true });

  const pairs: FeatureWithSpec[] = [];
  for (const feature of args.features) {
    const spec = loadFeatureGlueSpec(args.extractedRoot, feature);
    if (spec) pairs.push({ feature, spec });
  }
  const specs = pairs.map((p) => p.spec);

  const files: Array<[string, string]> = [
    ["src/.mantle/generated.manifests.ts", generatedManifestsSource(specs)],
    ["src/.mantle/generated.handlers.ts", generatedHandlersSource(specs)],
    [
      "src/.mantle/generated.routes.ts",
      generatedRoutesSource(specs, args.archetype),
    ],
    [
      "src/.mantle/generated.auth-methods.ts",
      generatedAuthMethodsSource(specs),
    ],
  ];
  const provisionSource = generatedProvisionSource(pairs);
  if (provisionSource !== null) {
    mkdirSync(join(args.destination, "scripts"), { recursive: true });
    files.push(["scripts/.mantle-provision.mjs", provisionSource]);
  }
  for (const [relPath, content] of files) {
    writeFileSync(join(args.destination, relPath), content);
  }
  return files.map(([relPath]) => relPath);
}

// Catalog resolution runs immediately after this, so `"catalog:"` values
// from feature glue resolve through the same pass as the archetype's own
// catalog refs. Divergent specs between features (or between a feature
// and the base layer) error here, mirroring the wrangler.toml composer's
// conflict-on-divergent-config rule.
function mergeFeatureDependenciesIntoPackageJson(args: {
  extractedRoot: string;
  destination: string;
  features: readonly ResolvedFeature[];
}): void {
  const featureDeps = new Map<string, { spec: string; source: string }>();
  for (const feature of args.features) {
    const spec = loadFeatureGlueSpec(args.extractedRoot, feature);
    if (!spec) continue;
    if (spec.dependencies === undefined) continue;
    if (spec.schemaVersion < 3) {
      throw new Error(
        `Feature "${feature.name}" declares schemaVersion ${spec.schemaVersion} but uses the v3-only "dependencies" target. Bump the feature's schemaVersion to 3 (or remove the dependencies block).`,
      );
    }
    if (typeof spec.dependencies !== "object" || Array.isArray(spec.dependencies)) {
      throw new Error(
        `Feature "${feature.name}" glue.json "dependencies" must be a { name: version } object.`,
      );
    }
    for (const [name, version] of Object.entries(spec.dependencies)) {
      if (typeof version !== "string" || version.trim() === "") {
        throw new Error(
          `Feature "${feature.name}" glue.json dependency "${name}" must be a non-empty version string (got ${JSON.stringify(version)}).`,
        );
      }
      const existing = featureDeps.get(name);
      if (existing && existing.spec !== version) {
        throw new Error(
          `Feature "${feature.name}" requires dependency "${name}" = "${version}", but feature "${existing.source}" already requires "${existing.spec}". Resolve the conflict in the contributing features' glue.json before re-installing.`,
        );
      }
      if (!existing) featureDeps.set(name, { spec: version, source: feature.name });
    }
  }
  if (featureDeps.size === 0) return;

  const packageJsonPath = join(args.destination, "package.json");
  if (!existsSync(packageJsonPath)) {
    throw new Error(
      `Feature dependencies were declared but the destination has no package.json at ${packageJsonPath}. Refusing to silently drop runtime deps.`,
    );
  }
  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as Record<
    string,
    unknown
  >;
  let existing: Record<string, string>;
  if (pkg.dependencies === undefined) {
    existing = {};
  } else if (
    pkg.dependencies !== null &&
    typeof pkg.dependencies === "object" &&
    !Array.isArray(pkg.dependencies)
  ) {
    existing = { ...(pkg.dependencies as Record<string, string>) };
  } else {
    throw new Error(
      `Destination package.json "dependencies" field is not a JSON object — refusing to overwrite.`,
    );
  }
  for (const [name, { spec, source }] of featureDeps) {
    if (existing[name] && existing[name] !== spec) {
      throw new Error(
        `Feature "${source}" requires dependency "${name}" = "${spec}", but package.json already declares "${existing[name]}". Resolve before re-installing.`,
      );
    }
    existing[name] = spec;
  }
  // Sort alphabetically for stable diffs across reruns.
  const sorted: Record<string, string> = {};
  for (const name of Object.keys(existing).sort()) sorted[name] = existing[name]!;
  pkg.dependencies = sorted;
  writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + "\n");
}

const PROVISION_FROM_RE = /^[A-Za-z0-9_./@\-]+$/;
const PROVISION_BINDING_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function generatedProvisionSource(pairs: ReadonlyArray<FeatureWithSpec>): string | null {
  const contributors = pairs.filter((p) => p.spec.provision);
  if (contributors.length === 0) {
    // Still emit the file so downstream scripts/provision.mjs can import
    // featureSteps unconditionally and not branch on existence.
    return [
      "// Generated by create-mantle. Do not hand-edit.",
      "export const featureSteps = [];",
      "",
    ].join("\n");
  }
  const seenIdent = new Set<string>();
  const importLines: string[] = [];
  const spreads: string[] = [];
  for (const { feature, spec } of contributors) {
    const provision = spec.provision!;
    const binding = provision.binding ?? "installSteps";
    if (!PROVISION_FROM_RE.test(provision.from)) {
      throw new Error(
        `Invalid provision.from for feature "${feature.name}": "${provision.from}" contains characters that are not safe in a module specifier.`,
      );
    }
    if (!PROVISION_BINDING_RE.test(binding)) {
      throw new Error(
        `Invalid provision.binding for feature "${feature.name}": "${binding}" is not a valid TypeScript identifier.`,
      );
    }
    const ident = uniqueProvisionIdent(feature.name, seenIdent);
    importLines.push(
      `import { ${binding} as ${ident} } from "${provision.from}";`,
    );
    spreads.push(`  ...${ident},`);
  }
  return [
    "// Generated by create-mantle. Do not hand-edit.",
    ...importLines,
    "",
    "export const featureSteps = [",
    ...spreads,
    "];",
    "",
  ].join("\n");
}

function uniqueProvisionIdent(featureName: string, seen: Set<string>): string {
  const base = featureName.replace(/[^A-Za-z0-9_$]/g, "_") + "Provision";
  let candidate = base;
  let n = 1;
  while (seen.has(candidate)) candidate = `${base}_${n++}`;
  seen.add(candidate);
  return candidate;
}

interface MergedImport {
  defaults: Set<string>;
  named: Set<string>;
}

export function renderImports(imports: ReadonlyArray<ImportSpec>): string[] {
  const byModule = new Map<string, MergedImport>();
  for (const imp of imports) {
    const slot = byModule.get(imp.from) ?? { defaults: new Set(), named: new Set() };
    if (imp.default) slot.defaults.add(imp.default);
    for (const name of imp.named ?? []) slot.named.add(name);
    if (!slot.defaults.size && !slot.named.size) {
      throw new Error(
        `ImportSpec from "${imp.from}" needs a default or named binding.`,
      );
    }
    byModule.set(imp.from, slot);
  }
  const modules = [...byModule.keys()].sort();
  return modules.map((from) => {
    const slot = byModule.get(from)!;
    if (slot.defaults.size > 1) {
      throw new Error(
        `Conflicting default imports for "${from}": ${[...slot.defaults].sort().join(", ")}.`,
      );
    }
    const defaultName = slot.defaults.values().next().value;
    const namedClause = slot.named.size > 0
      ? `{ ${[...slot.named].sort().join(", ")} }`
      : null;
    const clause = defaultName && namedClause
      ? `${defaultName}, ${namedClause}`
      : defaultName ?? namedClause;
    return `import ${clause} from "${from}";`;
  });
}

function generatedManifestsSource(specs: ReadonlyArray<FeatureGlueSpec>): string {
  const imports: ImportSpec[] = [];
  const entries: string[] = [];
  for (const spec of specs) {
    for (const imp of spec.manifests?.imports ?? []) imports.push(imp);
    for (const e of spec.manifests?.entries ?? []) entries.push(e);
  }
  if (entries.length === 0) {
    return "export const featureManifestYamls: readonly string[] = [];\n";
  }
  return [
    ...renderImports(imports),
    "",
    `export const featureManifestYamls: readonly string[] = [${entries.join(", ")}];`,
    "",
  ].join("\n");
}

function generatedHandlersSource(specs: ReadonlyArray<FeatureGlueSpec>): string {
  const imports: ImportSpec[] = [];
  const entries: string[] = [];
  const envVars = collectEnvVars(specs);
  for (const spec of specs) {
    for (const imp of spec.handlers?.imports ?? []) imports.push(imp);
    for (const e of spec.handlers?.entries ?? []) entries.push(e);
  }
  const envParam = entries.length === 0 ? "_env" : "env";
  const body = entries.length === 0
    ? "  return {};"
    : ["  return {", ...entries, "  };"].join("\n");
  return [
    "import type { AnyHandler } from \"@aotter/mantle/runtime\";",
    ...renderImports(imports),
    "",
    ...renderFeatureHandlerEnv(envVars),
    "",
    "export function buildFeatureHandlers(",
    `  ${envParam}: FeatureHandlerEnv,`,
    "): Readonly<Record<string, AnyHandler>> {",
    body,
    "}",
    "",
  ].join("\n");
}

const ENV_VAR_NAME_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function collectEnvVars(
  specs: ReadonlyArray<FeatureGlueSpec>,
): ReadonlyMap<string, FeatureEnvVar> {
  const merged = new Map<string, FeatureEnvVar>();
  for (const spec of specs) {
    for (const v of spec.env ?? []) {
      if (!ENV_VAR_NAME_RE.test(v.name)) {
        throw new Error(
          `Invalid env declaration: "${v.name}" is not a valid TypeScript identifier.`,
        );
      }
      const existing = merged.get(v.name);
      if (!existing) {
        merged.set(v.name, v);
        continue;
      }
      if (existing.type !== v.type || (existing.secret ?? false) !== (v.secret ?? false)) {
        throw new Error(
          `Conflicting env declaration for "${v.name}": ` +
            `${existing.type}${existing.secret ? " (secret)" : ""} vs ` +
            `${v.type}${v.secret ? " (secret)" : ""}.`,
        );
      }
      // Merge `optional`: stricter wins so the merged type reflects what any
      // feature requires. Without this rule the kept value depends on feature
      // iteration order and the emitted `?` marker can flip across runs.
      if ((existing.optional ?? true) && !(v.optional ?? true)) {
        merged.set(v.name, { ...existing, optional: false });
      }
    }
  }
  return merged;
}

function renderFeatureHandlerEnv(
  envVars: ReadonlyMap<string, FeatureEnvVar>,
): string[] {
  const names = [...envVars.keys()].sort();
  if (names.length === 0) {
    // Empty interface is the top type for object shapes: any starter `Env`
    // (with arbitrary fields) assigns to it. `Record<string, never>` would
    // be too strict — it only accepts objects with no other keys, which
    // breaks `...buildFeatureHandlers(env)` at the call site. The lint
    // suppression is intentional: the empty body is the whole point.
    return [
      "// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-empty-interface",
      "export interface FeatureHandlerEnv {}",
    ];
  }
  const lines = names.map((name) => {
    const v = envVars.get(name)!;
    const opt = (v.optional ?? true) ? "?" : "";
    return `  readonly ${name}${opt}: ${v.type};`;
  });
  return [
    "export interface FeatureHandlerEnv {",
    ...lines,
    "}",
  ];
}

function generatedRoutesSource(
  specs: ReadonlyArray<FeatureGlueSpec>,
  archetype: string,
): string {
  const imports: ImportSpec[] = [];
  const decls: string[] = [];
  const overrideLines: string[] = [];
  for (const spec of specs) {
    const routes = spec.routes;
    if (!routes) continue;
    for (const imp of routes.imports ?? []) imports.push(imp);
    const archBlock = routes.perArchetype?.[archetype] ?? routes.perArchetype?.["default"];
    for (const imp of archBlock?.imports ?? []) imports.push(imp);
    for (const decl of archBlock?.decls ?? []) decls.push(decl);
    for (const o of routes.overrides ?? []) {
      overrideLines.push(
        "    {",
        `      collection: "${o.collection}",`,
        `      slug: "${o.slug}",`,
        `      render: (ctx) => ${o.render},`,
        "    },",
      );
    }
  }
  const envParam = overrideLines.length === 0 ? "_env" : "env";
  const overridesBody = overrideLines.length === 0
    ? "  return [];"
    : ["  return [", ...overrideLines, "  ];"].join("\n");
  const declBlock = decls.length > 0 ? ["", ...decls] : [];
  return [
    "import type { PublicRouteContext } from \"@aotter/mantle/cloudflare\";",
    "import type { Env } from \"../mantleConfig.js\";",
    ...renderImports(imports),
    ...declBlock,
    "",
    "export interface FeatureSlugOverride {",
    "  readonly collection: string;",
    "  readonly slug: string;",
    "  readonly render: (ctx: PublicRouteContext) => Promise<Response>;",
    "}",
    "",
    "export function buildFeatureSlugOverrides(",
    `  ${envParam}: Env,`,
    "): readonly FeatureSlugOverride[] {",
    overridesBody,
    "}",
    "",
  ].join("\n");
}

function generatedAuthMethodsSource(
  specs: ReadonlyArray<FeatureGlueSpec>,
): string {
  const imports: ImportSpec[] = [];
  const entries: string[] = [];
  for (const spec of specs) {
    for (const imp of spec.auth_methods?.imports ?? []) imports.push(imp);
    for (const e of spec.auth_methods?.entries ?? []) entries.push(e);
  }
  // Always emit `FeatureAuthMethodsEnv` as the structural top object
  // type so any starter `Env` shape assigns. Matches the pattern set
  // by `FeatureHandlerEnv` post #213.
  const envParam = entries.length === 0 ? "_env" : "env";
  const senderParam = entries.length === 0 ? "_sender" : "sender";
  const body = entries.length === 0
    ? "  return [];"
    : ["  return [", ...entries, "  ];"].join("\n");
  return [
    "import type { AuthMethodConfig } from \"@aotter/mantle/cloudflare\";",
    "import type { EmailSender } from \"@aotter/mantle/runtime\";",
    ...renderImports(imports),
    "",
    "// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-empty-interface",
    "export interface FeatureAuthMethodsEnv {}",
    "",
    "export function buildFeatureAuthMethods(",
    `  ${envParam}: FeatureAuthMethodsEnv,`,
    `  ${senderParam}: EmailSender,`,
    "): readonly AuthMethodConfig[] {",
    body,
    "}",
    "",
  ].join("\n");
}

function mergeStarterIntoDestination(args: {
  extractedRoot: string;
  source: ArchetypeSource;
  themeSource: ThemeSource | null;
  features: readonly ResolvedFeature[];
  destination: string;
}): ReadonlyArray<string> {
  const layers: CopyLayer[] = [
    {
      id: "_common",
      kind: "base",
      root: join(args.extractedRoot, "_common"),
    },
    {
      id: args.source.path,
      kind: "base",
      root: join(args.extractedRoot, args.source.path),
    },
  ];
  for (const overlay of args.source.overlays ?? []) {
    layers.push({
      id: overlay,
      kind: "base",
      root: join(args.extractedRoot, overlay),
    });
  }
  for (const feature of args.features) {
    layers.push(featureCopyLayer(args.extractedRoot, feature));
  }
  if (args.themeSource) {
    layers.push({
      id: args.themeSource.path,
      kind: "theme",
      root: join(args.extractedRoot, args.themeSource.path),
    });
  }
  const writtenSet = new Set<string>();
  const owners = new Map<string, CopyLayer>();
  for (const layer of layers) {
    if (!existsSync(layer.root)) continue;
    copyTreeRecording(layer, args.destination, writtenSet, owners);
  }
  return [...writtenSet].sort();
}

type CopyLayerKind = "base" | "feature" | "theme";

interface CopyLayer {
  readonly id: string;
  readonly kind: CopyLayerKind;
  readonly root: string;
}

function featureCopyLayer(extractedRoot: string, feature: ResolvedFeature): CopyLayer {
  if (!feature.path) {
    throw new Error(`Feature "${feature.name}" does not declare a source path.`);
  }
  return {
    id: `feature:${feature.name}`,
    kind: "feature",
    root: join(extractedRoot, feature.path),
  };
}

function copyTreeRecording(
  layer: CopyLayer,
  dst: string,
  writtenRelativeToDst: Set<string>,
  owners: Map<string, CopyLayer>,
): void {
  for (const entry of readdirSync(layer.root, { withFileTypes: true })) {
    if (shouldSkipSourceEntry(entry.name)) continue;
    if (entry.name === "_compose") continue;
    if (isCommonRegistryDirectory(layer, entry.name)) continue;
    const srcPath = join(layer.root, entry.name);
    const dstPath = join(dst, entry.name);
    if (entry.isDirectory()) {
      copyTreeChildren(srcPath, dstPath, dst, layer, writtenRelativeToDst, owners);
    } else if (entry.isFile()) {
      writeFileForLayer(srcPath, dstPath, relative(dst, dstPath), layer, writtenRelativeToDst, owners);
    }
  }
}

function isCommonRegistryDirectory(layer: CopyLayer, entryName: string): boolean {
  return layer.kind === "base" && layer.id === "_common" && entryName === "features";
}

function copyTreeChildren(
  src: string,
  dst: string,
  destinationRoot: string,
  layer: CopyLayer,
  writtenRelativeToDst: Set<string>,
  owners: Map<string, CopyLayer>,
): void {
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (shouldSkipSourceEntry(entry.name)) continue;
    if (entry.name === "_compose") continue;
    const srcPath = join(src, entry.name);
    const dstPath = join(dst, entry.name);
    if (entry.isDirectory()) {
      copyTreeChildren(
        srcPath,
        dstPath,
        destinationRoot,
        layer,
        writtenRelativeToDst,
        owners,
      );
    } else if (entry.isFile()) {
      writeFileForLayer(
        srcPath,
        dstPath,
        relative(destinationRoot, dstPath),
        layer,
        writtenRelativeToDst,
        owners,
      );
    }
  }
}

function shouldSkipSourceEntry(name: string): boolean {
  if (PLACEHOLDER_PATH_BLOCKLIST.has(name)) return true;
  if (name === ".dev.vars") return true;
  if (name.startsWith(".dev.vars.") && !name.endsWith(".example")) return true;
  if (name === ".env" || name === ".env.local") return true;
  if (name.endsWith(".log")) return true;
  if (/^\.fixture(?:\.[^.]+)?\.(?:sql|kv\.json)$/.test(name)) return true;
  if (/^\.mantle-seed\.(?:sql|kv\.json)$/.test(name)) return true;
  return false;
}

function writeFileForLayer(
  srcPath: string,
  dstPath: string,
  relPath: string,
  layer: CopyLayer,
  writtenRelativeToDst: Set<string>,
  owners: Map<string, CopyLayer>,
): void {
  if (!shouldCopyPath(relPath, layer)) return;
  const composer = owners.has(relPath) ? findComposer(relPath) : null;
  if (composer) {
    composer(srcPath, dstPath, layer);
    // owner stays as first writer; relPath already in writtenRelativeToDst.
    return;
  }
  assertCopyAllowed(relPath, layer, owners);
  mkdirSync(dirname(dstPath), { recursive: true });
  cpSync(srcPath, dstPath);
  owners.set(relPath, layer);
  writtenRelativeToDst.add(relPath);
}

type ComposerFn = (srcPath: string, dstPath: string, layer: CopyLayer) => void;

interface ComposerRule {
  readonly match: (relPath: string) => boolean;
  readonly compose: ComposerFn;
}

const LOCALE_JSON_RE = /^src\/i18n\/[^/]+\.json$/;

const COMPOSER_RULES: ReadonlyArray<ComposerRule> = [
  { match: (p) => p === ".dev.vars.example", compose: appendComposable },
  { match: (p) => LOCALE_JSON_RE.test(p), compose: mergeComposableLocale },
  { match: (p) => p === "wrangler.toml", compose: mergeComposableWrangler },
];

function findComposer(relPath: string): ComposerFn | null {
  for (const rule of COMPOSER_RULES) {
    if (rule.match(relPath)) return rule.compose;
  }
  return null;
}

function appendComposable(srcPath: string, dstPath: string, layer: CopyLayer): void {
  const existing = readFileSync(dstPath, "utf8").replace(/\s+$/, "");
  const incoming = readFileSync(srcPath, "utf8").replace(/\s+$/, "");
  if (incoming.length === 0) return;
  const separator = `# --- from ${layer.id} ---\n`;
  const composed = existing.length === 0
    ? `${separator}${incoming}\n`
    : `${existing}\n\n${separator}${incoming}\n`;
  writeFileSync(dstPath, composed);
}

function mergeComposableLocale(
  srcPath: string,
  dstPath: string,
  layer: CopyLayer,
): void {
  const existing = parseLocaleJson(dstPath);
  const incoming = parseLocaleJson(srcPath);
  const merged = deepMergeStrict(existing, incoming, layer.id, []);
  writeFileSync(dstPath, JSON.stringify(sortObjectKeys(merged), null, 2) + "\n");
}

function parseLocaleJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(
      `Invalid locale JSON at "${path}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

const FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

function deepMergeStrict(
  base: unknown,
  incoming: unknown,
  source: string,
  path: ReadonlyArray<string>,
): unknown {
  if (incoming === undefined) return base;
  if (base === undefined) return incoming;
  if (isPlainObject(base) && isPlainObject(incoming)) {
    const result: Record<string, unknown> = Object.assign(Object.create(null), base);
    for (const key of Object.keys(incoming)) {
      if (FORBIDDEN_KEYS.has(key)) {
        throw new Error(
          `i18n merge rejected forbidden key "${key}" at "${[...path, key].join(".")}" (from ${source}).`,
        );
      }
      result[key] = deepMergeStrict(base[key], incoming[key], source, [...path, key]);
    }
    return result;
  }
  // Leaf: must match by value equality. Same key + same value passes;
  // divergent value throws per the i18n collision policy (#194).
  if (jsonEqual(base, incoming)) return base;
  const location = path.length === 0 ? "<root>" : path.join(".");
  throw new Error(
    `i18n merge conflict at "${location}" (from ${source}): ` +
      `${JSON.stringify(base)} vs ${JSON.stringify(incoming)}.`,
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (!isPlainObject(value)) return value;
  const sorted: Record<string, unknown> = Object.create(null);
  for (const k of Object.keys(value).sort()) {
    sorted[k] = sortObjectKeys(value[k]);
  }
  return sorted;
}

// --- wrangler.toml composer ---
//
// Hand-rolled section merger covering the subset the design doc and #198
// require: `[vars]`, `[env.<env>.vars]`, `[[d1_databases]]`, `[[kv_namespaces]]`,
// and top-level scalar keys. Any other section (queues, services, durable
// objects, etc.) is a hard error until a follow-up extends the parser.

interface WranglerBlock {
  readonly kind: "top" | "table" | "array-table";
  readonly header: string | null;
  readonly key: string;
  readonly body: string[];
}

const KEY_VALUE_LINE = /^([A-Za-z_][A-Za-z0-9_\-.]*)\s*=\s*(.+)$/;
const TABLE_HEADER = /^\[([^[\]]+)\]\s*$/;
const ARRAY_TABLE_HEADER = /^\[\[([^[\]]+)\]\]\s*$/;
const MERGE_TABLE_KEY_RE = /^(vars|env\.[A-Za-z0-9_-]+\.vars)$/;
const ARRAY_TABLE_ALLOWED: ReadonlySet<string> = new Set([
  "d1_databases",
  "kv_namespaces",
  // r2_buckets unblocks the `media-r2` feature overlay (#252):
  // selecting the feature merges in a `[[r2_buckets]] binding = "MEDIA"`
  // stanza. Same binding-key dedup as d1 / kv — adding the same
  // binding twice with conflicting config still errors.
  "r2_buckets",
]);

function mergeComposableWrangler(
  srcPath: string,
  dstPath: string,
  layer: CopyLayer,
): void {
  const baseText = readFileSync(dstPath, "utf8");
  const incomingText = readFileSync(srcPath, "utf8");
  const baseBlocks = parseWranglerBlocks(baseText, "existing wrangler.toml");
  const incomingBlocks = parseWranglerBlocks(incomingText, layer.id);
  const merged = mergeWranglerBlocks(baseBlocks, incomingBlocks, layer.id);
  writeFileSync(dstPath, emitWranglerBlocks(merged));
}

function parseWranglerBlocks(text: string, source: string): WranglerBlock[] {
  rejectUnsupportedTomlForms(text, source);
  const lines = text.split(/\r?\n/);
  const blocks: WranglerBlock[] = [];
  let current: { header: string | null; kind: WranglerBlock["kind"]; key: string; body: string[] } = {
    header: null,
    kind: "top",
    key: "<top>",
    body: [],
  };
  for (const rawLine of lines) {
    const line = rawLine;
    const tableMatch = line.match(TABLE_HEADER);
    const arrayMatch = line.match(ARRAY_TABLE_HEADER);
    if (arrayMatch || tableMatch) {
      blocks.push({ ...current, body: current.body });
      const rawKey = (arrayMatch ?? tableMatch)?.[1];
      if (rawKey === undefined) continue;
      current = {
        header: line.trim(),
        kind: arrayMatch ? "array-table" : "table",
        key: rawKey.trim(),
        body: [],
      };
      continue;
    }
    current.body.push(line);
  }
  blocks.push({ ...current, body: current.body });
  // Reject unsupported sections eagerly so we don't silently swallow content.
  for (const block of blocks) {
    if (block.kind === "top") continue;
    if (block.kind === "table" && MERGE_TABLE_KEY_RE.test(block.key)) continue;
    if (block.kind === "array-table" && ARRAY_TABLE_ALLOWED.has(block.key)) continue;
    throw new Error(
      `Wrangler composer cannot handle section [${block.kind === "array-table" ? `[${block.key}]` : block.key}] from ${source}. Supported sections: [vars], [env.<env>.vars], [[d1_databases]], [[kv_namespaces]], [[r2_buckets]]. Other sections (queues, services, durable objects, etc.) are not yet supported.`,
    );
  }
  return blocks;
}

function rejectUnsupportedTomlForms(text: string, source: string): void {
  // The composer only handles single-line key=value, plain section headers,
  // and array-table headers. Anything fancier needs a real TOML parser.
  if (text.includes('"""') || text.includes("'''")) {
    throw new Error(
      `Wrangler composer cannot handle multi-line strings in ${source}. Use single-line values.`,
    );
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith("[") && trimmed.includes("#")) {
      throw new Error(
        `Wrangler composer cannot handle inline comments in section headers (${source}): ${trimmed}`,
      );
    }
    // Inline tables only matter when they appear as a value of a key=value
    // line; we still reject so the composer never silently mishandles them.
    if (/=\s*\{/.test(trimmed) && !trimmed.startsWith("#")) {
      throw new Error(
        `Wrangler composer cannot handle inline tables in ${source}: ${trimmed}`,
      );
    }
  }
}

function mergeWranglerBlocks(
  base: ReadonlyArray<WranglerBlock>,
  incoming: ReadonlyArray<WranglerBlock>,
  source: string,
): WranglerBlock[] {
  const result: WranglerBlock[] = [];
  // Top-level scalar keys merge by key with same-value-pass rule.
  const baseTop = base.find((b) => b.kind === "top");
  const incomingTop = incoming.find((b) => b.kind === "top");
  result.push({
    kind: "top",
    header: null,
    key: "<top>",
    body: mergeKeyValueLines(baseTop?.body ?? [], incomingTop?.body ?? [], source, "<top-level>"),
  });
  // Tables ([vars], [env.X.vars]): merge by key.
  const tablesByKey = new Map<string, string[]>();
  for (const block of base) if (block.kind === "table") tablesByKey.set(block.key, [...block.body]);
  for (const block of incoming) {
    if (block.kind !== "table") continue;
    const existing = tablesByKey.get(block.key) ?? [];
    tablesByKey.set(
      block.key,
      mergeKeyValueLines(existing, block.body, source, `[${block.key}]`),
    );
  }
  // Tables preserve base-layer insertion order; incoming-only sections fall
  // at the end in their incoming order. Sorting alphabetically would break
  // meaningful ordering like `[env.test.vars]` before `[env.production.vars]`.
  for (const [key, body] of tablesByKey) {
    result.push({ kind: "table", header: `[${key}]`, key, body });
  }
  // Array tables ([[d1_databases]] etc.): collect by binding name, unique.
  // Preserve base-layer order; incoming-only bindings follow in incoming order.
  const arrayBindings = new Map<string, Map<string, string[]>>();
  for (const block of [...base, ...incoming]) {
    if (block.kind !== "array-table") continue;
    if (!arrayBindings.has(block.key)) arrayBindings.set(block.key, new Map());
    const binding = extractBindingName(block.body, `[[${block.key}]]`);
    const slot = arrayBindings.get(block.key)!;
    const existing = slot.get(binding);
    if (existing) {
      if (!arrayBlockBodiesEquivalent(existing, block.body)) {
        throw new Error(
          `Wrangler [[${block.key}]] binding "${binding}" declared with conflicting config (from ${source}).`,
        );
      }
      continue;
    }
    slot.set(binding, [...block.body]);
  }
  for (const [key, slot] of arrayBindings) {
    for (const [, body] of slot) {
      result.push({ kind: "array-table", header: `[[${key}]]`, key, body });
    }
  }
  return result;
}

function mergeKeyValueLines(
  baseLines: ReadonlyArray<string>,
  incomingLines: ReadonlyArray<string>,
  source: string,
  scope: string,
): string[] {
  const merged = new Map<string, { value: string; raw: string }>();
  const order: string[] = [];
  const preserve = (line: string): boolean => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return true;
    if (trimmed.startsWith("#")) return true;
    return false;
  };
  const preserved: string[] = [];
  const ingest = (lines: ReadonlyArray<string>, fromLabel: string) => {
    for (const rawLine of lines) {
      if (preserve(rawLine)) {
        if (!merged.size && fromLabel === "base") preserved.push(rawLine);
        continue;
      }
      const match = rawLine.match(KEY_VALUE_LINE);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (key === undefined || rawValue === undefined) continue;
      const value = rawValue.trim();
      const existing = merged.get(key);
      if (existing) {
        if (existing.value === value) continue;
        throw new Error(
          `Wrangler ${scope} key "${key}" set to conflicting values: "${existing.value}" (existing) vs "${value}" (from ${source}).`,
        );
      }
      merged.set(key, { value, raw: rawLine });
      order.push(key);
    }
  };
  ingest(baseLines, "base");
  ingest(incomingLines, "incoming");
  const out: string[] = [...preserved];
  if (preserved.length > 0 && order.length > 0) out.push("");
  for (const key of order) {
    const entry = merged.get(key);
    if (entry) out.push(entry.raw);
  }
  return out;
}

function extractBindingName(body: ReadonlyArray<string>, scope: string): string {
  for (const line of body) {
    const m = line.match(KEY_VALUE_LINE);
    if (!m) continue;
    const [, key, value] = m;
    if (key === "binding" && value !== undefined) {
      return value.trim().replace(/^["']|["']$/g, "");
    }
  }
  throw new Error(`Wrangler ${scope} block has no "binding" field.`);
}

function arrayBlockBodiesEquivalent(
  a: ReadonlyArray<string>,
  b: ReadonlyArray<string>,
): boolean {
  const parse = (lines: ReadonlyArray<string>): Map<string, string> => {
    const map = new Map<string, string>();
    for (const line of lines) {
      const m = line.match(KEY_VALUE_LINE);
      if (!m) continue;
      const [, key, value] = m;
      if (key !== undefined && value !== undefined) {
        map.set(key, value.trim());
      }
    }
    return map;
  };
  const pa = parse(a);
  const pb = parse(b);
  if (pa.size !== pb.size) return false;
  for (const [k, v] of pa) if (pb.get(k) !== v) return false;
  return true;
}

function emitWranglerBlocks(blocks: ReadonlyArray<WranglerBlock>): string {
  const out: string[] = [];
  let needSeparator = false;
  for (const block of blocks) {
    const meaningful = block.body.some((line) => line.trim().length > 0);
    if (block.kind === "top") {
      if (meaningful) {
        for (const line of block.body) out.push(line);
        needSeparator = true;
      }
      continue;
    }
    if (needSeparator) out.push("");
    if (block.header) out.push(block.header);
    for (const line of block.body) out.push(line);
    needSeparator = meaningful;
  }
  // Trim trailing blank lines and add one final newline.
  while (out.length > 0) {
    const last = out[out.length - 1];
    if (last === undefined || last.trim() !== "") break;
    out.pop();
  }
  return out.join("\n") + "\n";
}

function assertCopyAllowed(
  relPath: string,
  layer: CopyLayer,
  owners: ReadonlyMap<string, CopyLayer>,
): void {
  if (layer.kind === "theme") {
    // Defensive: shouldCopyPath filters non-theme paths before we reach here,
    // but keep the check so a future caller cannot bypass the constraint.
    if (!isThemeOverridePath(relPath)) {
      throw new Error(
        `Theme layer "${layer.id}" attempted to write non-theme path "${relPath}".`,
      );
    }
    return;
  }

  const owner = owners.get(relPath);
  if (!owner) return;
  throw new Error(
    `Feature overlay collision at "${relPath}": ${owner.id} already wrote it, ` +
      `${layer.id} attempted to write it again. Register a composable target instead.`,
  );
}

function shouldCopyPath(relPath: string, layer: CopyLayer): boolean {
  if (layer.kind !== "theme") return true;
  if (isThemeOverridePath(relPath)) return true;
  if (relPath === "README.md") return false;
  throw new Error(
    `Theme layer "${layer.id}" attempted to write non-theme path "${relPath}".`,
  );
}

function isThemeOverridePath(relPath: string): boolean {
  return relPath === "src/theme/index.ts" || relPath.startsWith("src/theme/");
}

function resolveCatalogSpecifiers(args: {
  extractedRoot: string;
  destination: string;
  filesWritten: ReadonlyArray<string>;
}): void {
  if (!args.filesWritten.includes("package.json")) return;
  const catalog = readDefaultPnpmCatalog(args.extractedRoot);
  if (catalog.size === 0) return;

  const packageJsonPath = join(args.destination, "package.json");
  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as Record<
    string,
    unknown
  >;
  let changed = false;
  for (const field of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
    const deps = pkg[field];
    if (!deps || typeof deps !== "object" || Array.isArray(deps)) continue;
    for (const [name, spec] of Object.entries(deps as Record<string, unknown>)) {
      if (spec !== "catalog:") continue;
      const resolved = catalog.get(name);
      if (!resolved) {
        throw new Error(`pnpm catalog is missing an entry for ${name}`);
      }
      (deps as Record<string, string>)[name] = resolved;
      changed = true;
    }
  }
  if (changed) {
    writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + "\n");
  }
}

function readDefaultPnpmCatalog(
  extractedRoot: string,
): ReadonlyMap<string, string> {
  const workspacePath = join(extractedRoot, "pnpm-workspace.yaml");
  if (!existsSync(workspacePath)) return new Map();

  const catalog = new Map<string, string>();
  let inCatalog = false;
  for (const line of readFileSync(workspacePath, "utf8").split(/\r?\n/)) {
    if (line.trim() === "catalog:") {
      inCatalog = true;
      continue;
    }
    if (!inCatalog) continue;
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (!line.startsWith("  ")) break;

    const trimmed = line.trim();
    const separator = trimmed.indexOf(":");
    if (separator === -1) continue;
    const rawName = trimmed.slice(0, separator).trim();
    const name = rawName.replace(/^['"]|['"]$/g, "");
    const spec = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/\s+#.*$/, "");
    if (name && spec) catalog.set(name, spec);
  }
  return catalog;
}

function substitutePlaceholdersInTree(
  destination: string,
  values: PlaceholderValues,
  files: ReadonlyArray<string>,
): void {
  for (const relPath of files) {
    if (!shouldSubstituteFile(relPath)) continue;
    const abs = join(destination, relPath);
    if (!isRegularFile(abs)) continue;
    const before = readFileSync(abs, "utf8");
    const after = substitute(before, values);
    if (after !== before) {
      writeFileSync(abs, after);
    }
  }
}

function shouldSubstituteFile(relPath: string): boolean {
  if (relPath.endsWith(".template")) return true;
  const lastDot = relPath.lastIndexOf(".");
  if (lastDot === -1) return false;
  return FILE_EXTENSIONS_FOR_SUBSTITUTION.has(relPath.slice(lastDot));
}

function isRegularFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Renames `<name>.template` artifacts to `<name>` after substitution.
 * This is how `_common/AGENTS.md.template` lands as `AGENTS.md` in
 * the user's project. Returns the rewritten file list in place by
 * mutating the destination filesystem; the caller's `files` array is
 * no longer authoritative for `.template`-named paths after this.
 */
function renameDotfilesAfterTemplate(
  destination: string,
  files: ReadonlyArray<string>,
): void {
  for (const relPath of files) {
    if (!relPath.endsWith(".template")) continue;
    const abs = join(destination, relPath);
    if (!isRegularFile(abs)) continue;
    const finalPath = abs.slice(0, -".template".length);
    cpSync(abs, finalPath);
    execFileSync("rm", [abs]);
  }
}

function validateNoLeftovers(
  destination: string,
  files: ReadonlyArray<string>,
): void {
  const leftovers: Array<{ file: string; macros: ReadonlyArray<string> }> = [];
  for (const relPath of files) {
    const finalRel = relPath.endsWith(".template")
      ? relPath.slice(0, -".template".length)
      : relPath;
    const abs = join(destination, finalRel);
    if (!isRegularFile(abs)) continue;
    if (!shouldSubstituteFile(finalRel)) continue;
    const content = readFileSync(abs, "utf8");
    const found = findLeftovers(content);
    if (found.length > 0) {
      leftovers.push({ file: finalRel, macros: found });
    }
  }
  if (leftovers.length > 0) {
    const lines = leftovers.map(
      (l) => `  ${l.file}: ${l.macros.map((m) => `{{${m}}}`).join(", ")}`,
    );
    throw new Error(
      `Found unsubstituted {{PLACEHOLDER}} macros after install:\n${lines.join("\n")}`,
    );
  }
}

function gitInit(destination: string): void {
  execFileSync("git", ["init", "-q"], { cwd: destination, stdio: "inherit" });
}

function pnpmInstall(destination: string): void {
  execFileSync("pnpm", ["install"], { cwd: destination, stdio: "inherit" });
}
