/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";
import type { SiteConfig } from "@aotterclam/clam-cms-spec";
import { Layout } from "../components/Layout.js";
import { bundleFor } from "../../i18n/index.js";
import { renderMarkdown } from "./utils.js";

export interface HomeContext {
  readonly site: SiteConfig;
  readonly locale: string;
  readonly home: { title: string; intro?: string; body: string };
}

export function homeTemplate(ctx: HomeContext): string {
  const { site, locale, home } = ctx;
  const t = bundleFor(locale).home;
  const tree = (
    <Layout
      site={site}
      locale={locale}
      title={`${home.title} — ${site.brand}`}
      description={home.intro ?? site.description}
      current="home"
    >
      <section class="hero">
        <div class="eyebrow">{t.eyebrow}</div>
        <h1>{home.title}</h1>
        {home.intro ? <p class="intro">{home.intro}</p> : null}
        <div class="body">{raw(renderMarkdown(home.body))}</div>
      </section>
    </Layout>
  );
  return "<!doctype html>" + String(tree);
}
