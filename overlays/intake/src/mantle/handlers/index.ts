import type { AnyHandler } from "@aotter/mantle/runtime";
import { notifyIntake } from "../../worker/features/intake/notifyIntake.js";
import { verifyIntakeTurnstile } from "../../worker/features/intake/verifyIntakeTurnstile.js";

/**
 * Intake Procedure handler registry.
 */
export function buildHandlers(): Readonly<Record<string, AnyHandler>> {
  return {
    "notify-intake": notifyIntake,
    "verify-intake-turnstile": verifyIntakeTurnstile,
  };
}
