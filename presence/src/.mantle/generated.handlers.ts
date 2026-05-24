import type { AnyHandler } from "@aotter/mantle/runtime";

export interface FeatureHandlerEnv {
  readonly TURNSTILE_SECRET_KEY?: string;
}

export function buildFeatureHandlers(
  _env: FeatureHandlerEnv,
): Readonly<Record<string, AnyHandler>> {
  return {};
}
