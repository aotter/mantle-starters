import { runtimeDiagnostic } from "@aotter/mantle/spec";
import { InvokeFailure, type HandlerContext } from "@aotter/mantle/runtime";

interface TurnstileEnv {
  readonly TURNSTILE_SECRET_KEY?: string;
}

interface ContactTurnstileInput {
  readonly "cf-turnstile-response"?: string;
  readonly turnstileToken?: string;
}

interface TurnstileResult {
  readonly success?: boolean;
  readonly "error-codes"?: readonly string[];
}

export async function verifyContactTurnstile(
  input: ContactTurnstileInput,
  ctx: HandlerContext,
): Promise<{ ok: true }> {
  const secret = (ctx.env as TurnstileEnv).TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return { ok: true };

  const token = (input["cf-turnstile-response"] ?? input.turnstileToken)?.trim();
  if (!token) {
    turnstileFailure("Turnstile verification is required.");
  }

  const body = new FormData();
  body.set("secret", secret);
  body.set("response", token);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });

  if (!response.ok) {
    turnstileFailure("Turnstile verification is unavailable. Please try again.");
  }

  const result = (await response.json().catch(() => null)) as TurnstileResult | null;
  if (!result?.success) {
    turnstileFailure("Turnstile verification failed. Refresh and try again.", result?.["error-codes"]);
  }

  return { ok: true };
}

function turnstileFailure(message: string, value?: unknown): never {
  throw new InvokeFailure(
    runtimeDiagnostic({
      code: "INPUT_VALIDATION_FAILED",
      severity: "error",
      path: "/cf-turnstile-response",
      value,
      expected: "valid Cloudflare Turnstile token",
      message,
    }),
  );
}
