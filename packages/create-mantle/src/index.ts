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

/**
 * Bootstrap a new mantle consumer project from the starters
 * monorepo. Fetches `sources.json` at the requested ref, downloads
 * the tarball, merges `_common/` + `<archetype>/` + (optional)
 * `themes/<theme-key>/` into the destination, substitutes
 * `{{PLACEHOLDER}}` macros, and returns a RunNotes shape.
 */
export async function createMantle(opts: CreateOptions): Promise<RunNotes> {
  const ref = opts.starterRef ?? "main";
  const sources = await fetchSourcesJson(ref);
  const source = resolveArchetype(opts.archetype, sources);

  const extractedRoot = downloadAndExtractTarball(source, ref);
  try {
    return installFromExtractedRoot({ ...opts, extractedRoot, sources });
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
  const values = buildPlaceholderValues(opts);
  substitutePlaceholdersInTree(opts.destination, values, filesWritten);
  renameDotfilesAfterTemplate(opts.destination, filesWritten);
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
}

const SUPPORTED_GLUE_SCHEMA_VERSIONS: ReadonlySet<number> = new Set([1]);

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

function writeGeneratedFeatureGlue(args: {
  destination: string;
  archetype: string;
  features: readonly ResolvedFeature[];
  extractedRoot: string;
}): readonly string[] {
  const dir = join(args.destination, "src", ".mantle");
  mkdirSync(dir, { recursive: true });

  const specs = args.features
    .map((feature) => loadFeatureGlueSpec(args.extractedRoot, feature))
    .filter((s): s is FeatureGlueSpec => Boolean(s));

  const files: Array<[string, string]> = [
    ["src/.mantle/generated.manifests.ts", generatedManifestsSource(specs)],
    ["src/.mantle/generated.handlers.ts", generatedHandlersSource(specs)],
    [
      "src/.mantle/generated.routes.ts",
      generatedRoutesSource(specs, args.archetype),
    ],
  ];
  for (const [relPath, content] of files) {
    writeFileSync(join(args.destination, relPath), content);
  }
  return files.map(([relPath]) => relPath);
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
    "export interface FeatureHandlerEnv {",
    "  readonly TURNSTILE_SECRET_KEY?: string;",
    "}",
    "",
    "export function buildFeatureHandlers(",
    `  ${envParam}: FeatureHandlerEnv,`,
    "): Readonly<Record<string, AnyHandler>> {",
    body,
    "}",
    "",
  ].join("\n");
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
    if (PLACEHOLDER_PATH_BLOCKLIST.has(entry.name)) continue;
    if (entry.name === "_compose") continue;
    const srcPath = join(layer.root, entry.name);
    const dstPath = join(dst, entry.name);
    if (entry.isDirectory()) {
      copyTreeChildren(srcPath, dstPath, dst, layer, writtenRelativeToDst, owners);
    } else if (entry.isFile()) {
      writeFileForLayer(srcPath, dstPath, relative(dst, dstPath), layer, writtenRelativeToDst, owners);
    }
  }
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
    if (PLACEHOLDER_PATH_BLOCKLIST.has(entry.name)) continue;
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

function writeFileForLayer(
  srcPath: string,
  dstPath: string,
  relPath: string,
  layer: CopyLayer,
  writtenRelativeToDst: Set<string>,
  owners: Map<string, CopyLayer>,
): void {
  if (!shouldCopyPath(relPath, layer)) return;
  if (owners.has(relPath) && COMPOSABLE_TARGETS.has(relPath)) {
    appendComposable(srcPath, dstPath, layer);
    // owner stays as first writer; relPath already in writtenRelativeToDst.
    return;
  }
  assertCopyAllowed(relPath, layer, owners);
  mkdirSync(dirname(dstPath), { recursive: true });
  cpSync(srcPath, dstPath);
  owners.set(relPath, layer);
  writtenRelativeToDst.add(relPath);
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

const COMPOSABLE_TARGETS: ReadonlySet<string> = new Set([
  ".dev.vars.example",
]);

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
