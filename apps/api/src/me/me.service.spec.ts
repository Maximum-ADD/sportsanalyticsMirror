import type { Player, Team, User } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidTutorialId, isValidUsername, MAX_TUTORIAL_ID_LENGTH, MeService } from "./me.service.js";
import type { AvatarStorageService } from "./avatar-storage.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";

const TEAM: Team = {
  id: "team-1",
  nbaTeamId: 1,
  name: "Lakers",
  abbreviation: "LAL",
  city: "Los Angeles",
  conference: "West",
  division: "Pacific",
  logoUrl: null,
};

const PLAYER: Player = {
  id: "player-1",
  nbaPlayerId: 1,
  firstName: "LeBron",
  lastName: "James",
  position: "F",
  heightInches: null,
  weightLbs: null,
  jerseyNumber: null,
  headshotUrl: null,
  teamId: TEAM.id,
  birthDate: null,
  school: null,
  country: null,
  lastAffiliation: null,
  seasonExp: null,
  rosterStatus: null,
  draftYear: null,
  draftRound: null,
  draftNumber: null,
};

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    name: "Test User",
    email: "test@example.com",
    emailVerified: true,
    image: null,
    role: "USER",
    createdAt: new Date(),
    updatedAt: new Date(),
    username: null,
    avatarUrl: null,
    favoriteTeamId: null,
    autoOpenTutorials: true,
    ...overrides,
  } as User;
}

describe("isValidUsername", () => {
  it("accepts a 3-20 char alphanumeric+underscore username starting with a letter", () => {
    expect(isValidUsername("lebron_23")).toBe(true);
    expect(isValidUsername("abc")).toBe(true);
    expect(isValidUsername("a".repeat(20))).toBe(true);
  });

  it("rejects usernames that are too short, too long, or start with a digit", () => {
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("a".repeat(21))).toBe(false);
    expect(isValidUsername("1abc")).toBe(false);
  });

  it("rejects usernames containing characters outside letters/digits/underscore", () => {
    expect(isValidUsername("lebron james")).toBe(false);
    expect(isValidUsername("lebron-james")).toBe(false);
    expect(isValidUsername("lebron@23")).toBe(false);
  });
});

describe("isValidTutorialId", () => {
  it("accepts lowercase slugs up to the length cap", () => {
    expect(isValidTutorialId("home")).toBe(true);
    expect(isValidTutorialId("player-profile")).toBe(true);
    expect(isValidTutorialId("home-v2")).toBe(true);
    expect(isValidTutorialId("a".repeat(MAX_TUTORIAL_ID_LENGTH))).toBe(true);
  });

  it("rejects anything that is not a lowercase slug, or is over the cap", () => {
    expect(isValidTutorialId("")).toBe(false);
    expect(isValidTutorialId("Home")).toBe(false);
    expect(isValidTutorialId("home page")).toBe(false);
    expect(isValidTutorialId("-home")).toBe(false);
    expect(isValidTutorialId("home--page")).toBe(false);
    expect(isValidTutorialId("home/../admin")).toBe(false);
    expect(isValidTutorialId("a".repeat(MAX_TUTORIAL_ID_LENGTH + 1))).toBe(false);
  });
});

describe("MeService", () => {
  let prisma: {
    user: {
      findUniqueOrThrow: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    userFollowedPlayer: { upsert: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> };
    userSeenTutorial: { upsert: ReturnType<typeof vi.fn> };
  };
  let avatarStorage: { createSignedAvatarUrl: ReturnType<typeof vi.fn>; uploadAvatar: ReturnType<typeof vi.fn>; deleteObjectBestEffort: ReturnType<typeof vi.fn> };
  let meService: MeService;

  beforeEach(() => {
    prisma = {
      user: { findUniqueOrThrow: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
      userFollowedPlayer: { upsert: vi.fn(), deleteMany: vi.fn() },
      userSeenTutorial: { upsert: vi.fn() },
    };
    avatarStorage = {
      createSignedAvatarUrl: vi.fn(),
      uploadAvatar: vi.fn(),
      deleteObjectBestEffort: vi.fn(),
    };
    meService = new MeService(prisma as unknown as PrismaService, avatarStorage as unknown as AvatarStorageService);
  });

  describe("getProfile", () => {
    it("signs a fresh URL for a user with a stored avatar object path", async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        ...makeUser({ avatarUrl: "user-1/abc.png" }),
        favoriteTeam: null,
        followedPlayers: [],
        seenTutorials: [],
      });
      avatarStorage.createSignedAvatarUrl.mockResolvedValue("https://signed.example.com/avatar.png");

      const profile = await meService.getProfile("user-1");

      expect(avatarStorage.createSignedAvatarUrl).toHaveBeenCalledWith("user-1/abc.png");
      expect(profile.avatarUrl).toBe("https://signed.example.com/avatar.png");
    });

    it("returns a null avatarUrl without calling Supabase when no avatar is set", async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        ...makeUser({ avatarUrl: null }),
        favoriteTeam: null,
        followedPlayers: [],
        seenTutorials: [],
      });

      const profile = await meService.getProfile("user-1");

      expect(avatarStorage.createSignedAvatarUrl).not.toHaveBeenCalled();
      expect(profile.avatarUrl).toBeNull();
    });

    it("unwraps the join rows into a plain array of followed players", async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        ...makeUser(),
        favoriteTeam: TEAM,
        followedPlayers: [{ userId: "user-1", playerId: PLAYER.id, createdAt: new Date(), player: PLAYER }],
        seenTutorials: [],
      });

      const profile = await meService.getProfile("user-1");

      expect(profile.followedPlayers).toEqual([PLAYER]);
      expect(profile.favoriteTeam).toEqual(TEAM);
    });

    // The page decides whether to open its tutorial from this profile alone,
    // so both fields have to ride along on every GET /v1/me.
    it("lists the ids of the tutorials the user has seen, and whether tutorials open by themselves", async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        ...makeUser({ autoOpenTutorials: false }),
        favoriteTeam: null,
        followedPlayers: [],
        seenTutorials: [{ tutorialId: "home" }, { tutorialId: "player-profile" }],
      });

      const profile = await meService.getProfile("user-1");

      expect(profile.seenTutorialIds).toEqual(["home", "player-profile"]);
      expect(profile.autoOpenTutorials).toBe(false);
    });
  });

  describe("isUsernameTaken", () => {
    it("is false when no user has that username", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      expect(await meService.isUsernameTaken("freeusername", "user-1")).toBe(false);
    });

    it("is false when the only match is the user's own current username", async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ id: "user-1", username: "myname" }));
      expect(await meService.isUsernameTaken("myname", "user-1")).toBe(false);
    });

    it("is true when a different user already has that username", async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ id: "user-2", username: "taken" }));
      expect(await meService.isUsernameTaken("taken", "user-1")).toBe(true);
    });
  });

  describe("updateProfile", () => {
    it("only writes the fields that were actually provided", async () => {
      prisma.user.update.mockResolvedValue(makeUser());

      await meService.updateProfile("user-1", { username: "newname" });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { username: "newname" },
      });
    });

    it("allows clearing favoriteTeamId back to null", async () => {
      prisma.user.update.mockResolvedValue(makeUser());

      await meService.updateProfile("user-1", { favoriteTeamId: null });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { favoriteTeamId: null },
      });
    });

    // false is a real value here (the tutorial's "Skip all"), so it must be
    // written rather than mistaken for "not provided".
    it("writes autoOpenTutorials when it is false", async () => {
      prisma.user.update.mockResolvedValue(makeUser());

      await meService.updateProfile("user-1", { autoOpenTutorials: false });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { autoOpenTutorials: false },
      });
    });
  });

  describe("updateAvatar", () => {
    it("uploads the new avatar, points the user at it, then cleans up the old object", async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue(makeUser({ avatarUrl: "user-1/old.png" }));
      avatarStorage.uploadAvatar.mockResolvedValue("user-1/new.png");
      avatarStorage.createSignedAvatarUrl.mockResolvedValue("https://signed.example.com/new.png");

      const result = await meService.updateAvatar("user-1", { buffer: Buffer.from(""), mimetype: "image/png" });

      expect(avatarStorage.uploadAvatar).toHaveBeenCalledWith("user-1", { buffer: Buffer.from(""), mimetype: "image/png" });
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { avatarUrl: "user-1/new.png" } });
      expect(avatarStorage.deleteObjectBestEffort).toHaveBeenCalledWith("user-1/old.png");
      expect(result).toBe("https://signed.example.com/new.png");
    });

    it("skips cleanup when the user had no previous avatar", async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue(makeUser({ avatarUrl: null }));
      avatarStorage.uploadAvatar.mockResolvedValue("user-1/new.png");
      avatarStorage.createSignedAvatarUrl.mockResolvedValue("https://signed.example.com/new.png");

      await meService.updateAvatar("user-1", { buffer: Buffer.from(""), mimetype: "image/png" });

      expect(avatarStorage.deleteObjectBestEffort).not.toHaveBeenCalled();
    });
  });

  describe("followPlayer / unfollowPlayer", () => {
    it("upserts the follow row so following twice never throws a duplicate-key error", async () => {
      await meService.followPlayer("user-1", "player-1");

      expect(prisma.userFollowedPlayer.upsert).toHaveBeenCalledWith({
        where: { userId_playerId: { userId: "user-1", playerId: "player-1" } },
        create: { userId: "user-1", playerId: "player-1" },
        update: {},
      });
    });

    it("deletes with deleteMany so unfollowing a never-followed player is a no-op, not an error", async () => {
      await meService.unfollowPlayer("user-1", "player-1");

      expect(prisma.userFollowedPlayer.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-1", playerId: "player-1" },
      });
    });
  });

  describe("markTutorialSeen", () => {
    it("upserts with an empty update, so a repeated mark neither errors nor moves the first-seen date", async () => {
      await meService.markTutorialSeen("user-1", "home");

      expect(prisma.userSeenTutorial.upsert).toHaveBeenCalledWith({
        where: { userId_tutorialId: { userId: "user-1", tutorialId: "home" } },
        create: { userId: "user-1", tutorialId: "home" },
        update: {},
      });
    });
  });
});
