/**
 * Shared fixture builder + applier for the presence starter.
 *
 * Modelled on publication's fixture, simplified for presence's shape:
 * only `pages` + `page-translations` (no posts collection in this
 * archetype). The fixture seeds enough rows for `/` and `/<locale>`
 * and `/<locale>/pages/about` to render on first install — the
 * contact page is template-only and doesn't need a fixture row.
 *
 * Idempotent via `OR IGNORE`; subsequent applies are safe.
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import {
  CANONICAL_MIGRATIONS,
  entryHtmlKey,
  entryMarkdownKey,
  serializeEntryAsMarkdown,
} from "@aotter/mantle/runtime";
import type { Entry, ContentState } from "@aotter/mantle/spec";
import { pageTemplate } from "../../src/theme.default/templates/index.js";
import {
  FIXTURE_AUTHOR_ID,
  FIXTURE_NOW,
  FIXTURE_PAGES,
  FIXTURE_SITE,
} from "./data.js";

const DOCTYPE = "<!doctype html>";

export interface ApplyFixtureOptions {
  readonly wranglerEnv?: string;
  readonly persistTo?: string;
  readonly artefactPrefix: string;
}

interface KvEntry {
  readonly key: string;
  readonly value: string;
}

function escape(s: string): string {
  return s.replace(/'/g, "''");
}

function buildSql(opts: ApplyFixtureOptions): string {
  const lines: string[] = [];
  lines.push(`-- starter-presence fixture (${opts.artefactPrefix}, idempotent).`);
  lines.push("-- Runs canonical migrations first because `wrangler d1 execute --local`");
  lines.push("-- opens an isolated DB and won't see the in-memory schema wrangler dev built.");
  for (const m of CANONICAL_MIGRATIONS) {
    lines.push(`-- migration ${m.id}: ${m.description}`);
    lines.push(m.sql.trim());
  }
  lines.push("BEGIN TRANSACTION;");

  for (const [key, value] of Object.entries({
    brand: FIXTURE_SITE.brand,
    title: FIXTURE_SITE.title,
    description: FIXTURE_SITE.description,
    origin: FIXTURE_SITE.origin,
    locales: FIXTURE_SITE.locales.join(","),
  })) {
    lines.push(
      `INSERT OR IGNORE INTO site_config (key, value) VALUES ('${escape(key)}', '${escape(value)}');`,
    );
  }

  const fixtureNowIso = new Date(FIXTURE_NOW).toISOString();
  lines.push(
    `INSERT OR REPLACE INTO user (id, name, email, emailVerified, createdAt, updatedAt, role) VALUES ('${FIXTURE_AUTHOR_ID}', 'Demo Editor', 'editor@example.com', 1, '${fixtureNowIso}', '${fixtureNowIso}', NULL);`,
  );

  let pageIndex = 1;
  for (const page of FIXTURE_PAGES) {
    const pageId = `fx-page-${pageIndex++}`;
    const data = JSON.stringify({
      slug: page.slug,
      authorId: FIXTURE_AUTHOR_ID,
      publishedAt: FIXTURE_NOW,
    });
    lines.push(
      `INSERT OR IGNORE INTO entries (id, collection, status, version, data, author_id, created_at, updated_at) VALUES ('${pageId}', 'pages', 'published', 1, '${escape(data)}', '${FIXTURE_AUTHOR_ID}', ${FIXTURE_NOW}, ${FIXTURE_NOW});`,
    );
    for (const tr of page.translations) {
      const trId = `fx-pgt-${page.slug}-${tr.locale.toLowerCase()}`;
      const trData = JSON.stringify({
        slug: page.slug,
        locale: tr.locale,
        title: tr.title,
        intro: tr.intro,
        body: tr.body,
      });
      lines.push(
        `INSERT OR IGNORE INTO entries (id, collection, status, version, data, author_id, created_at, updated_at) VALUES ('${trId}', 'page-translations', 'published', 1, '${escape(trData)}', '${FIXTURE_AUTHOR_ID}', ${FIXTURE_NOW}, ${FIXTURE_NOW});`,
      );
    }
  }
  lines.push("COMMIT;");
  return lines.join("\n") + "\n";
}

function buildEntry(args: {
  id: string;
  collection: string;
  data: Record<string, unknown>;
  locale?: string;
}): Entry {
  return {
    id: args.id,
    collection: args.collection,
    locale: args.locale,
    status: "published" as ContentState,
    version: 1,
    data: args.data,
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
  };
}

function buildKvEntries(): readonly KvEntry[] {
  const out: KvEntry[] = [];
  for (const page of FIXTURE_PAGES) {
    for (const tr of page.translations) {
      const entry = buildEntry({
        id: `fx-pgt-${page.slug}-${tr.locale.toLowerCase()}`,
        collection: "page-translations",
        locale: tr.locale,
        data: {
          slug: page.slug,
          locale: tr.locale,
          title: tr.title,
          intro: tr.intro,
          body: tr.body,
        },
      });
      out.push({
        key: entryHtmlKey(entry),
        value: DOCTYPE + pageTemplate({ entry, site: FIXTURE_SITE }),
      });
      const md = serializeEntryAsMarkdown(entry);
      if (md) out.push({ key: entryMarkdownKey(entry), value: md });
    }
  }
  return out;
}

function wranglerArgs(opts: ApplyFixtureOptions): string {
  const parts: string[] = [];
  if (opts.wranglerEnv) parts.push(`--env=${opts.wranglerEnv}`);
  if (opts.persistTo) parts.push(`--persist-to=${opts.persistTo}`);
  return parts.join(" ");
}

export async function applyFixture(opts: ApplyFixtureOptions): Promise<void> {
  const sql = buildSql(opts);
  const kv = buildKvEntries();
  const sqlPath = `.fixture.${opts.artefactPrefix}.sql`;
  const kvPath = `.fixture.${opts.artefactPrefix}.kv.json`;
  writeFileSync(sqlPath, sql);
  writeFileSync(kvPath, JSON.stringify(kv, null, 2));
  process.stdout.write(`Wrote ${sqlPath} (${sql.split("\n").length} lines)\n`);
  process.stdout.write(`Wrote ${kvPath} (${kv.length} entries)\n`);

  const flags = wranglerArgs(opts);
  process.stdout.write(
    `\nApplying D1 fixtures (migrations + inserts)${flags ? ` [${flags}]` : ""}...\n`,
  );
  execSync(`wrangler d1 execute DB --local --file=${sqlPath} ${flags}`.trim(), {
    stdio: "inherit",
  });

  process.stdout.write("\nApplying KV fixtures...\n");
  execSync(`wrangler kv bulk put --local --binding=KV ${kvPath} ${flags}`.trim(), {
    stdio: "inherit",
  });

  process.stdout.write("\nFixture applied.\n");
}
