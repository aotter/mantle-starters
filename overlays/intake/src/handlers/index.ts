import type { AnyHandler } from "@aotter/mantle/runtime";
import { notifyIntake } from "./notifyIntake.js";
import { verifyIntakeTurnstile } from "./verifyIntakeTurnstile.js";

/**
 * Intake Procedure handler registry.
 */
export function buildHandlers(): Readonly<Record<string, AnyHandler>> {
  return {
    "notify-intake": notifyIntake,
    "verify-intake-turnstile": verifyIntakeTurnstile,
  };
}
