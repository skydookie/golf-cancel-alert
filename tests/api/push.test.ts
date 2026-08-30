import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = {
  pushSubscription: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(),
  },
};
vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

beforeAll(() => {
  process.env.SESSION_SECRET = "test-session-secret";
});

beforeEach(() => {
  vi.clearAllMocks();
});

async function authedRequest(url: string, init: { method: string; body?: string } = { method: "GET" }) {
  const { signSessionToken } = await import("@/lib/auth");
  const token = await signSessionToken("u1");
  return new NextRequest(url, {
    method: init.method,
    body: init.body,
    headers: { cookie: `session=${token}` },
  });
}

describe("POST /api/push/subscribe", () => {
  it("유효한 구독 정보를 upsert한다", async () => {
    prismaMock.pushSubscription.upsert.mockResolvedValue({});
    const { POST } = await import("@/app/api/push/subscribe/route");
    const req = await authedRequest("http://localhost/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify({
        endpoint: "https://push.example/x",
        keys: { p256dh: "p1", auth: "a1" },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(prismaMock.pushSubscription.upsert).toHaveBeenCalled();
  });

  it("로그인하지 않으면 401", async () => {
    const { POST } = await import("@/app/api/push/subscribe/route");
    const req = new NextRequest("http://localhost/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify({ endpoint: "https://push.example/x", keys: { p256dh: "p", auth: "a" } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
