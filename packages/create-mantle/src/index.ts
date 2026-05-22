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

interface ImportSpec {
  readonly from: string;
  readonly default?: string;
  readonly named?: ReadonlyArray<string>;
}

interface FeatureContribution {
  readonly manifestImports?: ReadonlyArray<ImportSpec>;
  readonly manifestEntries?: ReadonlyArray<string>;
  readonly handlerImports?: ReadonlyArray<ImportSpec>;
  readonly handlerEntries?: ReadonlyArray<string>;
  readonly routeTemplateImport?: (archetype: string) => string;
  readonly routeOverrides?: ReadonlyArray<{
    readonly collection: string;
    readonly slug: string;
    readonly render: string;
  }>;
  readonly routeHelpers?: ReadonlyArray<string>;
}

const FEATURE_CONTRIBUTIONS: Readonly<Record<string, FeatureContribution>> = {
  contact: {
    manifestImports: [
      { default: "contactYaml", from: "../../manifests/contact.yaml" },
    ],
    manifestEntries: ["contactYaml"],
    handlerImports: [
      { named: ["cloudflareTurnstileCheck"], from: "@aotter/mantle/cloudflare" },
      { named: ["slackNotify"], from: "../features/contact/slackNotify.js" },
    ],
    handlerEntries: [
      "    captchaCheck: cloudflareTurnstileCheck({",
      "      secret: env.TURNSTILE_SECRET_KEY ?? \"dev-stub\",",
      "    }) as AnyHandler,",
      "    slackNotify: slackNotify as AnyHandler,",
    ],
    routeTemplateImport: (archetype) =>
      archetype === "publication"
        ? [
            "import { baseline } from \"../themeWiring.js\";",
            "",
            "const { contact: contactTemplate } = baseline.templates;",
          ].join("\n")
        : "import { contactTemplate } from \"../theme.default/templates/index.js\";",
    routeOverrides: [
      {
        collection: "page-translations",
        slug: "contact",
        render: "renderContact(ctx, env)",
      },
    ],
    routeHelpers: [
      "async function renderContact(",
      "  ctx: PublicRouteContext,",
      "  env: Env,",
      "): Promise<Response> {",
      "  const { runtime, site, locale } = ctx;",
      "  const all = await runtime.listEntries.execute({",
      "    collection: \"page-translations\",",
      "    status: \"published\",",
      "    limit: 50,",
      "  });",
      "  const entry = all.find(",
      "    (e) =>",
      "      (e.data as { slug?: string }).slug === \"contact\" &&",
      "      (e.data as { locale?: string }).locale === locale,",
      "  );",
      "  const data = (entry?.data ?? {}) as {",
      "    title?: string;",
      "    intro?: string;",
      "    body?: string;",
      "  };",
      "  const html = contactTemplate({",
      "    site,",
      "    locale,",
      "    page: {",
      "      title: data.title ?? \"\",",
      "      intro: data.intro,",
      "      body: data.body ?? \"\",",
      "    },",
      "    turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? \"1x00000000000000000000AA\",",
      "  });",
      "  return new Response(html, {",
      "    status: 200,",
      "    headers: {",
      "      \"content-type\": \"text/html; charset=utf-8\",",
      "      \"cache-control\": \"public, max-age=60, s-maxage=60\",",
      "    },",
      "  });",
      "}",
    ],
  },
};

function writeGeneratedFeatureGlue(args: {
  destination: string;
  archetype: string;
  features: readonly ResolvedFeature[];
}): readonly string[] {
  const dir = join(args.destination, "src", ".mantle");
  mkdirSync(dir, { recursive: true });

  const contributions = args.features
    .map((feature) => FEATURE_CONTRIBUTIONS[feature.name])
    .filter((c): c is FeatureContribution => Boolean(c));

  const files: Array<[string, string]> = [
    ["src/.mantle/generated.manifests.ts", generatedManifestsSource(contributions)],
    ["src/.mantle/generated.handlers.ts", generatedHandlersSource(contributions)],
    [
      "src/.mantle/generated.routes.ts",
      generatedRoutesSource(contributions, args.archetype),
    ],
  ];
  for (const [relPath, content] of files) {
    writeFileSync(join(args.destination, relPath), content);
  }
  return files.map(([relPath]) => relPath);
}

function renderImportStatement(spec: ImportSpec): string {
  const named = spec.named && spec.named.length > 0
    ? `{ ${spec.named.join(", ")} }`
    : null;
  const clause = spec.default && named
    ? `${spec.default}, ${named}`
    : spec.default ?? named;
  if (!clause) {
    throw new Error(
      `ImportSpec from "${spec.from}" needs a default or named binding.`,
    );
  }
  return `import ${clause} from "${spec.from}";`;
}

function renderImports(imports: ReadonlyArray<ImportSpec>): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const imp of imports) {
    const line = renderImportStatement(imp);
    if (seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
  }
  return lines;
}

function generatedManifestsSource(
  contributions: ReadonlyArray<FeatureContribution>,
): string {
  const imports: ImportSpec[] = [];
  const entries: string[] = [];
  for (const c of contributions) {
    if (c.manifestImports) imports.push(...c.manifestImports);
    if (c.manifestEntries) entries.push(...c.manifestEntries);
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

function generatedHandlersSource(
  contributions: ReadonlyArray<FeatureContribution>,
): string {
  const imports: ImportSpec[] = [];
  const entries: string[] = [];
  for (const c of contributions) {
    if (c.handlerImports) imports.push(...c.handlerImports);
    if (c.handlerEntries) entries.push(...c.handlerEntries);
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
  contributions: ReadonlyArray<FeatureContribution>,
  archetype: string,
): string {
  const templateImports: string[] = [];
  const overrideLines: string[] = [];
  const helperBlocks: string[] = [];
  for (const c of contributions) {
    if (c.routeTemplateImport) {
      templateImports.push(c.routeTemplateImport(archetype));
    }
    for (const o of c.routeOverrides ?? []) {
      overrideLines.push(
        "    {",
        `      collection: "${o.collection}",`,
        `      slug: "${o.slug}",`,
        `      render: (ctx) => ${o.render},`,
        "    },",
      );
    }
    if (c.routeHelpers && c.routeHelpers.length > 0) {
      helperBlocks.push(c.routeHelpers.join("\n"));
    }
  }
  const envParam = overrideLines.length === 0 ? "_env" : "env";
  const overridesBody = overrideLines.length === 0
    ? "  return [];"
    : ["  return [", ...overrideLines, "  ];"].join("\n");
  return [
    "import type { PublicRouteContext } from \"@aotter/mantle/cloudflare\";",
    "import type { Env } from \"../mantleConfig.js\";",
    ...templateImports,
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
    ...helperBlocks.flatMap((block) => [block, ""]),
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
  const incoming = readFileSync(srcPath, "utf8").replace(/^\s+|\s+$/g, "");
  if (incoming.length === 0) return;
  const composed = `${existing}\n\n# --- from ${layer.id} ---\n${incoming}\n`;
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
