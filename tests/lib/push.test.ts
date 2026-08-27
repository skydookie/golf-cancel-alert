import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";

const prismaMock = {
  pushSubscription: {
    findMany: vi.fn(),
    delete: vi.fn(),
  },
};
vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

const sendNotificationMock = vi.fn();
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: (...args: unknown[]) => sendNotificationMock(...args),
  },
}));

beforeAll(() => {
  process.env.VAPID_PUBLIC_KEY = "pub";
  process.env.VAPID_PRIVATE_KEY = "priv";
  process.env.VAPID_SUBJECT = "mailto:test@example.com";
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendSlotPushToUser", () => {
  it("User의 모든 구독 기기 각각에 발송한다", async () => {
    prismaMock.pushSubscription.findMany.mockResolvedValue([
      { endpoint: "https://push.example/a", p256dh: "p1", auth: "a1" },
      { endpoint: "https://push.example/b", p256dh: "p2", auth: "a2" },
    ]);
    sendNotificationMock.mockResolvedValue(undefined);

    const { sendSlotPushToUser } = await import("@/lib/push");
    await sendSlotPushToUser("u1", {
      facilityName: "라비에벨 올드코스",
      date: "2026-09-06",
      course: "OUT",
      time: "07:26",
      price: 250000,
      deepLinkUrl: "https://example.com/deep-link",
    });

    expect(sendNotificationMock).toHaveBeenCalledTimes(2);
  });

  it("만료된 구독(410)은 조용히 삭제하고 예외를 던지지 않는다", async () => {
    prismaMock.pushSubscription.findMany.mockResolvedValue([
      { endpoint: "https://push.example/expired", p256dh: "p1", auth: "a1" },
    ]);
    const err = Object.assign(new Error("gone"), { statusCode: 410 });
    sendNotificationMock.mockRejectedValue(err);
    prismaMock.pushSubscription.delete.mockResolvedValue({});

    const { sendSlotPushToUser } = await import("@/lib/push");
    await expect(
      sendSlotPushToUser("u1", {
        facilityName: "라비에벨 올드코스",
        date: "2026-09-06",
        course: "OUT",
        time: "07:26",
        price: null,
        deepLinkUrl: "https://example.com/deep-link",
      })
    ).resolves.not.toThrow();

    expect(prismaMock.pushSubscription.delete).toHaveBeenCalledWith({
      where: { endpoint: "https://push.example/expired" },
    });
  });
});
