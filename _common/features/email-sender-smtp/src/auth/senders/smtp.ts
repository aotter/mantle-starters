import type { EmailSendArgs, EmailSender } from "@aotter/mantle/runtime";
import { WorkerMailer } from "worker-mailer";

export interface SmtpEmailSenderEnv {
  readonly SMTP_HOST?: string;
  readonly SMTP_PORT?: string;
  readonly SMTP_USER?: string;
  readonly SMTP_PASS?: string;
  readonly EMAIL_FROM?: string;
}

export interface SmtpEmailSenderConfig {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;
  readonly from: string;
  readonly authType?: "plain" | "login" | "cram-md5";
  readonly secure?: boolean;
  readonly startTls?: boolean;
}

export function buildSmtpEmailSenderFromEnv(
  env: SmtpEmailSenderEnv,
): SmtpEmailSender | null {
  const required = {
    SMTP_HOST: nonEmpty(env.SMTP_HOST),
    SMTP_USER: nonEmpty(env.SMTP_USER),
    SMTP_PASS: nonEmpty(env.SMTP_PASS),
    EMAIL_FROM: nonEmpty(env.EMAIL_FROM),
  };
  const smtpPort = nonEmpty(env.SMTP_PORT);
  const hasAnySmtpConfig =
    smtpPort !== undefined ||
    Object.values(required).some((value) => value !== undefined);
  if (!hasAnySmtpConfig) return null;

  const missing = Object.entries(required)
    .filter(([, value]) => value === undefined)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(
      `SMTP email sender is partially configured; missing ${missing.join(", ")}.`,
    );
  }

  return new SmtpEmailSender({
    host: required.SMTP_HOST!,
    port: parseSmtpPort(smtpPort ?? "465"),
    username: required.SMTP_USER!,
    password: required.SMTP_PASS!,
    from: required.EMAIL_FROM!,
  });
}

export class SmtpEmailSender implements EmailSender {
  constructor(private readonly config: SmtpEmailSenderConfig) {}

  async send(args: EmailSendArgs): Promise<void> {
    const port = parseSmtpPort(this.config.port);
    await WorkerMailer.send(
      {
        host: this.config.host,
        port,
        secure: this.config.secure ?? port === 465,
        startTls: this.config.startTls ?? port !== 465,
        authType: this.config.authType ?? "plain",
        credentials: {
          username: this.config.username,
          password: this.config.password,
        },
      },
      {
        from: this.config.from,
        to: args.to,
        subject: args.subject,
        text: args.text,
        ...(args.html !== undefined ? { html: args.html } : {}),
      },
    );
  }
}

function parseSmtpPort(raw: string | number): number {
  if (typeof raw === "string" && !/^[0-9]+$/.test(raw)) {
    throw new Error(`Invalid SMTP_PORT "${raw}".`);
  }
  const port = typeof raw === "number" ? raw : Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid SMTP_PORT "${String(raw)}".`);
  }
  if (port === 25) {
    throw new Error("Cloudflare Workers cannot connect to outbound SMTP port 25.");
  }
  return port;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
