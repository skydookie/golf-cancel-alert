import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = {
  watchCondition: { findMany: vi.fn() },
  slotObservationState: { findMany: vi.fn() },
  notificationLog: { findMany: vi.fn() },
};
vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

const getAdapter = vi.fn((_facilityId: string) => ({
  buildDeepLink: (date: string) => `https://example.com/${date}`,
}));
vi.mock("@/lib/adapters/registry", () => ({ getAdapter: (facilityId: string) => getAdapter(facilityId) }));

beforeAll(() => {
  process.env.SESSION_SECRET = "test-session-secret";
});

beforeEach(() => {
  vi.clearAllMocks();
});

async function authedRequest() {
  const { signSessionToken } = await import("@/lib/auth");
  const token = await signSessionToken("u1");
  return new NextRequest("http://localhost/api/schedule", { headers: { cookie: `session=${token}` } });
}

describe("GET /api/schedule", () => {
  it("조건에 매칭되는 슬롯만 반환한다", async () => {
    prismaMock.watchCondition.findMany.mockResolvedValue([
      { id: "c1", dates: ["2026-09-06"], timeStart: "06:00", timeEnd: "09:00" },
    ]);
    prismaMock.slotObservationState.findMany.mockResolvedValue([
      { facilityId: "laviebelle-old", date: "2026-09-06", course: "OUT", time: "07:26", lastPrice: 250000 },
      { facilityId: "laviebelle-old", date: "2026-09-13", course: "OUT", time: "07:26", lastPrice: 250000 }, // 조건에 없는 날짜
    ]);
    prismaMock.notificationLog.findMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/schedule/route");
    const res = await GET(await authedRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.matchedSlots).toHaveLength(1);
    expect(body.matchedSlots[0].date).toBe("2026-09-06");
    expect(body.matchedSlots[0].deepLinkUrl).toBe("https://example.com/2026-09-06");
  });

  it("로그인하지 않으면 401", async () => {
    const { GET } = await import("@/app/api/schedule/route");
    const res = await GET(new NextRequest("http://localhost/api/schedule"));
    expect(res.status).toBe(401);
  });
});
