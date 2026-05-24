import { parseManifestsOrThrow, type Manifest } from "@aotter/mantle/spec";
// Wrangler's `[[rules]] type = "Text"` for `*.yaml` (see wrangler.toml)
// makes esbuild bundle these imports as inline string exports — the
// manifests travel with the worker code, no FS access at runtime.
import productsYaml from "../manifests/products.yaml";
import ordersYaml from "../manifests/orders.yaml";
import inventoryYaml from "../manifests/inventory.yaml";
import checkoutYaml from "../manifests/checkout.yaml";
import { featureManifestYamls } from "./.mantle/generated.manifests.js";

/**
 * Parse + validate the starter's manifests at module-load time. Throws
 * on parse failure so deploys fail fast — boot validation runs again
 * via `runtime.bootInit()` for cross-manifest checks (handler refs,
 * Trigger targets, locale invariants).
 *
 * Feature manifests are appended via `featureManifestYamls` —
 * `create-mantle` regenerates `.mantle/generated.manifests.ts` from
 * the selected feature overlay set at scaffold time. The stub
 * commits an empty array so the starter typechecks before any
 * feature is installed.
 */
export function loadManifests(): readonly Manifest[] {
  return parseManifestsOrThrow(
    [productsYaml, ordersYaml, inventoryYaml, checkoutYaml, ...featureManifestYamls],
    { context: "mantle-starter-transaction" },
  );
}
