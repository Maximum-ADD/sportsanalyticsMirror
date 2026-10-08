import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteUserAvatars } from "../me/avatar-cleanup.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { AdminUsersService } from "./admin-users.service.js";

// Storage is a separate service; these specs only check it is asked.
vi.mock("../me/avatar-cleanup.js", () => ({ deleteUserAvatars: vi.fn().mockResolvedValue(undefined) }));

const OTHER_USER = {
  id: "user-2",
  email: "other@example.com",
  name: "Other",
  username: "otheruser",
  role: "USER" as const,
  createdAt: new Date("2026-01-01"),
};

describe("AdminUsersService", () => {
  let prisma: {
    user: {
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
  };
  let service: AdminUsersService;

  beforeEach(() => {
    prisma = {
      user: {
        findMany: vi.fn().mockResolvedValue([OTHER_USER]),
        count: vi.fn().mockResolvedValue(1),
        findUnique: vi.fn().mockResolvedValue(OTHER_USER),
        update: vi.fn().mockResolvedValue({ ...OTHER_USER, role: "ADMIN" }),
        delete: vi.fn().mockResolvedValue(OTHER_USER),
      },
    };
    service = new AdminUsersService(prisma as unknown as PrismaService);
  });

  const SELECT = { id: true, email: true, name: true, username: true, role: true, createdAt: true };

  it("lists users with default pagination, selecting only the summary fields", async () => {
    const result = await service.listUsers({});

    expect(result).toEqual({ data: [OTHER_USER], page: 1, pageSize: 25, total: 1 });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { AND: [] }, select: SELECT, skip: 0, take: 25 })
    );
  });

  it("builds an insensitive OR filter over email/name/username per search term", async () => {
    await service.listUsers({ search: "oth" });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              OR: [
                { email: { contains: "oth", mode: "insensitive" } },
                { name: { contains: "oth", mode: "insensitive" } },
                { username: { contains: "oth", mode: "insensitive" } },
              ],
            },
          ],
        },
      })
    );
  });

  it("getUserById reads a single user, selecting only the summary fields", async () => {
    const result = await service.getUserById("user-2");

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: "user-2" }, select: SELECT });
    expect(result).toBe(OTHER_USER);
  });

  it("deleteUser deletes by id", async () => {
    await service.deleteUser("user-2");

    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: "user-2" } });
  });

  it("deleteUser removes the user's stored avatars once the row is gone", async () => {
    vi.mocked(deleteUserAvatars).mockClear();

    await service.deleteUser("user-2");

    expect(deleteUserAvatars).toHaveBeenCalledWith("user-2");
  });

  it("deleteUser leaves the avatars alone when the row can't be deleted", async () => {
    vi.mocked(deleteUserAvatars).mockClear();
    prisma.user.delete.mockRejectedValue(new Error("not found"));

    await expect(service.deleteUser("missing")).rejects.toThrow("not found");
    expect(deleteUserAvatars).not.toHaveBeenCalled();
  });

  it("updateRole updates the role, selecting only the summary fields", async () => {
    const result = await service.updateRole("user-2", "ADMIN");

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-2" },
      data: { role: "ADMIN" },
      select: SELECT,
    });
    expect(result.role).toBe("ADMIN");
  });
});
