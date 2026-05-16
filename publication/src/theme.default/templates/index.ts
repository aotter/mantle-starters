// @clam-override-class sdk-owned — see src/theme.default/README.md
import { TemplateRegistry } from "@aotterclam/clam-mantle/runtime";
import type { LayoutComponent } from "../components/Layout.js";
import type { I18nBundle } from "../i18n/index.js";
import { createPostTemplate } from "./post.js";
import { createPostListTemplate } from "./postList.js";
import { createPageTemplate } from "./page.js";
import { createHomeTemplate } from "./home.js";
import { createNotFoundTemplate } from "./notFound.js";
import { createContactTemplate } from "./contact.js";

export type { HomeContext } from "./home.js";
export type { NotFoundContext } from "./notFound.js";
export type { ContactContext } from "./contact.js";

export interface TemplatesDeps {
  readonly Layout: LayoutComponent;
  readonly bundleFor: (locale: string) => I18nBundle;
}

export interface PublicationTemplateBundle {
  readonly post: ReturnType<typeof createPostTemplate>;
  readonly postList: ReturnType<typeof createPostListTemplate>;
  readonly page: ReturnType<typeof createPageTemplate>;
  readonly home: ReturnType<typeof createHomeTemplate>;
  readonly notFound: ReturnType<typeof createNotFoundTemplate>;
  readonly contact: ReturnType<typeof createContactTemplate>;
}

/** Build all 6 publication-archetype templates closed over the
 *  supplied Layout + bundleFor. Consumer calls once at boot in
 *  `clamConfig.ts` and feeds the result into both the dispatch
 *  registry (`buildPublicationTemplates(...)`) and the request-time
 *  handlers in the worker entry (`templates.home`, `.notFound`,
 *  `.contact`). */
export function createPublicationTemplates(deps: TemplatesDeps): PublicationTemplateBundle {
  return {
    post: createPostTemplate({ Layout: deps.Layout }),
    postList: createPostListTemplate({ Layout: deps.Layout, bundleFor: deps.bundleFor }),
    page: createPageTemplate({ Layout: deps.Layout }),
    home: createHomeTemplate({ Layout: deps.Layout, bundleFor: deps.bundleFor }),
    notFound: createNotFoundTemplate({ Layout: deps.Layout, bundleFor: deps.bundleFor }),
    contact: createContactTemplate({ Layout: deps.Layout, bundleFor: deps.bundleFor }),
  };
}

/**
 * Wire the 3 persistent-collection templates (post / postList / page)
 * into a `TemplateRegistry` for the runtime dispatcher.
 *
 * `home`, `notFound`, `contact` are NOT registered here — all three
 * are request-time only:
 *   - home composes two collections (page + recent-posts);
 *   - notFound runs on KV-miss + global notFound;
 *   - contact needs the live Turnstile site key from env.
 * Each is called directly from a worker route handler in the consumer's
 * `src/index.ts`.
 */
export function buildPublicationTemplates(
  templates: Pick<PublicationTemplateBundle, "post" | "postList" | "page">,
): TemplateRegistry {
  const registry = new TemplateRegistry();
  registry.registerEntryTemplate("post-translations", templates.post);
  registry.registerListTemplate("post-translations", templates.postList);
  registry.registerEntryTemplate("page-translations", templates.page);
  return registry;
}
