import { Injectable } from "@nestjs/common";
import { Role, type User } from "@prisma/client";
import { parsePageParams, type PagedResult } from "../common/pagination.js";
import { PrismaService } from "../prisma/prisma.service.js";

export type AdminUserSummary = Pick<
  User,
  "id" | "email" | "name" | "username" | "role" | "createdAt"
>;

const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  username: true,
  role: true,
  createdAt: true,
} as const;

function getSearchTerms(search: unknown): string[] {
  return typeof search === "string" ? search.trim().split(/\s+/).filter(Boolean) : [];
}

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(query: Record<string, unknown>): Promise<PagedResult<AdminUserSummary>> {
    const { page, pageSize } = parsePageParams(query);
    const searchTerms = getSearchTerms(query.search);
    const where = {
      AND: searchTerms.map((searchTerm) => ({
        OR: [
          { email: { contains: searchTerm, mode: "insensitive" as const } },
          { name: { contains: searchTerm, mode: "insensitive" as const } },
          { username: { contains: searchTerm, mode: "insensitive" as const } },
        ],
      })),
    };

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: ADMIN_USER_SELECT,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, page, pageSize, total };
  }

  getUserById(userId: string): Promise<AdminUserSummary | null> {
    return this.prisma.user.findUnique({ where: { id: userId }, select: ADMIN_USER_SELECT });
  }

  // Cascades to Session/Account/UserFollowedPlayer/GamePick/SavedComparison(+
  // players)/SavedLineup(+slots) — every one of those relations is
  // onDelete: Cascade from the User side (see schema.prisma), so this alone
  // takes the whole account with it, the same guarantee
  // authClient.deleteUser() relies on for self-service deletion.
  async deleteUser(userId: string): Promise<void> {
    await this.prisma.user.delete({ where: { id: userId } });
  }

  updateRole(userId: string, role: Role): Promise<AdminUserSummary> {
    return this.prisma.user.update({ where: { id: userId }, data: { role }, select: ADMIN_USER_SELECT });
  }
}
