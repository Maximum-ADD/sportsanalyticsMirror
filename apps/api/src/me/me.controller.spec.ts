import type { Request } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeController } from "./me.controller.js";
import type { MeProfile, MeService } from "./me.service.js";
import { MAX_AVATAR_SIZE_BYTES } from "./avatar-storage.service.js";
import { ApiException } from "../common/api-exception.js";

function makeRequest(userId = "user-1"): Request {
  return { user: { id: userId } } as unknown as Request;
}

function makeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: "file",
    originalname: "avatar.png",
    encoding: "7bit",
    mimetype: "image/png",
    size: 1024,
    buffer: Buffer.from("fake"),
    stream: undefined as never,
    destination: "",
    filename: "",
    path: "",
    ...overrides,
  } as Express.Multer.File;
}

describe("MeController", () => {
  let meService: {
    getProfile: ReturnType<typeof vi.fn>;
    isUsernameTaken: ReturnType<typeof vi.fn>;
    updateProfile: ReturnType<typeof vi.fn>;
    updateAvatar: ReturnType<typeof vi.fn>;
    followPlayer: ReturnType<typeof vi.fn>;
    unfollowPlayer: ReturnType<typeof vi.fn>;
  };
  let controller: MeController;

  beforeEach(() => {
    meService = {
      getProfile: vi.fn(),
      isUsernameTaken: vi.fn(),
      updateProfile: vi.fn(),
      updateAvatar: vi.fn(),
      followPlayer: vi.fn(),
      unfollowPlayer: vi.fn(),
    };
    controller = new MeController(meService as unknown as MeService);
  });

  describe("getProfile", () => {
    it("reads the caller's own id off request.user, not a query param", async () => {
      meService.getProfile.mockResolvedValue({} as MeProfile);

      await controller.getProfile(makeRequest("user-42"));

      expect(meService.getProfile).toHaveBeenCalledWith("user-42");
    });
  });

  describe("updateProfile", () => {
    it("rejects a malformed username before ever touching the database", async () => {
      await expect(controller.updateProfile(makeRequest(), { username: "a" })).rejects.toThrow(ApiException);
      expect(meService.isUsernameTaken).not.toHaveBeenCalled();
      expect(meService.updateProfile).not.toHaveBeenCalled();
    });

    it("returns 409 when the username is already taken", async () => {
      meService.isUsernameTaken.mockResolvedValue(true);

      await expect(controller.updateProfile(makeRequest(), { username: "taken_name" })).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
      expect(meService.updateProfile).not.toHaveBeenCalled();
    });

    it("updates and re-reads the profile when the username is valid and free", async () => {
      meService.isUsernameTaken.mockResolvedValue(false);
      meService.getProfile.mockResolvedValue({ username: "new_name" } as MeProfile);

      const result = await controller.updateProfile(makeRequest(), { username: "new_name" });

      expect(meService.updateProfile).toHaveBeenCalledWith("user-1", { username: "new_name" });
      expect(result).toEqual({ username: "new_name" });
    });

    it("allows updating favoriteTeamId alone, skipping username validation entirely", async () => {
      meService.getProfile.mockResolvedValue({} as MeProfile);

      await controller.updateProfile(makeRequest(), { favoriteTeamId: "team-1" });

      expect(meService.isUsernameTaken).not.toHaveBeenCalled();
      expect(meService.updateProfile).toHaveBeenCalledWith("user-1", { favoriteTeamId: "team-1" });
    });

    it("maps a Prisma unique-constraint race to the same 409 as the pre-check", async () => {
      meService.isUsernameTaken.mockResolvedValue(false);
      meService.updateProfile.mockRejectedValue({ code: "P2002" });

      await expect(controller.updateProfile(makeRequest(), { username: "race_name" })).rejects.toThrow(ApiException);
    });
  });

  describe("uploadAvatar", () => {
    it("rejects when no file was attached", async () => {
      await expect(controller.uploadAvatar(makeRequest(), undefined)).rejects.toThrow(ApiException);
      expect(meService.updateAvatar).not.toHaveBeenCalled();
    });

    it("rejects an unsupported mime type before calling Supabase", async () => {
      await expect(controller.uploadAvatar(makeRequest(), makeFile({ mimetype: "application/pdf" }))).rejects.toThrow(
        ApiException
      );
      expect(meService.updateAvatar).not.toHaveBeenCalled();
    });

    it("rejects a file over the size cap before calling Supabase", async () => {
      await expect(
        controller.uploadAvatar(makeRequest(), makeFile({ size: MAX_AVATAR_SIZE_BYTES + 1 }))
      ).rejects.toThrow(ApiException);
      expect(meService.updateAvatar).not.toHaveBeenCalled();
    });

    it("uploads a valid image and returns its signed URL", async () => {
      meService.updateAvatar.mockResolvedValue("https://signed.example.com/avatar.png");

      const result = await controller.uploadAvatar(makeRequest(), makeFile());

      expect(meService.updateAvatar).toHaveBeenCalledWith("user-1", { buffer: expect.any(Buffer), mimetype: "image/png" });
      expect(result).toEqual({ avatarUrl: "https://signed.example.com/avatar.png" });
    });
  });

  describe("followPlayer / unfollowPlayer", () => {
    it("follows a player for the calling user", async () => {
      const result = await controller.followPlayer(makeRequest(), "player-1");

      expect(meService.followPlayer).toHaveBeenCalledWith("user-1", "player-1");
      expect(result).toEqual({ following: true });
    });

    it("unfollows a player for the calling user", async () => {
      const result = await controller.unfollowPlayer(makeRequest(), "player-1");

      expect(meService.unfollowPlayer).toHaveBeenCalledWith("user-1", "player-1");
      expect(result).toEqual({ following: false });
    });
  });
});
