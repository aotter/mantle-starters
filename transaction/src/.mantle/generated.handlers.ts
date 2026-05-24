import type { AnyHandler } from "@aotter/mantle/runtime";

// Stub: no features installed yet. `create-mantle` regenerates this
// file from the selected feature overlay set at scaffold time; the
// regenerated FeatureHandlerEnv narrows to exactly the env keys
// referenced by enabled feature contributions. The stub accepts the
// starter's full `Env` shape (wider type) so `buildHandlers(env)`
// passes through cleanly before any feature lands.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface FeatureHandlerEnv {}

export function buildFeatureHandlers(
  _env: FeatureHandlerEnv,
): Readonly<Record<string, AnyHandler>> {
  return {};
}
