import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalizeMantleLocaleList,
  type CreateOptions,
  type FeatureSelection,
  type RunNotes,
} from "./index.js";

type JsonRecord = Record<string, unknown>;

const PROJECT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

export interface NormalizedLaunchSession {
  readonly schemaVersion: 1;
  readonly sessionId: string | null;
  readonly expiresAt: string;
  readonly archetype: string;
  readonly projectName: string;
  readonly brand: string;
  readonly description: string;
  readonly locales: ReadonlyArray<string>;
  readonly canonicalLocale: string;
  readonly githubOwner: string;
  readonly adminGithubLogin: string | null;
  readonly summary: string;
  readonly theme: string | null;
  readonly features: ReadonlyArray<FeatureSelection>;
  readonly starterRef?: string;
  readonly repo: LaunchRepo | null;
}

export interface LaunchRepo {
  readonly owner?: string;
  readonly name?: string;
  readonly visibility?: "public" | "private";
  readonly defaultBranch?: string;
}

export interface ParseLaunchSessionOptions {
  readonly now?: Date;
}

export interface LaunchCreateOptions {
  readonly session: NormalizedLaunchSession;
  readonly cwd: string;
  readonly skipInstall?: boolean;
  readonly skipGitInit?: boolean;
  readonly starterRef?: string;
}

export async function loadLaunchSession(
  ref: string,
  opts: ParseLaunchSessionOptions = {},
): Promise<NormalizedLaunchSession> {
  const raw = await readLaunchSessionRef(ref);
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Invalid launch session JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return parseLaunchSession(data, opts);
}

export function parseLaunchSession(
  data: unknown,
  opts: ParseLaunchSessionOptions = {},
): NormalizedLaunchSession {
  const root = asRecord(data, "launch session");
  const schemaVersion = root.schema_version ?? root.schemaVersion ?? root.version;
  if (schemaVersion !== 1) {
    throw new Error("Launch session must include schema_version: 1.");
  }

  const expiresAt = requiredString(root, "expires_at", "expiresAt");
  const expires = new Date(expiresAt);
  if (Number.isNaN(expires.getTime())) {
    throw new Error(`Launch session expires_at is not a valid ISO timestamp: ${expiresAt}`);
  }
  const now = opts.now ?? new Date();
  if (expires.getTime() <= now.getTime()) {
    throw new Error(`Launch session expired at ${expiresAt}.`);
  }

  const github = optionalRecord(root.github, "launch session github");
  const archetype = requiredString(root, "archetype");
  const brand = requiredString(root, "brand", "site_name", "siteName", "name");
  const projectName = normalizeProjectName(
    requiredString(root, "project_name", "projectName", "slug"),
  );
  const githubOwner =
    maybeString(root, "github_owner", "githubOwner") ??
    (github ? maybeString(github, "owner", "admin_login", "adminLogin", "login") : null) ??
    maybeString(root, "admin_github_login", "adminGithubLogin");
  if (!githubOwner) {
    throw new Error(
      "Launch session must include github_owner or admin_github_login.",
    );
  }
  const adminGithubLogin =
    maybeString(root, "admin_github_login", "adminGithubLogin") ??
    (github ? maybeString(github, "admin_login", "adminLogin", "login") : null);

  const { locales, canonicalLocale } = normalizeLaunchLocales(root);
  const description =
    maybeString(root, "description", "site_description", "siteDescription") ??
    `${brand} site.`;
  const summary =
    maybeString(root, "summary", "install_summary", "installSummary") ??
    "Launch from Mantle landing session.";
  const theme = nullableString(root, "theme");
  const starterRef = maybeString(root, "starter_ref", "starterRef", "ref");

  const session: NormalizedLaunchSession = {
    schemaVersion: 1,
    sessionId: maybeString(root, "session_id", "sessionId", "id"),
    expiresAt: expires.toISOString(),
    archetype,
    projectName,
    brand,
    description,
    locales,
    canonicalLocale,
    githubOwner,
    adminGithubLogin,
    summary,
    theme,
    features: parseLaunchFeatures(root.features),
    ...(starterRef ? { starterRef } : {}),
    repo: parseLaunchRepo(root, githubOwner),
  };
  return session;
}

export function createOptionsFromLaunchSession(
  args: LaunchCreateOptions,
): CreateOptions {
  const starterRef = args.starterRef ?? args.session.starterRef;
  return {
    archetype: args.session.archetype,
    projectName: args.session.projectName,
    destination: resolve(args.cwd, args.session.projectName),
    brand: args.session.brand,
    description: args.session.description,
    locales: args.session.locales,
    githubOwner: args.session.githubOwner,
    adminGithubLogin: args.session.adminGithubLogin ?? args.session.githubOwner,
    summary: args.session.summary,
    theme: args.session.theme,
    features: args.session.features,
    ...(starterRef ? { starterRef } : {}),
    ...(args.skipInstall !== undefined ? { skipInstall: args.skipInstall } : {}),
    ...(args.skipGitInit !== undefined ? { skipGitInit: args.skipGitInit } : {}),
  };
}

export function writeLaunchState(args: {
  readonly destination: string;
  readonly session: NormalizedLaunchSession;
  readonly notes: RunNotes;
  readonly sessionRef?: string;
  readonly starterRef?: string;
  readonly now?: Date;
}): string {
  const relPath = ".mantle/launch-state.json";
  const statePath = join(args.destination, relPath);
  mkdirSync(join(args.destination, ".mantle"), { recursive: true });
  const state = {
    schema_version: 1,
    session_id: args.session.sessionId,
    claimed_at: (args.now ?? new Date()).toISOString(),
    expires_at: args.session.expiresAt,
    launch_source: launchSourceKind(args.sessionRef),
    project_name: args.session.projectName,
    archetype: args.session.archetype,
    brand: args.session.brand,
    description: args.session.description,
    summary: args.session.summary,
    locales: args.session.locales,
    canonical_locale: args.session.canonicalLocale,
    theme: args.session.theme,
    features: args.session.features,
    starter_ref: args.starterRef ?? args.session.starterRef ?? null,
    github: {
      owner: args.session.githubOwner,
      admin_login: args.session.adminGithubLogin,
    },
    repo: args.session.repo,
    next_step: args.notes.next_step,
  };
  writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
  return relPath;
}

async function readLaunchSessionRef(ref: string): Promise<string> {
  if (ref.startsWith("https://") || ref.startsWith("http://")) {
    const url = new URL(ref);
    if (url.protocol === "http:" && !isLocalHttpUrl(url)) {
      throw new Error(
        "Launch session URL must use HTTPS unless it points at localhost.",
      );
    }
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch launch session: HTTP ${res.status} ${res.statusText}`);
    }
    return res.text();
  }
  const path = ref.startsWith("file://")
    ? fileURLToPath(ref)
    : isAbsolute(ref)
      ? ref
      : resolve(process.cwd(), ref);
  return readFileSync(path, "utf8");
}

function isLocalHttpUrl(url: URL): boolean {
  return url.hostname === "localhost";
}

function normalizeLaunchLocales(root: JsonRecord): {
  readonly locales: ReadonlyArray<string>;
  readonly canonicalLocale: string;
} {
  const rawLocales = root.locales;
  const localeList =
    typeof rawLocales === "string"
      ? rawLocales.split(",").map((s) => s.trim())
      : rawLocales;
  if (!Array.isArray(localeList)) {
    throw new Error("Launch session must include locales as an array or comma string.");
  }
  if (!localeList.every((locale): locale is string => typeof locale === "string")) {
    throw new Error("Launch session locales must be strings.");
  }
  const locales = canonicalizeMantleLocaleList(localeList, "launch session locales");
  const canonicalRaw = maybeString(root, "canonical_locale", "canonicalLocale");
  const canonicalLocale = canonicalRaw
    ? canonicalizeMantleLocaleList([canonicalRaw], "launch session canonical_locale")[0]
    : locales[0];
  if (!canonicalLocale) {
    throw new Error("Launch session must include at least one locale.");
  }
  if (!locales.includes(canonicalLocale)) {
    throw new Error(
      `Launch session canonical_locale "${canonicalLocale}" is not listed in locales.`,
    );
  }
  return {
    locales: [
      canonicalLocale,
      ...locales.filter((locale) => locale !== canonicalLocale),
    ],
    canonicalLocale,
  };
}

function parseLaunchFeatures(raw: unknown): ReadonlyArray<FeatureSelection> {
  if (raw === undefined || raw === null) return [];
  const items = typeof raw === "string" ? raw.split(",") : raw;
  if (!Array.isArray(items)) {
    throw new Error("Launch session features must be an array or comma string.");
  }
  return items
    .map((item) => parseLaunchFeature(item))
    .filter((item): item is FeatureSelection => item !== null);
}

function parseLaunchFeature(raw: unknown): FeatureSelection | null {
  if (typeof raw === "string") {
    const part = raw.trim();
    if (!part) return null;
    const [name, variant, extra] = part.split(":");
    if (!name || extra !== undefined) {
      throw new Error(
        `Invalid launch session feature "${part}". Use <name> or <name>:<variant>.`,
      );
    }
    return {
      name,
      ...(variant ? { variant } : {}),
    };
  }
  const obj = asRecord(raw, "launch session feature");
  const name = requiredString(obj, "name");
  const variant = nullableString(obj, "variant");
  return {
    name,
    ...(variant ? { variant } : {}),
  };
}

function parseLaunchRepo(root: JsonRecord, githubOwner: string): LaunchRepo | null {
  const repo = optionalRecord(root.repo, "launch session repo");
  const owner = repo ? maybeString(repo, "owner") : null;
  const name =
    (repo ? maybeString(repo, "name") : null) ??
    maybeString(root, "repo_name", "repoName");
  const rawVisibility =
    (repo ? maybeString(repo, "visibility") : null) ??
    maybeString(root, "repo_visibility", "repoVisibility");
  const visibility = parseRepoVisibility(rawVisibility);
  const defaultBranch = repo ? maybeString(repo, "default_branch", "defaultBranch") : null;
  if (!owner && !name && !visibility && !defaultBranch) return null;
  return {
    owner: owner ?? githubOwner,
    ...(name ? { name } : {}),
    ...(visibility ? { visibility } : {}),
    ...(defaultBranch ? { defaultBranch } : {}),
  };
}

function normalizeProjectName(projectName: string): string {
  if (
    !PROJECT_NAME_RE.test(projectName) ||
    projectName.includes("..") ||
    projectName === "." ||
    projectName === ".."
  ) {
    throw new Error(
      `Launch session project_name must be a directory slug, got "${projectName}".`,
    );
  }
  return projectName;
}

function parseRepoVisibility(raw: string | null): "public" | "private" | null {
  if (!raw) return null;
  if (raw === "public" || raw === "private") return raw;
  throw new Error(
    `Launch session repo visibility must be "public" or "private"; got "${raw}".`,
  );
}

function launchSourceKind(
  ref: string | undefined,
): "remote" | "file" | "path" | "unknown" {
  if (!ref) return "unknown";
  if (ref.startsWith("https://") || ref.startsWith("http://")) return "remote";
  if (ref.startsWith("file://")) return "file";
  return "path";
}

function asRecord(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected a JSON object.`);
  }
  return value as JsonRecord;
}

function optionalRecord(value: unknown, label: string): JsonRecord | null {
  if (value === undefined || value === null) return null;
  return asRecord(value, label);
}

function requiredString(obj: JsonRecord, ...names: readonly string[]): string {
  const value = maybeString(obj, ...names);
  if (!value) {
    throw new Error(`Launch session missing ${names[0]}.`);
  }
  return value;
}

function maybeString(obj: JsonRecord, ...names: readonly string[]): string | null {
  for (const name of names) {
    const value = obj[name];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

function nullableString(obj: JsonRecord, ...names: readonly string[]): string | null {
  for (const name of names) {
    const value = obj[name];
    if (value === null) return null;
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed || null;
    }
  }
  return null;
}
