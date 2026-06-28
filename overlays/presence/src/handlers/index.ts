import type { AnyHandler } from "@aotter/mantle/runtime";
import { notifyContact } from "./notifyContact.js";
import { verifyContactTurnstile } from "./verifyContactTurnstile.js";

/**
 * Presence Procedure handler registry.
 */
export function buildHandlers(): Readonly<Record<string, AnyHandler>> {
  return {
    "notify-contact": notifyContact,
    "verify-contact-turnstile": verifyContactTurnstile,
  };
}
