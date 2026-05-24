import type { PublicRouteContext } from "@aotter/mantle/cloudflare";
import type { Env } from "../mantleConfig.js";

export interface FeatureSlugOverride {
  readonly collection: string;
  readonly slug: string;
  readonly render: (ctx: PublicRouteContext) => Promise<Response>;
}

export function buildFeatureSlugOverrides(
  _env: Env,
): readonly FeatureSlugOverride[] {
  return [];
}
