import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installFromExtractedRoot, renderImports } from "../src/index.js";

let tempRoot: string;

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), "create-mantle-test-"));
});
afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

function writeFile(path: string, content: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

function fixtureExtractedRoot(): string {
  const root = join(tempRoot, "extracted");
  mkdirSync(join(root, "_common", "mantle"), { recursive: true });
  mkdirSync(join(root, "publication", "src"), { recursive: true });
  mkdirSync(join(root, "blank", "src"), { recursive: true });

  writeFile(
    join(root, "pnpm-workspace.yaml"),
    [
      "packages:",
      '  - "publication"',
      '  - "blank"',
      "",
      "catalog:",
      "  hono: ^4.12.19",
      "  '@types/node': ^25",
      "",
    ].join("\n"),
  );

  writeFile(
    join(root, "_common", "AGENTS.md.template"),
    "# {{BRAND}} ({{ARCHETYPE}})\nPublic site: {{SITE_URL}}\nOwner: {{GITHUB_OWNER}}\n",
  );
  writeFile(
    join(root, "_common", "mantle", "site.md.template"),
    `---
archetype: {{ARCHETYPE}}
brand: {{BRAND}}
locales: {{LOCALES}}
canonical_locale: {{CANONICAL_LOCALE}}
site_url: {{SITE_URL}}
revisions:
  - at: {{INSTALL_TIMESTAMP}}
    by: install
    summary: {{INSTALL_SUMMARY}}
---

body
`,
  );
  writeFile(
    join(root, "_common", ".gitignore.template"),
    "node_modules\n.wrangler\n",
  );

  // publication starter (minimal)
  writeFile(
    join(root, "publication", "package.json"),
    JSON.stringify(
      {
        name: "{{BRAND}}",
        private: true,
        dependencies: { hono: "catalog:" },
        devDependencies: { "@types/node": "catalog:" },
      },
      null,
      2,
    ) + "\n",
  );
  writeFile(
    join(root, "publication", "src", "mantleConfig.ts"),
    `export const config = { brand: "{{BRAND}}", origin: "{{SITE_URL}}" };\n`,
  );

  // blank starter (minimal)
  writeFile(
    join(root, "blank", "package.json"),
    JSON.stringify({ name: "blank-{{BRAND}}", private: true }, null, 2) + "\n",
  );
  return root;
}

function commonOpts() {
  return {
    projectName: "demo",
    brand: "Lab Cafe",
    description: "Notes from Taipei.",
    locales: ["zh-TW", "en"],
    githubOwner: "phsu",
    summary: "bootstrapped presence site",
    skipInstall: true,
    skipGitInit: true,
  };
}

describe("installFromExtractedRoot", () => {
  it("merges _common/ then archetype dir, with archetype winning on conflict", () => {
    const extractedRoot = fixtureExtractedRoot();
    const destination = join(tempRoot, "out");
    mkdirSync(destination, { recursive: true });

    const notes = installFromExtractedRoot({
      ...commonOpts(),
      archetype: "publication",
      destination,
      extractedRoot,
    });

    expect(notes.starter_source).toBe(
      "aotter/mantle-starters/publication",
    );
    expect(notes.overlays).toEqual([]);
    expect(existsSync(join(destination, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(destination, "mantle", "site.md"))).toBe(true);
    expect(existsSync(join(destination, "src", "mantleConfig.ts"))).toBe(true);

    const agents = readFileSync(join(destination, "AGENTS.md"), "utf8");
    expect(agents).toContain("# Lab Cafe (publication)");
    expect(agents).toContain("Public site: https://example.com");
    expect(agents).toContain("Owner: phsu");

    const mantle = readFileSync(
      join(destination, "mantle", "site.md"),
      "utf8",
    );
    expect(mantle).toContain('locales: ["zh-TW","en"]');
    expect(mantle).toContain("canonical_locale: zh-TW");
    expect(mantle).toMatch(/at: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);

    const cfg = readFileSync(join(destination, "src", "mantleConfig.ts"), "utf8");
    expect(cfg).toContain('brand: "Lab Cafe"');
  });

  it("resolves pnpm catalog specifiers in the scaffolded package.json", () => {
    const extractedRoot = fixtureExtractedRoot();
    const destination = join(tempRoot, "out-catalog");
    mkdirSync(destination, { recursive: true });

    installFromExtractedRoot({
      ...commonOpts(),
      archetype: "publication",
      destination,
      extractedRoot,
    });

    const pkg = JSON.parse(
      readFileSync(join(destination, "package.json"), "utf8"),
    );
    expect(pkg.dependencies.hono).toBe("^4.12.19");
    expect(pkg.devDependencies["@types/node"]).toBe("^25");
  });

  it("emits a feature manifest for resolved source recipes", () => {
    const extractedRoot = fixtureExtractedRoot();
    writeFile(
      join(extractedRoot, "registry", "features", "contact", "README.md"),
      "contact feature\n",
    );
    writeFile(
      join(extractedRoot, "registry", "features", "contact", "_compose", "glue.json"),
      JSON.stringify({
        schemaVersion: 1,
        manifests: {
          imports: [{ default: "contactYaml", from: "../../manifests/contact.yaml" }],
          entries: ["contactYaml"],
        },
      }),
    );
    const destination = join(tempRoot, "out-features");
    mkdirSync(destination, { recursive: true });

    const notes = installFromExtractedRoot({
      ...commonOpts(),
      archetype: "publication",
      features: [{ name: "contact" }],
      destination,
      extractedRoot,
      sources: {
        archetypes: { publication: { path: "publication" } },
        features: {
          contact: {
            path: "registry/features/contact",
            title: "Contact Form",
            applicableArchetypes: ["publication"],
          },
        },
        themes: {},
        roadmap: [],
        version: "0.0.11-alpha.15",
      },
    });

    expect(notes.features).toEqual([
      {
        name: "contact",
        type: "registry:feature",
        variant: null,
        path: "registry/features/contact",
        registry_dependencies: [],
      },
    ]);
    expect(notes.files_written).toContain(".mantle/features.json");
    expect(notes.files_written).toContain("src/.mantle/generated.handlers.ts");
    expect(notes.files_written).toContain("src/.mantle/generated.manifests.ts");
    expect(notes.files_written).toContain("src/.mantle/generated.routes.ts");

    const manifest = JSON.parse(
      readFileSync(join(destination, ".mantle", "features.json"), "utf8"),
    );
    expect(manifest.registry).toEqual({
      name: "mantle-starters",
      url: "https://mantle.tools/registry.json",
      version: "0.0.11-alpha.15",
    });
    expect(manifest.archetype).toEqual({
      name: "publication",
      type: "registry:archetype",
    });
    expect(manifest.features).toEqual([
      {
        name: "contact",
        type: "registry:feature",
        path: "registry/features/contact",
        title: "Contact Form",
        registryDependencies: [],
      },
    ]);
    expect(typeof manifest.resolvedAt).toBe("string");
    expect(
      readFileSync(join(destination, "src", ".mantle", "generated.manifests.ts"), "utf8"),
    ).toContain("../../manifests/contact.yaml");
  });

  it("emits empty feature glue stubs when no features are requested", () => {
    const extractedRoot = fixtureExtractedRoot();
    const destination = join(tempRoot, "out-no-features");
    mkdirSync(destination, { recursive: true });

    const notes = installFromExtractedRoot({
      ...commonOpts(),
      archetype: "publication",
      destination,
      extractedRoot,
    });

    expect(notes.features).toEqual([]);
    expect(notes.files_written).toContain("src/.mantle/generated.handlers.ts");
    expect(notes.files_written).toContain("src/.mantle/generated.manifests.ts");
    expect(notes.files_written).toContain("src/.mantle/generated.routes.ts");

    const manifests = readFileSync(
      join(destination, "src", ".mantle", "generated.manifests.ts"),
      "utf8",
    );
    expect(manifests).toContain(
      "export const featureManifestYamls: readonly string[] = [];",
    );

    const handlers = readFileSync(
      join(destination, "src", ".mantle", "generated.handlers.ts"),
      "utf8",
    );
    expect(handlers).toContain("export function buildFeatureHandlers(");
    expect(handlers).toContain("return {};");
    expect(handlers).not.toContain("contact");
    expect(handlers).toContain("// No feature declares env vars.");
    expect(handlers).not.toContain("TURNSTILE_SECRET_KEY");

    const routes = readFileSync(
      join(destination, "src", ".mantle", "generated.routes.ts"),
      "utf8",
    );
    expect(routes).toContain("export function buildFeatureSlugOverrides(");
    expect(routes).toContain("return [];");
    expect(routes).not.toContain("contact");
  });

  it("generates feature glue from a feature's _compose/glue.json", () => {
    const extractedRoot = fixtureExtractedRoot();
    writeFile(
      join(extractedRoot, "registry", "features", "contact", "README.md"),
      "contact feature\n",
    );
    writeFile(
      join(extractedRoot, "registry", "features", "contact", "_compose", "glue.json"),
      JSON.stringify({
        schemaVersion: 1,
        handlers: {
          imports: [
            { named: ["cloudflareTurnstileCheck"], from: "@aotter/mantle/cloudflare" },
            { named: ["slackNotify"], from: "../features/contact/slackNotify.js" },
          ],
          entries: [
            "    captchaCheck: cloudflareTurnstileCheck({",
            '      secret: env.TURNSTILE_SECRET_KEY ?? "dev-stub",',
            "    }) as AnyHandler,",
            "    slackNotify: slackNotify as AnyHandler,",
          ],
        },
        routes: {
          perArchetype: {
            default: {
              imports: [
                { named: ["contactTemplate"], from: "../theme.default/templates/index.js" },
              ],
            },
          },
          imports: [
            { named: ["renderContact"], from: "../features/contact/renderContact.js" },
          ],
          overrides: [
            {
              collection: "page-translations",
              slug: "contact",
              render: "renderContact(ctx, env, contactTemplate)",
            },
          ],
        },
      }),
    );
    const destination = join(tempRoot, "out-feature-glue");
    mkdirSync(destination, { recursive: true });

    installFromExtractedRoot({
      ...commonOpts(),
      archetype: "intake",
      features: [{ name: "contact" }],
      destination,
      extractedRoot,
      sources: {
        archetypes: { intake: { path: "publication" } },
        features: {
          contact: {
            path: "registry/features/contact",
            applicableArchetypes: ["intake"],
          },
        },
        themes: {},
        roadmap: [],
      },
    });

    const handlers = readFileSync(
      join(destination, "src", ".mantle", "generated.handlers.ts"),
      "utf8",
    );
    expect(handlers).toContain(
      'import { slackNotify } from "../features/contact/slackNotify.js";',
    );
    expect(handlers).toContain("captchaCheck: cloudflareTurnstileCheck(");
    expect(handlers).toContain("slackNotify: slackNotify as AnyHandler,");

    const routes = readFileSync(
      join(destination, "src", ".mantle", "generated.routes.ts"),
      "utf8",
    );
    // Non-publication archetypes fall through to the "default" perArchetype block.
    expect(routes).toContain(
      'import { contactTemplate } from "../theme.default/templates/index.js";',
    );
    expect(routes).toContain(
      'import { renderContact } from "../features/contact/renderContact.js";',
    );
    expect(routes).toContain('slug: "contact",');
    expect(routes).toContain("renderContact(ctx, env, contactTemplate)");
  });

  it("uses the publication perArchetype block when archetype matches", () => {
    const extractedRoot = fixtureExtractedRoot();
    writeFile(
      join(extractedRoot, "registry", "features", "contact", "_compose", "glue.json"),
      JSON.stringify({
        schemaVersion: 1,
        routes: {
          perArchetype: {
            publication: {
              imports: [{ named: ["baseline"], from: "../themeWiring.js" }],
              decls: ["const { contact: contactTemplate } = baseline.templates;"],
            },
            default: {
              imports: [
                { named: ["contactTemplate"], from: "../theme.default/templates/index.js" },
              ],
            },
          },
          overrides: [
            {
              collection: "page-translations",
              slug: "contact",
              render: "contactTemplate({})",
            },
          ],
        },
      }),
    );
    const destination = join(tempRoot, "out-feature-glue-publication");
    mkdirSync(destination, { recursive: true });

    installFromExtractedRoot({
      ...commonOpts(),
      archetype: "publication",
      features: [{ name: "contact" }],
      destination,
      extractedRoot,
      sources: {
        archetypes: { publication: { path: "publication" } },
        features: {
          contact: {
            path: "registry/features/contact",
            applicableArchetypes: ["publication"],
          },
        },
        themes: {},
        roadmap: [],
      },
    });

    const routes = readFileSync(
      join(destination, "src", ".mantle", "generated.routes.ts"),
      "utf8",
    );
    expect(routes).toContain('import { baseline } from "../themeWiring.js";');
    expect(routes).toContain(
      "const { contact: contactTemplate } = baseline.templates;",
    );
    expect(routes).not.toContain('../theme.default/templates/index.js');
  });

  it("rejects a _compose/glue.json with an unsupported schemaVersion", () => {
    const extractedRoot = fixtureExtractedRoot();
    writeFile(
      join(extractedRoot, "registry", "features", "future", "_compose", "glue.json"),
      JSON.stringify({ schemaVersion: 99 }),
    );
    const destination = join(tempRoot, "out-bad-schema");
    mkdirSync(destination, { recursive: true });

    expect(() =>
      installFromExtractedRoot({
        ...commonOpts(),
        archetype: "publication",
        features: [{ name: "future" }],
        destination,
        extractedRoot,
        sources: {
          archetypes: { publication: { path: "publication" } },
          features: {
            future: {
              path: "registry/features/future",
              applicableArchetypes: ["publication"],
            },
          },
          themes: {},
          roadmap: [],
        },
      }),
    ).toThrow(/Unsupported _compose\/glue\.json schemaVersion 99/);
  });

  it("rejects a malformed _compose/glue.json with a helpful message", () => {
    const extractedRoot = fixtureExtractedRoot();
    writeFile(
      join(extractedRoot, "registry", "features", "broken", "_compose", "glue.json"),
      "{not json",
    );
    const destination = join(tempRoot, "out-bad-json");
    mkdirSync(destination, { recursive: true });

    expect(() =>
      installFromExtractedRoot({
        ...commonOpts(),
        archetype: "publication",
        features: [{ name: "broken" }],
        destination,
        extractedRoot,
        sources: {
          archetypes: { publication: { path: "publication" } },
          features: {
            broken: {
              path: "registry/features/broken",
              applicableArchetypes: ["publication"],
            },
          },
          themes: {},
          roadmap: [],
        },
      }),
    ).toThrow(/Invalid JSON in "registry\/features\/broken\/_compose\/glue\.json"/);
  });

  it("rejects a top-level JSON array as _compose/glue.json", () => {
    const extractedRoot = fixtureExtractedRoot();
    writeFile(
      join(extractedRoot, "registry", "features", "arr", "_compose", "glue.json"),
      "[1, 2, 3]",
    );
    const destination = join(tempRoot, "out-array-glue");
    mkdirSync(destination, { recursive: true });

    expect(() =>
      installFromExtractedRoot({
        ...commonOpts(),
        archetype: "publication",
        features: [{ name: "arr" }],
        destination,
        extractedRoot,
        sources: {
          archetypes: { publication: { path: "publication" } },
          features: {
            arr: {
              path: "registry/features/arr",
              applicableArchetypes: ["publication"],
            },
          },
          themes: {},
          roadmap: [],
        },
      }),
    ).toThrow(/expected a JSON object/);
  });

  it("rejects a _compose/glue.json with a non-numeric schemaVersion", () => {
    const extractedRoot = fixtureExtractedRoot();
    writeFile(
      join(extractedRoot, "registry", "features", "strver", "_compose", "glue.json"),
      JSON.stringify({ schemaVersion: "1" }),
    );
    const destination = join(tempRoot, "out-str-schema");
    mkdirSync(destination, { recursive: true });

    expect(() =>
      installFromExtractedRoot({
        ...commonOpts(),
        archetype: "publication",
        features: [{ name: "strver" }],
        destination,
        extractedRoot,
        sources: {
          archetypes: { publication: { path: "publication" } },
          features: {
            strver: {
              path: "registry/features/strver",
              applicableArchetypes: ["publication"],
            },
          },
          themes: {},
          roadmap: [],
        },
      }),
    ).toThrow(/Missing numeric "schemaVersion"/);
  });

  it("copies feature source files alongside emitting glue imports for them", () => {
    // Covers the end-to-end path: feature ships a TS file under
    // src/features/<name>/, generates glue that imports from that file,
    // and the install lands both the import target and the generator output
    // so the resulting project compiles without further wiring.
    const extractedRoot = fixtureExtractedRoot();
    writeFile(
      join(extractedRoot, "registry", "features", "greeter", "_compose", "glue.json"),
      JSON.stringify({
        schemaVersion: 1,
        handlers: {
          imports: [
            { named: ["sayHello"], from: "../features/greeter/sayHello.js" },
          ],
          entries: ["    sayHello: sayHello as AnyHandler,"],
        },
      }),
    );
    writeFile(
      join(
        extractedRoot,
        "registry",
        "features",
        "greeter",
        "src",
        "features",
        "greeter",
        "sayHello.ts",
      ),
      "export const sayHello = () => new Response('hi');\n",
    );
    const destination = join(tempRoot, "out-feature-source");
    mkdirSync(destination, { recursive: true });

    installFromExtractedRoot({
      ...commonOpts(),
      archetype: "publication",
      features: [{ name: "greeter" }],
      destination,
      extractedRoot,
      sources: {
        archetypes: { publication: { path: "publication" } },
        features: {
          greeter: {
            path: "registry/features/greeter",
            applicableArchetypes: ["publication"],
          },
        },
        themes: {},
        roadmap: [],
      },
    });

    expect(
      existsSync(join(destination, "src", "features", "greeter", "sayHello.ts")),
    ).toBe(true);
    const handlers = readFileSync(
      join(destination, "src", ".mantle", "generated.handlers.ts"),
      "utf8",
    );
    expect(handlers).toContain(
      'import { sayHello } from "../features/greeter/sayHello.js";',
    );
    expect(handlers).toContain("sayHello: sayHello as AnyHandler,");
  });

  it("composes .dev.vars.example from archetype and a feature fragment", () => {
    // Previously: any feature writing .dev.vars.example would throw
    // "Feature overlay collision" because the file was not a composable target.
    // Now: the feature fragment is concatenated onto the archetype's file with
    // a "# --- from feature:<name> ---" separator so both vars survive.
    const extractedRoot = fixtureExtractedRoot();
    writeFile(
      join(extractedRoot, "publication", ".dev.vars.example"),
      "ARCHETYPE_VAR=base\n",
    );
    writeFile(
      join(extractedRoot, "registry", "features", "alpha", ".dev.vars.example"),
      "ALPHA_VAR=hello\n",
    );

    const destination = join(tempRoot, "out-devvars");
    mkdirSync(destination, { recursive: true });

    installFromExtractedRoot({
      ...commonOpts(),
      archetype: "publication",
      features: [{ name: "alpha" }],
      destination,
      extractedRoot,
      sources: {
        archetypes: { publication: { path: "publication" } },
        features: {
          alpha: {
            path: "registry/features/alpha",
            applicableArchetypes: ["publication"],
          },
        },
        themes: {},
        roadmap: [],
      },
    });

    const composed = readFileSync(
      join(destination, ".dev.vars.example"),
      "utf8",
    );
    expect(composed).toContain("ARCHETYPE_VAR=base");
    expect(composed).toContain("# --- from feature:alpha ---");
    expect(composed).toContain("ALPHA_VAR=hello");
    expect(composed.indexOf("ARCHETYPE_VAR")).toBeLessThan(
      composed.indexOf("ALPHA_VAR"),
    );
  });

  it("composes .dev.vars.example from multiple features in resolver topological order", () => {
    // Previously: the layer push loop split features into two passes
    // (_common-pathed first, then the rest), which could re-order a dependent
    // ahead of its dependency. Now a single iteration over args.features
    // preserves the order resolveFeatures returns.
    const extractedRoot = fixtureExtractedRoot();
    writeFile(
      join(extractedRoot, "_common", "features", "alpha", ".dev.vars.example"),
      "ALPHA_VAR=from-alpha\n",
    );
    writeFile(
      join(extractedRoot, "registry", "features", "beta", ".dev.vars.example"),
      "BETA_VAR=from-beta\n",
    );

    const destination = join(tempRoot, "out-multi-devvars");
    mkdirSync(destination, { recursive: true });

    // beta depends on alpha. resolveFeatures returns [alpha, beta] (deps first).
    // Even though alpha lives under _common/features/ and beta does not, the
    // composed .dev.vars.example must record alpha's fragment first.
    installFromExtractedRoot({
      ...commonOpts(),
      archetype: "publication",
      features: [{ name: "beta" }],
      destination,
      extractedRoot,
      sources: {
        archetypes: { publication: { path: "publication" } },
        features: {
          alpha: {
            path: "_common/features/alpha",
            applicableArchetypes: ["publication"],
          },
          beta: {
            path: "registry/features/beta",
            applicableArchetypes: ["publication"],
            registryDependencies: ["alpha"],
          },
        },
        themes: {},
        roadmap: [],
      },
    });

    const composed = readFileSync(
      join(destination, ".dev.vars.example"),
      "utf8",
    );
    // alpha is the initial writer (no separator); beta appends below.
    expect(composed).toContain("ALPHA_VAR=from-alpha");
    expect(composed).toContain("# --- from feature:beta ---");
    expect(composed).toContain("BETA_VAR=from-beta");
    expect(composed.indexOf("ALPHA_VAR")).toBeLessThan(
      composed.indexOf("BETA_VAR"),
    );
  });

  it("composes .dev.vars.example onto an empty archetype target without leading blank lines", () => {
    // Previously: appendComposable hard-coded "\n\n# --- from ..." which
    // produced a file starting with two blank lines when the existing target
    // was empty. Now the separator path collapses when there is no preceding
    // content, so the file starts directly with the source marker.
    const extractedRoot = fixtureExtractedRoot();
    writeFile(
      join(extractedRoot, "publication", ".dev.vars.example"),
      "", // empty archetype target
    );
    writeFile(
      join(extractedRoot, "registry", "features", "alpha", ".dev.vars.example"),
      "ALPHA_VAR=hello\n",
    );

    const destination = join(tempRoot, "out-devvars-empty");
    mkdirSync(destination, { recursive: true });

    installFromExtractedRoot({
      ...commonOpts(),
      archetype: "publication",
      features: [{ name: "alpha" }],
      destination,
      extractedRoot,
      sources: {
        archetypes: { publication: { path: "publication" } },
        features: {
          alpha: {
            path: "registry/features/alpha",
            applicableArchetypes: ["publication"],
          },
        },
        themes: {},
        roadmap: [],
      },
    });

    const composed = readFileSync(
      join(destination, ".dev.vars.example"),
      "utf8",
    );
    expect(composed.startsWith("# --- from feature:alpha ---")).toBe(true);
    expect(composed).toBe("# --- from feature:alpha ---\nALPHA_VAR=hello\n");
  });

  it("preserves leading whitespace in composable feature fragments", () => {
    // Previously: appendComposable stripped both leading and trailing
    // whitespace, which would silently mangle indented fragments in future
    // composable targets (TOML / YAML). Now only trailing whitespace is
    // trimmed; intentional indentation lands verbatim.
    const extractedRoot = fixtureExtractedRoot();
    writeFile(
      join(extractedRoot, "publication", ".dev.vars.example"),
      "ARCHETYPE_VAR=base\n",
    );
    writeFile(
      join(extractedRoot, "registry", "features", "alpha", ".dev.vars.example"),
      "  INDENTED_VAR=hello\n",
    );

    const destination = join(tempRoot, "out-devvars-indent");
    mkdirSync(destination, { recursive: true });

    installFromExtractedRoot({
      ...commonOpts(),
      archetype: "publication",
      features: [{ name: "alpha" }],
      destination,
      extractedRoot,
      sources: {
        archetypes: { publication: { path: "publication" } },
        features: {
          alpha: {
            path: "registry/features/alpha",
            applicableArchetypes: ["publication"],
          },
        },
        themes: {},
        roadmap: [],
      },
    });

    const composed = readFileSync(
      join(destination, ".dev.vars.example"),
      "utf8",
    );
    expect(composed).toContain("  INDENTED_VAR=hello");
  });

  it("installs a feature without a known glue contribution as files only", () => {
    // Previously: writeGeneratedFeatureGlue checked `hasContact: boolean`.
    // Any feature would force-flip handlers/routes to the contact-shaped
    // glue if its name matched. Now: a feature whose name has no entry in
    // FEATURE_CONTRIBUTIONS contributes nothing to glue, but its files are
    // still copied. Lets future features ship pure-overlay files without
    // touching the scaffolder.
    const extractedRoot = fixtureExtractedRoot();
    writeFile(
      join(extractedRoot, "registry", "features", "static-only", "static-file.txt"),
      "hello\n",
    );

    const destination = join(tempRoot, "out-static-only");
    mkdirSync(destination, { recursive: true });

    installFromExtractedRoot({
      ...commonOpts(),
      archetype: "publication",
      features: [{ name: "static-only" }],
      destination,
      extractedRoot,
      sources: {
        archetypes: { publication: { path: "publication" } },
        features: {
          "static-only": {
            path: "registry/features/static-only",
            applicableArchetypes: ["publication"],
          },
        },
        themes: {},
        roadmap: [],
      },
    });

    expect(existsSync(join(destination, "static-file.txt"))).toBe(true);
    const handlers = readFileSync(
      join(destination, "src", ".mantle", "generated.handlers.ts"),
      "utf8",
    );
    expect(handlers).toContain("return {};");
    const manifests = readFileSync(
      join(destination, "src", ".mantle", "generated.manifests.ts"),
      "utf8",
    );
    expect(manifests).toContain(
      "export const featureManifestYamls: readonly string[] = [];",
    );
  });

  it("fails when two non-theme layers write the same non-composable path", () => {
    const extractedRoot = fixtureExtractedRoot();
    writeFile(
      join(extractedRoot, "registry", "features", "bad", "package.json"),
      JSON.stringify({ name: "bad" }, null, 2) + "\n",
    );
    const destination = join(tempRoot, "out-collision");
    mkdirSync(destination, { recursive: true });

    expect(() =>
      installFromExtractedRoot({
        ...commonOpts(),
        archetype: "publication",
        features: [{ name: "bad" }],
        destination,
        extractedRoot,
        sources: {
          archetypes: { publication: { path: "publication" } },
          features: {
            bad: {
              path: "registry/features/bad",
              applicableArchetypes: ["publication"],
            },
          },
          themes: {},
          roadmap: [],
        },
      }),
    ).toThrow(/Feature overlay collision/);
  });

  it("blank archetype skips publication-specific files", () => {
    const extractedRoot = fixtureExtractedRoot();
    const destination = join(tempRoot, "out-blank");
    mkdirSync(destination, { recursive: true });

    installFromExtractedRoot({
      ...commonOpts(),
      archetype: "blank",
      destination,
      extractedRoot,
    });

    expect(existsSync(join(destination, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(destination, "mantle", "site.md"))).toBe(true);
    expect(existsSync(join(destination, "package.json"))).toBe(true);
    expect(
      existsSync(join(destination, "src", "mantleConfig.ts")),
    ).toBe(false);
  });

  it(".template suffix is stripped from final filenames", () => {
    const extractedRoot = fixtureExtractedRoot();
    const destination = join(tempRoot, "out-tpl");
    mkdirSync(destination, { recursive: true });

    installFromExtractedRoot({
      ...commonOpts(),
      archetype: "publication",
      destination,
      extractedRoot,
    });

    expect(existsSync(join(destination, "AGENTS.md.template"))).toBe(false);
    expect(existsSync(join(destination, "AGENTS.md"))).toBe(true);
    expect(
      existsSync(join(destination, "mantle", "site.md.template")),
    ).toBe(false);
    expect(existsSync(join(destination, "mantle", "site.md"))).toBe(true);
    expect(existsSync(join(destination, ".gitignore.template"))).toBe(false);
    expect(existsSync(join(destination, ".gitignore"))).toBe(true);
  });

  it("refuses install if any {{PLACEHOLDER}} remains in templated files", () => {
    const extractedRoot = fixtureExtractedRoot();
    writeFile(
      join(extractedRoot, "publication", "broken.md.template"),
      "this references {{NEVER_SUBSTITUTED}}",
    );
    const destination = join(tempRoot, "out-broken");
    mkdirSync(destination, { recursive: true });

    expect(() =>
      installFromExtractedRoot({
        ...commonOpts(),
        archetype: "publication",
        destination,
        extractedRoot,
      }),
    ).toThrow(/unsubstituted/);
  });

  it("applies a theme overlay on top of the archetype starter", () => {
    const extractedRoot = fixtureExtractedRoot();
    // Theme overlays are bounded to src/theme/* override slots.
    mkdirSync(join(extractedRoot, "themes", "l4-test", "src", "theme"), {
      recursive: true,
    });
    writeFile(
      join(extractedRoot, "themes", "l4-test", "src", "theme", "tokens.ts"),
      `export const TOKENS_CSS = "--paper: #fff; --ink: #111;";\n`,
    );
    writeFile(
      join(extractedRoot, "themes", "l4-test", "src", "theme", "index.ts"),
      [
        `import type { ThemeOverride } from "../Theme.js";`,
        `import { TOKENS_CSS as ForkedTokens } from "./tokens.js";`,
        ``,
        `const overrides: ThemeOverride = {`,
        `  tokens: ForkedTokens,`,
        `};`,
        ``,
        `export default overrides;`,
        ``,
      ].join("\n"),
    );

    const destination = join(tempRoot, "out-theme");
    mkdirSync(destination, { recursive: true });

    const notes = installFromExtractedRoot({
      ...commonOpts(),
      archetype: "publication",
      theme: "l4-test",
      destination,
      extractedRoot,
      sources: {
        archetypes: { publication: { path: "publication" } },
        themes: { "l4-test": { path: "themes/l4-test" } },
        roadmap: [],
      },
    });

    expect(notes.theme).toBe("l4-test");
    expect(notes.theme_source).toBe(
      "aotter/mantle-starters/themes/l4-test",
    );

    // Theme-added file is present.
    expect(
      existsSync(join(destination, "src", "theme", "tokens.ts")),
    ).toBe(true);
    const themeIndex = readFileSync(
      join(destination, "src", "theme", "index.ts"),
      "utf8",
    );
    expect(themeIndex).toContain('from "./tokens.js"');
    expect(themeIndex).toContain("tokens: ForkedTokens");
  });

  it("reports theme: null and theme_source: null when no theme requested", () => {
    const extractedRoot = fixtureExtractedRoot();
    const destination = join(tempRoot, "out-no-theme");
    mkdirSync(destination, { recursive: true });

    const notes = installFromExtractedRoot({
      ...commonOpts(),
      archetype: "publication",
      destination,
      extractedRoot,
    });

    expect(notes.theme).toBeNull();
    expect(notes.theme_source).toBeNull();
  });

  it("aggregates FeatureHandlerEnv declarations across features", () => {
    const extractedRoot = fixtureExtractedRoot();
    writeFile(
      join(extractedRoot, "registry", "features", "alpha", "_compose", "glue.json"),
      JSON.stringify({
        schemaVersion: 1,
        env: [
          { name: "ZED_KEY", type: "string", optional: true, secret: true },
          { name: "ALPHA_FLAG", type: "boolean", optional: false },
        ],
      }),
    );
    writeFile(
      join(extractedRoot, "registry", "features", "beta", "_compose", "glue.json"),
      JSON.stringify({
        schemaVersion: 1,
        env: [{ name: "BETA_TIMEOUT", type: "number" }],
      }),
    );
    const destination = join(tempRoot, "out-env-merge");
    mkdirSync(destination, { recursive: true });

    installFromExtractedRoot({
      ...commonOpts(),
      archetype: "publication",
      features: [{ name: "alpha" }, { name: "beta" }],
      destination,
      extractedRoot,
      sources: {
        archetypes: { publication: { path: "publication" } },
        features: {
          alpha: {
            path: "registry/features/alpha",
            applicableArchetypes: ["publication"],
          },
          beta: {
            path: "registry/features/beta",
            applicableArchetypes: ["publication"],
          },
        },
        themes: {},
        roadmap: [],
      },
    });

    const handlers = readFileSync(
      join(destination, "src", ".mantle", "generated.handlers.ts"),
      "utf8",
    );
    // Sorted alphabetically per the compose policy determinism rule.
    expect(handlers).toContain("readonly ALPHA_FLAG: boolean;");
    expect(handlers).toContain("readonly BETA_TIMEOUT?: number;");
    expect(handlers).toContain("readonly ZED_KEY?: string;");
    expect(handlers.indexOf("ALPHA_FLAG")).toBeLessThan(
      handlers.indexOf("BETA_TIMEOUT"),
    );
    expect(handlers.indexOf("BETA_TIMEOUT")).toBeLessThan(
      handlers.indexOf("ZED_KEY"),
    );
  });

  it("collapses identical env declarations across features", () => {
    const extractedRoot = fixtureExtractedRoot();
    writeFile(
      join(extractedRoot, "registry", "features", "a", "_compose", "glue.json"),
      JSON.stringify({
        schemaVersion: 1,
        env: [{ name: "SHARED_KEY", type: "string", secret: true }],
      }),
    );
    writeFile(
      join(extractedRoot, "registry", "features", "b", "_compose", "glue.json"),
      JSON.stringify({
        schemaVersion: 1,
        env: [{ name: "SHARED_KEY", type: "string", secret: true }],
      }),
    );
    const destination = join(tempRoot, "out-env-dedupe");
    mkdirSync(destination, { recursive: true });

    installFromExtractedRoot({
      ...commonOpts(),
      archetype: "publication",
      features: [{ name: "a" }, { name: "b" }],
      destination,
      extractedRoot,
      sources: {
        archetypes: { publication: { path: "publication" } },
        features: {
          a: { path: "registry/features/a", applicableArchetypes: ["publication"] },
          b: { path: "registry/features/b", applicableArchetypes: ["publication"] },
        },
        themes: {},
        roadmap: [],
      },
    });

    const handlers = readFileSync(
      join(destination, "src", ".mantle", "generated.handlers.ts"),
      "utf8",
    );
    const occurrences = handlers.split("readonly SHARED_KEY").length - 1;
    expect(occurrences).toBe(1);
  });

  it("rejects conflicting env declarations across features", () => {
    const extractedRoot = fixtureExtractedRoot();
    writeFile(
      join(extractedRoot, "registry", "features", "a", "_compose", "glue.json"),
      JSON.stringify({
        schemaVersion: 1,
        env: [{ name: "CONFLICT_KEY", type: "string" }],
      }),
    );
    writeFile(
      join(extractedRoot, "registry", "features", "b", "_compose", "glue.json"),
      JSON.stringify({
        schemaVersion: 1,
        env: [{ name: "CONFLICT_KEY", type: "number" }],
      }),
    );
    const destination = join(tempRoot, "out-env-conflict");
    mkdirSync(destination, { recursive: true });

    expect(() =>
      installFromExtractedRoot({
        ...commonOpts(),
        archetype: "publication",
        features: [{ name: "a" }, { name: "b" }],
        destination,
        extractedRoot,
        sources: {
          archetypes: { publication: { path: "publication" } },
          features: {
            a: { path: "registry/features/a", applicableArchetypes: ["publication"] },
            b: { path: "registry/features/b", applicableArchetypes: ["publication"] },
          },
          themes: {},
          roadmap: [],
        },
      }),
    ).toThrow(/Conflicting env declaration for "CONFLICT_KEY"/);
  });

  it("rejects mismatched secret-vs-public flags for the same env var", () => {
    const extractedRoot = fixtureExtractedRoot();
    writeFile(
      join(extractedRoot, "registry", "features", "a", "_compose", "glue.json"),
      JSON.stringify({
        schemaVersion: 1,
        env: [{ name: "MAYBE_SECRET", type: "string", secret: true }],
      }),
    );
    writeFile(
      join(extractedRoot, "registry", "features", "b", "_compose", "glue.json"),
      JSON.stringify({
        schemaVersion: 1,
        env: [{ name: "MAYBE_SECRET", type: "string", secret: false }],
      }),
    );
    const destination = join(tempRoot, "out-env-secret");
    mkdirSync(destination, { recursive: true });

    expect(() =>
      installFromExtractedRoot({
        ...commonOpts(),
        archetype: "publication",
        features: [{ name: "a" }, { name: "b" }],
        destination,
        extractedRoot,
        sources: {
          archetypes: { publication: { path: "publication" } },
          features: {
            a: { path: "registry/features/a", applicableArchetypes: ["publication"] },
            b: { path: "registry/features/b", applicableArchetypes: ["publication"] },
          },
          themes: {},
          roadmap: [],
        },
      }),
    ).toThrow(/Conflicting env declaration for "MAYBE_SECRET"/);
  });
});

describe("renderImports", () => {
  it("merges named bindings from the same module into one statement", () => {
    expect(
      renderImports([
        { named: ["X"], from: "x" },
        { named: ["Y"], from: "x" },
      ]),
    ).toEqual([`import { X, Y } from "x";`]);
  });

  it("dedupes repeated bindings within the same module", () => {
    expect(
      renderImports([
        { named: ["X", "Y"], from: "x" },
        { named: ["Y", "Z"], from: "x" },
      ]),
    ).toEqual([`import { X, Y, Z } from "x";`]);
  });

  it("sorts named bindings alphabetically", () => {
    expect(
      renderImports([{ named: ["foo", "bar", "baz"], from: "x" }]),
    ).toEqual([`import { bar, baz, foo } from "x";`]);
  });

  it("sorts modules alphabetically", () => {
    expect(
      renderImports([
        { named: ["A"], from: "z" },
        { named: ["B"], from: "a" },
      ]),
    ).toEqual([
      `import { B } from "a";`,
      `import { A } from "z";`,
    ]);
  });

  it("combines default and named imports from the same module", () => {
    expect(
      renderImports([
        { default: "Yaml", from: "y" },
        { named: ["parse"], from: "y" },
      ]),
    ).toEqual([`import Yaml, { parse } from "y";`]);
  });

  it("rejects conflicting default imports for the same module", () => {
    expect(() =>
      renderImports([
        { default: "A", from: "x" },
        { default: "B", from: "x" },
      ]),
    ).toThrow(/Conflicting default imports/);
  });

  it("throws when a spec has neither default nor named bindings", () => {
    expect(() => renderImports([{ from: "x" }])).toThrow(
      /needs a default or named binding/,
    );
  });
});
