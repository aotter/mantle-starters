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

interface NotifyContactEnv {
  readonly EMAIL?: EmailBinding;
  readonly CONTACT_NOTIFY_TO?: string;
  readonly CONTACT_NOTIFY_FROM?: string;
}

/**
 * Optional contact notification handler.
 *
 * To send real email, enable Cloudflare Email Service sending, add:
 *
 *   [[send_email]]
 *   name = "EMAIL"
 *
 * Then configure CONTACT_NOTIFY_TO and CONTACT_NOTIFY_FROM. Without
 * that setup this handler logs and returns ok, so contact submissions
 * still save during the first provision.
 */
export async function notifyContact(
  input: { name?: string; email?: string; message?: string },
  ctx: HandlerContext,
): Promise<{ ok: true }> {
  const env = ctx.env as NotifyContactEnv;
  if (!env.EMAIL || !env.CONTACT_NOTIFY_TO || !env.CONTACT_NOTIFY_FROM) {
    console.info("[contact] notification not configured", {
      name: input.name,
      email: input.email,
    });
    return { ok: true };
  }

  await env.EMAIL.send({
    to: env.CONTACT_NOTIFY_TO,
    from: env.CONTACT_NOTIFY_FROM,
    subject: `New contact message from ${input.name ?? "website"}`,
    text: [`Name: ${input.name ?? ""}`, `Email: ${input.email ?? ""}`, "", input.message ?? ""].join("\n"),
    ...(input.email ? { replyTo: input.email } : {}),
  });

  return { ok: true };
}
