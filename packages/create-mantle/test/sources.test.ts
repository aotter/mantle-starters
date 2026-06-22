import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ROADMAP_ARCHETYPES,
  SOURCES,
  STALE_FALLBACK_SOURCES,
  STARTERS_REPO,
  fetchSourcesJson,
  resolveArchetype,
  resolveFeatures,
  resolveSource,
  resolveTheme,
  type SourcesJson,
} from "../src/sources.js";

describe("resolveSource (back-compat, stale fallback)", () => {
  it("returns launch archetypes to the blank starter", () => {
    const s = resolveSource("publication");
    expect(s.kind).toBe("public");
    expect(s.repo).toBe("aotter/mantle-starters");
    expect(s.path).toBe("blank");
    expect(s.overlays).toBeUndefined();
    expect(resolveSource("transaction").path).toBe("blank");
    expect(resolveSource("reservation").path).toBe("blank");
    expect(resolveSource("community").path).toBe("blank");
  });

  it("returns blank → blank starter", () => {
    const s = resolveSource("blank");
    expect(s.path).toBe("blank");
  });

  it("has no roadmap-only archetypes in the fallback", () => {
    expect(ROADMAP_ARCHETYPES).toEqual([]);
  });

  it("throws unknown-archetype message with the known list", () => {
    expect(() => resolveSource("does-not-exist")).toThrow(/Unknown archetype/);
    expect(() => resolveSource("does-not-exist")).toThrow(/blank/);
  });

  it("has no first-run themes in the stale fallback", () => {
    expect(resolveTheme(null, STALE_FALLBACK_SOURCES)).toBeNull();
    expect(() => resolveTheme("l4-minimal-ink", STALE_FALLBACK_SOURCES)).toThrow(/no themes/);
  });

  it("has no first-run features in the stale fallback", () => {
    expect(resolveFeatures([], "publication", STALE_FALLBACK_SOURCES)).toEqual([]);
    expect(() =>
      resolveFeatures([{ name: "contact" }], "publication", STALE_FALLBACK_SOURCES),
    ).toThrow(/no features/);
  });

  it("every roadmap archetype is absent from SOURCES", () => {
    for (const k of ROADMAP_ARCHETYPES) {
      expect(SOURCES[k]).toBeUndefined();
    }
  });
});

describe("resolveArchetype (live sources)", () => {
  const live: SourcesJson = {
    archetypes: {
      blank: { path: "blank" },
      publication: { path: "blank" },
      transaction: { path: "blank" },
      reservation: { path: "blank" },
      community: { path: "blank" },
    },
    themes: {},
    roadmap: [],
  };

  it("resolves supplied launch archetypes to the blank path", () => {
    expect(resolveArchetype("publication", live).path).toBe("blank");
    expect(resolveArchetype("transaction", live).path).toBe("blank");
    expect(resolveArchetype("reservation", live).path).toBe("blank");
    expect(resolveArchetype("community", live).path).toBe("blank");
  });

  it("returns repo = STARTERS_REPO and kind = public", () => {
    const s = resolveArchetype("publication", live);
    expect(s.kind).toBe("public");
    expect(s.repo).toBe(STARTERS_REPO);
  });

  it("returns no roadmap-only archetypes in the supplied sources", () => {
    expect(live.roadmap).toEqual([]);
  });

  it("throws for unknown archetype with sources.archetypes list", () => {
    expect(() => resolveArchetype("foo", live)).toThrow(/Unknown archetype/);
  });
});

describe("resolveTheme", () => {
  const sources: SourcesJson = {
    archetypes: { publication: { path: "publication" } },
    themes: {
      "l4-minimal-ink": { path: "themes/l4-minimal-ink" },
      "l4-editorial-warm": { path: "themes/l4-editorial-warm" },
    },
    roadmap: [],
  };

  it("returns null for absent / empty / null theme", () => {
    expect(resolveTheme(null, sources)).toBeNull();
    expect(resolveTheme(undefined, sources)).toBeNull();
    expect(resolveTheme("", sources)).toBeNull();
  });

  it("resolves known theme key to its path", () => {
    expect(resolveTheme("l4-minimal-ink", sources)).toEqual({
      path: "themes/l4-minimal-ink",
    });
  });

  it("throws for unknown theme with known list", () => {
    expect(() => resolveTheme("l4-not-real", sources)).toThrow(/Unknown theme/);
    expect(() => resolveTheme("l4-not-real", sources)).toThrow(
      /l4-minimal-ink/,
    );
  });

  it("error message handles empty theme map gracefully", () => {
    const empty: SourcesJson = {
      archetypes: { publication: { path: "publication" } },
      themes: {},
      roadmap: [],
    };
    expect(() => resolveTheme("any", empty)).toThrow(/no themes/);
  });
});

describe("resolveFeatures", () => {
  const sources: SourcesJson = {
    archetypes: {
      publication: { path: "publication" },
      transaction: { path: "transaction" },
    },
    features: {
      contact: {
        path: "registry/features/contact",
        title: "Contact Form",
        applicableArchetypes: ["publication"],
      },
      "email-sender": {
        path: "registry/features/email-sender",
        applicableArchetypes: ["transaction"],
        requiresVariant: true,
        variants: [{ name: "resend-stub" }, { name: "ses-stub" }],
      },
      "customer-account": {
        path: "registry/features/customer-account",
        applicableArchetypes: ["transaction"],
        registryDependencies: ["email-sender"],
      },
      wishlist: {
        path: "registry/features/wishlist",
        applicableArchetypes: ["transaction"],
        registryDependencies: ["customer-account"],
      },
      cycleA: {
        applicableArchetypes: ["publication"],
        registryDependencies: ["cycleB"],
      },
      cycleB: {
        applicableArchetypes: ["publication"],
        registryDependencies: ["cycleA"],
      },
    },
    themes: {},
    roadmap: [],
  };

  it("returns an empty list when no features are requested", () => {
    expect(resolveFeatures([], "publication", sources)).toEqual([]);
  });

  it("resolves a direct feature", () => {
    expect(resolveFeatures([{ name: "contact" }], "publication", sources)).toEqual([
      {
        name: "contact",
        type: "registry:feature",
        path: "registry/features/contact",
        title: "Contact Form",
        description: undefined,
        variant: null,
        registryDependencies: [],
      },
    ]);
  });

  it("auto-includes dependencies in topological order", () => {
    expect(
      resolveFeatures(
        [{ name: "email-sender", variant: "resend-stub" }, { name: "wishlist" }],
        "transaction",
        sources,
      ).map((feature) => [feature.name, feature.variant]),
    ).toEqual([
      ["email-sender", "resend-stub"],
      ["customer-account", null],
      ["wishlist", null],
    ]);
  });

  it("throws for an unknown feature with the known list", () => {
    expect(() =>
      resolveFeatures([{ name: "not-real" }], "publication", sources),
    ).toThrow(/Unknown feature/);
  });

  it("throws when a feature does not apply to the selected archetype", () => {
    expect(() =>
      resolveFeatures([{ name: "contact" }], "transaction", sources),
    ).toThrow(/does not apply/);
  });

  it("throws when a required variant is missing", () => {
    expect(() =>
      resolveFeatures([{ name: "email-sender" }], "transaction", sources),
    ).toThrow(/requires a variant/);
  });

  it("throws when a transitive dependency requires a variant and the user did not supply one", () => {
    // `customer-account` depends on `email-sender`, which is `requiresVariant: true`.
    // Requesting only `customer-account` surfaces the missing-variant error on the
    // auto-included dependency so callers get a clear hint about what to add.
    expect(() =>
      resolveFeatures([{ name: "customer-account" }], "transaction", sources),
    ).toThrow(/email-sender.*requires a variant/);
  });

  it("throws when a variant is unknown", () => {
    expect(() =>
      resolveFeatures(
        [{ name: "email-sender", variant: "mailchannels-stub" }],
        "transaction",
        sources,
      ),
    ).toThrow(/Unknown variant/);
  });

  it("throws when the same feature has conflicting variants", () => {
    expect(() =>
      resolveFeatures(
        [
          { name: "email-sender", variant: "resend-stub" },
          { name: "email-sender", variant: "ses-stub" },
        ],
        "transaction",
        sources,
      ),
    ).toThrow(/conflicting variants/);
  });

  it("throws for feature dependency cycles", () => {
    expect(() =>
      resolveFeatures([{ name: "cycleA" }], "publication", sources),
    ).toThrow(/cycle detected/);
  });
});

describe("fetchSourcesJson", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed sources.json on success", async () => {
    const payload: SourcesJson = {
      archetypes: { publication: { path: "publication" } },
      themes: { "l4-minimal-ink": { path: "themes/l4-minimal-ink" } },
      roadmap: ["reservation"],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => payload,
    } as unknown as Response);

    const got = await fetchSourcesJson("main");
    expect(got).toEqual(payload);
  });

  it("falls back to STALE_FALLBACK_SOURCES on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({}),
    } as unknown as Response);
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    const got = await fetchSourcesJson("v9.99.99-nope");
    expect(got).toBe(STALE_FALLBACK_SOURCES);
    expect(stderrSpy).toHaveBeenCalled();
  });

  it("falls back on network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ENOTFOUND"));
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const got = await fetchSourcesJson("main");
    expect(got).toBe(STALE_FALLBACK_SOURCES);
  });

  it("falls back on schema validation failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ archetypes: "wrong" }),
    } as unknown as Response);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const got = await fetchSourcesJson("main");
    expect(got).toBe(STALE_FALLBACK_SOURCES);
  });

  it("URL-encodes ref segment to handle slashes/special chars", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => STALE_FALLBACK_SOURCES,
      } as unknown as Response);

    await fetchSourcesJson("feat/my branch");
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        new RegExp(
          `^https://raw\\.githubusercontent\\.com/${STARTERS_REPO}/feat%2Fmy%20branch/sources\\.json\\?t=\\d+$`,
        ),
      ),
    );
  });
});
