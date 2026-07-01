import type { HandlerContext } from "@aotter/mantle/runtime";

interface EmailBinding {
  send(message: {
    to: string;
    from: string;
    subject: string;
    text?: string;
    replyTo?: string;
  }): Promise<unknown>;
}

interface NotifyIntakeEnv {
  readonly EMAIL?: EmailBinding;
  readonly INTAKE_NOTIFY_TO?: string;
  readonly INTAKE_NOTIFY_FROM?: string;
}

/**
 * Optional intake notification handler.
 *
 * To send real email, enable Cloudflare Email Service sending, add:
 *
 *   [[send_email]]
 *   name = "EMAIL"
 *
 * Then configure INTAKE_NOTIFY_TO and INTAKE_NOTIFY_FROM. Without
 * that setup this handler logs and returns ok, so submissions still
 * save during the first provision.
 */
export async function notifyIntake(
  input: {
    name?: string;
    email?: string;
    attendance?: string;
    resultKey?: string;
    note?: string;
  },
  ctx: HandlerContext,
): Promise<{ ok: true }> {
  const env = ctx.env as NotifyIntakeEnv;
  if (!env.EMAIL || !env.INTAKE_NOTIFY_TO || !env.INTAKE_NOTIFY_FROM) {
    console.info("[intake] notification not configured", {
      name: input.name,
      email: input.email,
      resultKey: input.resultKey,
    });
    return { ok: true };
  }

  await env.EMAIL.send({
    to: env.INTAKE_NOTIFY_TO,
    from: env.INTAKE_NOTIFY_FROM,
    subject: `New intake response from ${input.name ?? "website"}`,
    text: [
      `Name: ${input.name ?? ""}`,
      `Email: ${input.email ?? ""}`,
      `Attendance: ${input.attendance ?? ""}`,
      `Result: ${input.resultKey ?? ""}`,
      "",
      input.note ?? "",
    ].join("\n"),
    ...(input.email ? { replyTo: input.email } : {}),
  });

  return { ok: true };
}
