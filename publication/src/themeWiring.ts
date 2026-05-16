import { createPublicationBaseline } from "@aotter/mantle-publication-baseline";

/**
 * Single boot-time wiring of the publication baseline. Both
 * `mantleConfig.ts` (template registry for the runtime dispatcher) and
 * `src/index.ts` (request-time handlers for `home`, `notFound`,
 * `contact`) import `baseline` from here, so the L1-L4 override flags
 * are configured exactly once.
 *
 * Customization happens here. Examples — uncomment + edit as needed:
 *
 *   const baseline = createPublicationBaseline({
 *     extraCss: BRAND_OVERRIDES_CSS,             // L1 tokens + L2 css
 *     extraHeaderJs: MOBILE_NAV_RUNTIME,         // L2 behavior
 *     components: { PageShell: MarketingShell }, // L3 chrome fork
 *     templates: { home: marketingHome },        // L4 home fork
 *     bundles: {
 *       en: extendBundle("en", { header: { posts: "Articles" } }),
 *     },
 *     extraIcons: { sparkles: "<path d='...' />" },
 *   });
 *
 * Pristine baseline (publication starter default — no overrides):
 */
export const baseline = createPublicationBaseline();
