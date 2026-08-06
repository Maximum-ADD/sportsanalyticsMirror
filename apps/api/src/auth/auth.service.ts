import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service.js";

const SALT_ROUNDS = 12;
const RESET_TOKEN_TTL_MILLISECONDS = 1000 * 60 * 30;

@Injectable()
export class AuthService {
  private readonly passwordResetTokens = new Map<string, { userId: string; expiresAt: number }>();

  constructor(private readonly prisma: PrismaService) {}

  hashPassword(plainTextPassword: string): Promise<string> {
    return bcrypt.hash(plainTextPassword, SALT_ROUNDS);
  }

  verifyPassword(plainTextPassword: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(plainTextPassword, passwordHash);
  }

  createUser(email: string, plainTextPassword: string) {
    return this.hashPassword(plainTextPassword).then((passwordHash) =>
      this.prisma.user.create({ data: { email, passwordHash } })
    );
  }

  async validateCredentials(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return null;

    const passwordIsValid = await this.verifyPassword(password, user.passwordHash);
    if (!passwordIsValid) return null;

    return user;
  }

  deleteUser(userId: string) {
    return this.prisma.user.delete({ where: { id: userId } });
  }

  findUserByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  // Generates a one-time reset token. A real deployment sends this via email;
  // for the base scaffold it is returned directly so the flow is testable end to end.
  createPasswordResetToken(userId: string): string {
    const token = randomUUID();
    this.passwordResetTokens.set(token, { userId, expiresAt: Date.now() + RESET_TOKEN_TTL_MILLISECONDS });
    return token;
  }

  async resetPasswordWithToken(token: string, newPlainTextPassword: string): Promise<boolean> {
    const entry = this.passwordResetTokens.get(token);
    if (!entry || entry.expiresAt < Date.now()) {
      return false;
    }

    const passwordHash = await this.hashPassword(newPlainTextPassword);
    await this.prisma.user.update({ where: { id: entry.userId }, data: { passwordHash } });
    this.passwordResetTokens.delete(token);
    return true;
  }
}
