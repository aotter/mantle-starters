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
  readonly from: SmtpAddress;
  readonly authType?: "plain" | "login" | "cram-md5";
  readonly secure?: boolean;
  readonly startTls?: boolean;
}

export interface SmtpAddress {
  readonly email: string;
  readonly name?: string;
}

// `buildSmtpEmailSenderFromEnv` only allows port 465 (implicit TLS) because
// `worker-mailer` does STARTTLS opportunistically — on port 587 it will
// continue in cleartext if the server fails to advertise STARTTLS in EHLO.
// Adopters who accept that risk can instantiate `SmtpEmailSender` directly
// with `{ port: 587, startTls: true }`; the env helper stays narrow.
const ALLOWED_ENV_SMTP_PORT = 465;

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

  const port = parseSmtpPort(smtpPort ?? String(ALLOWED_ENV_SMTP_PORT));
  if (port !== ALLOWED_ENV_SMTP_PORT) {
    throw new Error(
      `SMTP_PORT=${port} not supported by env helper. Only ${ALLOWED_ENV_SMTP_PORT} (implicit TLS) is allowed because worker-mailer STARTTLS is opportunistic. Construct SmtpEmailSender directly if you accept that risk.`,
    );
  }

  return new SmtpEmailSender({
    host: required.SMTP_HOST!,
    port,
    username: required.SMTP_USER!,
    password: required.SMTP_PASS!,
    from: parseFromAddress(required.EMAIL_FROM!),
  });
}

export class SmtpEmailSender implements EmailSender {
  constructor(private readonly config: SmtpEmailSenderConfig) {}

  async send(args: EmailSendArgs): Promise<void> {
    const port = parseSmtpPort(this.config.port);
    const mailer = await WorkerMailer.connect({
      host: this.config.host,
      port,
      secure: this.config.secure ?? port === 465,
      startTls: this.config.startTls ?? port !== 465,
      authType: this.config.authType ?? "plain",
      credentials: {
        username: this.config.username,
        password: this.config.password,
      },
    });
    try {
      await mailer.send({
        from: this.config.from,
        to: args.to,
        subject: args.subject,
        text: args.text,
        ...(args.html !== undefined ? { html: args.html } : {}),
      });
    } finally {
      await mailer.close();
    }
  }
}

// RFC 5322 display-name parser, deliberately narrow:
//   `auth@example.com`            -> { email }
//   `Acme <auth@example.com>`     -> { name: "Acme", email }
//   `"A, Co" <auth@example.com>`  -> { name: "A, Co", email }
// Anything else throws — better a startup error than silently invalid
// `MAIL FROM` envelopes that some relays accept and others reject.
function parseFromAddress(raw: string): SmtpAddress {
  const angle = raw.match(/^\s*(?:"([^"]*)"|([^<]*?))\s*<([^>]+)>\s*$/);
  if (angle) {
    const name = (angle[1] ?? angle[2] ?? "").trim();
    const email = angle[3]!.trim();
    if (!email.includes("@")) {
      throw new Error(`EMAIL_FROM "${raw}" missing @ in address.`);
    }
    return name ? { email, name } : { email };
  }
  const bare = raw.trim();
  if (!bare.includes("@") || /[<>]/.test(bare)) {
    throw new Error(
      `EMAIL_FROM "${raw}" is not a bare address or "Display <addr>" form.`,
    );
  }
  return { email: bare };
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
