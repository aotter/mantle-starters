import { TemplateRegistry } from "@aotterclam/clam-mantle/runtime";
import overrides from "../../theme/index.js";

/**
 * Template registry for the transaction starter.
 *
 * PR 1 scaffold ships EMPTY — no entry/list templates registered.
 * The customer-facing flow in PR 1 is API-only (HTTP Triggers from
 * manifests/checkout.yaml + view REST at /api/views/*). Public HTML
 * rendering (product list, product detail, cart, checkout, order
 * confirmation) lands in PR 4 with the real template stack.
 *
 * The `overrides` import is preserved so a consumer adding templates
 * later via `pnpm theme:fork` still has a working seam.
 */
export function buildTemplates(): TemplateRegistry {
  void overrides;
  return new TemplateRegistry();
}
