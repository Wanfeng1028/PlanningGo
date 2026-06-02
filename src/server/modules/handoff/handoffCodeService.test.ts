import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "../../../generated/prisma/client.js";

// Mock dependencies
vi.mock("../../common/prisma", () => ({
  getPrismaClient: vi.fn(),
}));

vi.mock("../../config/env", () => ({
  env: {
    PUBLIC_APP_URL: "http://localhost:5173",
    HANDOFF_TOKEN_TTL_SECONDS: 600,
  },
}));

vi.mock("qrcode", () => ({
  default: {
    toString: vi.fn(async () => "<svg>mock-qr</svg>"),
  },
}));

import { getPrismaClient } from "../../common/prisma";
import { createHandoffCode, getHandoffCode, claimHandoffCode } from "./handoffCodeService";

const mockPrisma = {
  handoffCode: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPrismaClient).mockReturnValue(mockPrisma as unknown as PrismaClient);
});

describe("createHandoffCode", () => {
  it("should create a handoff code and return QR SVG", async () => {
    mockPrisma.handoffCode.create.mockResolvedValue({});

    const result = await createHandoffCode({
      conversationId: "conv-123",
      planId: "plan-456",
      userId: "user-1",
    });

    expect(result.code).toHaveLength(6);
    expect(result.continueUrl).toContain("/handoff/");
    expect(result.continueUrl).toContain(result.code);
    expect(result.qrSvg).toBe("<svg>mock-qr</svg>");
    expect(result.expiresAt).toBeTruthy();

    expect(mockPrisma.handoffCode.create).toHaveBeenCalledOnce();
    const createCall = mockPrisma.handoffCode.create.mock.calls[0][0];
    expect(createCall.data.conversationId).toBe("conv-123");
    expect(createCall.data.planId).toBe("plan-456");
    expect(createCall.data.userId).toBe("user-1");
    expect(createCall.data.status).toBe("active");
  });

  it("should generate unique codes each time", async () => {
    mockPrisma.handoffCode.create.mockResolvedValue({});

    const codes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const result = await createHandoffCode({ conversationId: "conv-1" });
      codes.add(result.code);
    }

    // Very unlikely to have duplicates with 32-char alphabet and 6-char code
    expect(codes.size).toBe(20);
  });

  it("should set expiresAt to ~10 minutes from now", async () => {
    mockPrisma.handoffCode.create.mockResolvedValue({});

    const before = Date.now();
    const result = await createHandoffCode({ conversationId: "conv-1" });
    const after = Date.now();

    const expiresAt = new Date(result.expiresAt).getTime();
    const tenMinMs = 10 * 60 * 1000;

    expect(expiresAt).toBeGreaterThanOrEqual(before + tenMinMs - 100);
    expect(expiresAt).toBeLessThanOrEqual(after + tenMinMs + 100);
  });

  it("should not include auth tokens in continue URL", async () => {
    mockPrisma.handoffCode.create.mockResolvedValue({});

    const result = await createHandoffCode({
      conversationId: "conv-1",
      userId: "user-1",
    });

    expect(result.continueUrl).not.toContain("token");
    expect(result.continueUrl).not.toContain("accessToken");
    expect(result.continueUrl).not.toContain("refreshToken");
    // Only contains the short code
    expect(result.continueUrl).toMatch(/^http:\/\/localhost:5173\/handoff\/[A-Z0-9]{6}$/);
  });

  it("should handle optional planId", async () => {
    mockPrisma.handoffCode.create.mockResolvedValue({});

    await createHandoffCode({ conversationId: "conv-1" });

    const createCall = mockPrisma.handoffCode.create.mock.calls[0][0];
    expect(createCall.data.planId).toBeNull();
  });

  it("should throw when database is unavailable", async () => {
    vi.mocked(getPrismaClient).mockReturnValue(null);

    await expect(
      createHandoffCode({ conversationId: "conv-1" })
    ).rejects.toThrow("Database not available");
  });
});

describe("getHandoffCode", () => {
  it("should return handoff code data when active and not expired", async () => {
    const futureExpiry = new Date(Date.now() + 5 * 60 * 1000);
    mockPrisma.handoffCode.findUnique.mockResolvedValue({
      code: "ABC123",
      conversationId: "conv-1",
      planId: "plan-1",
      userId: "user-1",
      guestId: null,
      status: "active",
      expiresAt: futureExpiry,
    });

    const result = await getHandoffCode("abc123");

    expect(result).not.toBeNull();
    expect(result!.code).toBe("ABC123");
    expect(result!.conversationId).toBe("conv-1");
    expect(result!.status).toBe("active");

    // Verify case-insensitive lookup
    expect(mockPrisma.handoffCode.findUnique.mock.calls[0][0].where.code).toBe("ABC123");
  });

  it("should return null when code does not exist", async () => {
    mockPrisma.handoffCode.findUnique.mockResolvedValue(null);

    const result = await getHandoffCode("NOTEXIST");
    expect(result).toBeNull();
  });

  it("should return null when code has expired", async () => {
    const pastExpiry = new Date(Date.now() - 1000);
    mockPrisma.handoffCode.findUnique.mockResolvedValue({
      code: "EXPIRED",
      conversationId: "conv-1",
      planId: null,
      userId: null,
      guestId: null,
      status: "active",
      expiresAt: pastExpiry,
    });

    const result = await getHandoffCode("EXPIRED");
    expect(result).toBeNull();
  });

  it("should return null when code is already claimed", async () => {
    const futureExpiry = new Date(Date.now() + 5 * 60 * 1000);
    mockPrisma.handoffCode.findUnique.mockResolvedValue({
      code: "CLAIMED",
      conversationId: "conv-1",
      planId: null,
      userId: null,
      guestId: null,
      status: "claimed",
      expiresAt: futureExpiry,
    });

    const result = await getHandoffCode("CLAIMED");
    expect(result).toBeNull();
  });
});

describe("claimHandoffCode", () => {
  const futureExpiry = new Date(Date.now() + 5 * 60 * 1000);

  it("should claim an active code", async () => {
    mockPrisma.handoffCode.findUnique.mockResolvedValue({
      id: "hc-1",
      code: "ABC123",
      conversationId: "conv-1",
      planId: "plan-1",
      status: "active",
      expiresAt: futureExpiry,
    });
    mockPrisma.handoffCode.update.mockResolvedValue({});

    const result = await claimHandoffCode({
      code: "ABC123",
      deviceId: "mobile-device-1",
    });

    expect(result.success).toBe(true);
    expect(result.conversationId).toBe("conv-1");
    expect(result.planId).toBe("plan-1");

    // Verify the code was marked as claimed
    expect(mockPrisma.handoffCode.update).toHaveBeenCalledOnce();
    const updateCall = mockPrisma.handoffCode.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe("claimed");
    expect(updateCall.data.claimedDeviceId).toBe("mobile-device-1");
    expect(updateCall.data.claimedAt).toBeInstanceOf(Date);
  });

  it("should throw when code does not exist", async () => {
    mockPrisma.handoffCode.findUnique.mockResolvedValue(null);

    await expect(
      claimHandoffCode({ code: "NOEXIST", deviceId: "d1" })
    ).rejects.toThrow("not found");
  });

  it("should throw when code is already claimed", async () => {
    mockPrisma.handoffCode.findUnique.mockResolvedValue({
      id: "hc-2",
      code: "CLAIMED",
      conversationId: "conv-1",
      planId: null,
      status: "claimed",
      expiresAt: futureExpiry,
    });

    await expect(
      claimHandoffCode({ code: "CLAIMED", deviceId: "d1" })
    ).rejects.toThrow("already claimed");
  });

  it("should throw when code has expired", async () => {
    const pastExpiry = new Date(Date.now() - 1000);
    mockPrisma.handoffCode.findUnique.mockResolvedValue({
      id: "hc-3",
      code: "EXPIRED",
      conversationId: "conv-1",
      planId: null,
      status: "active",
      expiresAt: pastExpiry,
    });

    await expect(
      claimHandoffCode({ code: "EXPIRED", deviceId: "d1" })
    ).rejects.toThrow("expired");
  });

  it("should uppercase the code for lookup", async () => {
    mockPrisma.handoffCode.findUnique.mockResolvedValue({
      id: "hc-4",
      code: "ABCDEF",
      conversationId: "conv-1",
      planId: null,
      status: "active",
      expiresAt: futureExpiry,
    });
    mockPrisma.handoffCode.update.mockResolvedValue({});

    await claimHandoffCode({ code: "abcdef", deviceId: "d1" });

    expect(mockPrisma.handoffCode.findUnique.mock.calls[0][0].where.code).toBe("ABCDEF");
  });
});
