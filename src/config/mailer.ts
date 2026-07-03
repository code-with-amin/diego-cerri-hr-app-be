import nodemailer, { Transporter } from 'nodemailer';
import { env } from './env';

/**
 * SMTP transporter built from env.
 *
 * Note on `secure`: implicit TLS (secure:true) is only valid for port 465.
 * Local Mailpit listens on 1025 with *plain* SMTP, so forcing secure:true there
 * fails the TLS handshake. We therefore only enable implicit TLS for port 465;
 * any other port uses plain/STARTTLS. This keeps local Mailpit working even
 * when SMTP_SECURE is left "true" in the environment.
 */
const secure = env.SMTP_PORT === 465;

const auth = env.SMTP_USER
  ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' }
  : undefined;

let transporter: Transporter | null = null;

export function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure,
      auth,
    });
  }
  return transporter;
}
