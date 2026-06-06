import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RunNotes } from "../src/index.js";
import {
  createOptionsFromLaunchSession,
  loadLaunchSession,
  parseLaunchSession,
  writeLaunchState,
} from "../src/launch.js";

let tempRoot: string;

const NOW = new Date("2026-06-07T00:00:00.000Z");

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), "create-mantle-launch-test-"));
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("launch session", () => {
  it("normalizes landing session input into create-mantle options", () => {
    const session = parseLaunchSession(
      {
        schema_version: 1,
        id: "launch_123",
        expires_at: "2026-06-08T00:00:00.000Z",
        archetype: "publication",
        site_name: "Morning Lab",
        project_name: "morning-lab",
        locales: ["en", "ZH_tw"],
        canonical_locale: "zh-TW",
        github: { admin_login: "phsu" },
        theme: "l4-editorial-journal",
        features: ["contact", { name: "email-sender-smtp", variant: "resend" }],
        repo: { name: "morning-lab", visibility: "private" },
      },
      { now: NOW },
    );

    expect(session.locales).toEqual(["zh-TW", "en"]);
    expect(session.githubOwner).toBe("phsu");
    expect(session.adminGithubLogin).toBe("phsu");
    expect(session.description).toBe("Morning Lab site.");
    expect(session.summary).toBe("Launch from Mantle landing session.");
    expect(session.repo).toEqual({
      owner: "phsu",
      name: "morning-lab",
      visibility: "private",
    });

    const opts = createOptionsFromLaunchSession({
      session,
      cwd: tempRoot,
      starterRef: "develop",
      skipInstall: true,
      skipGitInit: true,
    });

    expect(opts).toMatchObject({
      archetype: "publication",
      projectName: "morning-lab",
      destination: join(tempRoot, "morning-lab"),
      brand: "Morning Lab",
      description: "Morning Lab site.",
      locales: ["zh-TW", "en"],
      githubOwner: "phsu",
      summary: "Launch from Mantle landing session.",
      theme: "l4-editorial-journal",
      starterRef: "develop",
      skipInstall: true,
      skipGitInit: true,
    });
    expect(opts.features).toEqual([
      { name: "contact" },
      { name: "email-sender-smtp", variant: "resend" },
    ]);
  });

  it("rejects expired sessions before create options are built", () => {
    expect(() =>
      parseLaunchSession(
        {
          schema_version: 1,
          expires_at: "2026-06-06T23:59:59.000Z",
          archetype: "publication",
          brand: "Expired Site",
          project_name: "expired-site",
          locales: ["en"],
          github_owner: "phsu",
        },
        { now: NOW },
      ),
    ).toThrow("expired");
  });

  it("rejects canonical locales that are absent from the locale list", () => {
    expect(() =>
      parseLaunchSession(
        {
          schema_version: 1,
          expires_at: "2026-06-08T00:00:00.000Z",
          archetype: "publication",
          brand: "Locale Site",
          project_name: "locale-site",
          locales: ["en"],
          canonical_locale: "zh-TW",
          github_owner: "phsu",
        },
        { now: NOW },
      ),
    ).toThrow('canonical_locale "zh-TW" is not listed');
  });

  it("rejects project names that escape the launch directory", () => {
    expect(() =>
      parseLaunchSession(
        {
          schema_version: 1,
          expires_at: "2026-06-08T00:00:00.000Z",
          archetype: "publication",
          brand: "Traversal Site",
          project_name: "../outside",
          locales: ["en"],
          github_owner: "phsu",
        },
        { now: NOW },
      ),
    ).toThrow("project_name must be a directory slug");
  });

  it("loads file URL sessions for local agent handoff smoke tests", async () => {
    const path = join(tempRoot, "session.json");
    writeFileSync(
      path,
      JSON.stringify({
        schema_version: 1,
        session_id: "launch_file",
        expires_at: "2026-06-08T00:00:00.000Z",
        archetype: "presence",
        brand: "File Session",
        project_name: "file-session",
        locales: "en, zh_tw",
        admin_github_login: "phsu",
      }),
    );

    const session = await loadLaunchSession(pathToFileURL(path).toString(), {
      now: NOW,
    });

    expect(session.sessionId).toBe("launch_file");
    expect(session.locales).toEqual(["en", "zh-TW"]);
    expect(session.githubOwner).toBe("phsu");
  });

  it("rejects non-local plaintext session URLs", async () => {
    await expect(
      loadLaunchSession("http://example.com/session.json", { now: NOW }),
    ).rejects.toThrow("must use HTTPS");
  });

  it("writes resumable launch state without leaking the session URL", () => {
    const session = parseLaunchSession(
      {
        schema_version: 1,
        session_id: "launch_state",
        expires_at: "2026-06-08T00:00:00.000Z",
        archetype: "publication",
        brand: "State Site",
        project_name: "state-site",
        locales: ["en"],
        github_owner: "phsu",
      },
      { now: NOW },
    );
    const notes: RunNotes = {
      archetype: "publication",
      theme: null,
      features: [],
      starter_source: "aotter/mantle-starters/publication",
      theme_source: null,
      overlays: [],
      files_written: [],
      next_step: "edit content after launch",
    };
    const destination = join(tempRoot, "state-site");
    mkdirSync(destination, { recursive: true });

    const relPath = writeLaunchState({
      destination,
      session,
      notes,
      sessionRef: "https://mantle.tools/launch/sessions/launch_state?token=secret",
      now: NOW,
    });

    const raw = readFileSync(join(destination, relPath), "utf8");
    const state = JSON.parse(raw);
    expect(raw).not.toContain("token=secret");
    expect(state).toMatchObject({
      schema_version: 1,
      session_id: "launch_state",
      claimed_at: NOW.toISOString(),
      launch_source: "remote",
      github: { owner: "phsu" },
      next_step: "edit content after launch",
    });
  });
});
