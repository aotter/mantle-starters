import type { PublicRouteContext } from "@aotter/mantle/cloudflare";

interface RenderContactEnv {
  readonly TURNSTILE_SITE_KEY?: string;
}

interface ContactPageData {
  readonly title?: string;
  readonly intro?: string;
  readonly body?: string;
}

type ContactTemplate = (args: {
  site: unknown;
  locale: string;
  page: { title: string; intro: string | undefined; body: string };
  turnstileSiteKey: string;
}) => string;

export async function renderContact(
  ctx: PublicRouteContext,
  env: RenderContactEnv,
  contactTemplate: ContactTemplate,
): Promise<Response> {
  const { runtime, site, locale } = ctx;
  const all = await runtime.listEntries.execute({
    collection: "page-translations",
    status: "published",
    limit: 50,
  });
  const entry = all.find(
    (e) =>
      (e.data as { slug?: string }).slug === "contact" &&
      (e.data as { locale?: string }).locale === locale,
  );
  const data = (entry?.data ?? {}) as ContactPageData;
  const html = contactTemplate({
    site,
    locale,
    page: {
      title: data.title ?? "",
      intro: data.intro,
      body: data.body ?? "",
    },
    turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA",
  });
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=60, s-maxage=60",
    },
  });
}
