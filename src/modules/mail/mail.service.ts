import { getTransporter } from '../../config/mailer';
import { env } from '../../config/env';

interface Sendable {
  to: string;
  subject: string;
  text: string;
}

async function send({ to, subject, text }: Sendable): Promise<void> {
  const transporter = getTransporter();
  await transporter.sendMail({ from: env.MAIL_FROM, to, subject, text });
}

/** Sent when HR first approves a candidate — delivers the generated password. */
export async function sendApprovalPassword(to: string, name: string | null, password: string) {
  const greeting = name ? `Olá ${name},` : 'Olá,';
  const loginUrl = `${env.APP_EMPLOYEE_URL}/employee/login`;
  await send({
    to,
    subject: 'Sua conta de colaborador foi criada',
    text: [
      greeting,
      '',
      'Sua candidatura foi aprovada e uma conta de colaborador foi criada para você.',
      '',
      `E-mail: ${to}`,
      `Senha temporária: ${password}`,
      '',
      `Acesse o portal do colaborador: ${loginUrl}`,
      '',
      'Recomendamos alterar sua senha após o primeiro acesso usando "Esqueci minha senha".',
      '',
      'Equipe de RH',
    ].join('\n'),
  });
}

/** Sent when an admin sets/changes an employee's password from the HR portal. */
export async function sendAdminSetPassword(to: string, name: string | null, password: string) {
  const greeting = name ? `Olá ${name},` : 'Olá,';
  const loginUrl = `${env.APP_EMPLOYEE_URL}/employee/login`;
  await send({
    to,
    subject: 'Sua senha foi atualizada',
    text: [
      greeting,
      '',
      'Um administrador definiu uma nova senha para a sua conta.',
      '',
      `E-mail: ${to}`,
      `Nova senha: ${password}`,
      '',
      `Acesse o portal do colaborador: ${loginUrl}`,
      '',
      'Equipe de RH',
    ].join('\n'),
  });
}

/** Sent on a password-reset request — carries the tokenized reset link. */
export async function sendPasswordReset(to: string, name: string | null, token: string) {
  const greeting = name ? `Olá ${name},` : 'Olá,';
  const resetUrl = `${env.APP_EMPLOYEE_URL}/employee/reset-password?token=${token}`;
  await send({
    to,
    subject: 'Redefinição de senha',
    text: [
      greeting,
      '',
      'Recebemos uma solicitação para redefinir a senha da sua conta.',
      '',
      `Redefina sua senha aqui: ${resetUrl}`,
      '',
      'Se você não solicitou isso, ignore este e-mail. O link expira em breve.',
      '',
      'Equipe de RH',
    ].join('\n'),
  });
}
