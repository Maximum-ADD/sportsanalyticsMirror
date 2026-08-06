import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/passport.js";

const passwordResetTokens = new Map<string, { userId: string; expiresAt: number }>();
const RESET_TOKEN_TTL_MILLISECONDS = 1000 * 60 * 30;

export function createUser(email: string, plainTextPassword: string) {
  return hashPassword(plainTextPassword).then((passwordHash) =>
    prisma.user.create({ data: { email, passwordHash } })
  );
}

export function getUserById(userId: string) {
  return prisma.user.findUnique({ where: { id: userId } });
}

export function deleteUser(userId: string) {
  return prisma.user.delete({ where: { id: userId } });
}

// Generates a one-time reset token. A real deployment sends this via email;
// for the base scaffold it is returned directly so the flow is testable end to end.
export function createPasswordResetToken(userId: string): string {
  const token = randomUUID();
  passwordResetTokens.set(token, { userId, expiresAt: Date.now() + RESET_TOKEN_TTL_MILLISECONDS });
  return token;
}

export async function resetPasswordWithToken(token: string, newPlainTextPassword: string): Promise<boolean> {
  const entry = passwordResetTokens.get(token);
  if (!entry || entry.expiresAt < Date.now()) {
    return false;
  }

  const passwordHash = await hashPassword(newPlainTextPassword);
  await prisma.user.update({ where: { id: entry.userId }, data: { passwordHash } });
  passwordResetTokens.delete(token);
  return true;
}
