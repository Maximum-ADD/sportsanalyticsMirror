import { Injectable } from "@nestjs/common";
import { PassportSerializer } from "@nestjs/passport";
import type { User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";

// Controls what's stored in the session cookie versus looked up per request.
// Only the user id goes into the session (serializeUser); every request then
// re-fetches the full user row from the current database state
// (deserializeUser), so a role change or account deletion takes effect
// immediately rather than waiting for the session to expire.
@Injectable()
export class SessionSerializer extends PassportSerializer {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  serializeUser(user: User, done: (err: Error | null, id: string) => void) {
    done(null, user.id);
  }

  async deserializeUser(id: string, done: (err: Error | null, user: User | false) => void) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    done(null, user ?? false);
  }
}
