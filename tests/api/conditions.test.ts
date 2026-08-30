import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = {
  watchCondition: {
    findMany: vi.fn(),
    create: vi.fn(),
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

describe("POST /api/conditions", () => {
  it("로그인하지 않으면 401", async () => {
    const { POST } = await import("@/app/api/conditions/route");
    const req = new NextRequest("http://localhost/api/conditions", {
      method: "POST",
      body: JSON.stringify({ dates: ["2026-09-06"], timeStart: "06:00", timeEnd: "09:00" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("날짜가 비어있으면 400", async () => {
    const { POST } = await import("@/app/api/conditions/route");
    const req = await authedRequest("http://localhost/api/conditions", {
      method: "POST",
      body: JSON.stringify({ dates: [], timeStart: "06:00", timeEnd: "09:00" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("시작 시간이 종료 시간보다 늦으면 400", async () => {
    const { POST } = await import("@/app/api/conditions/route");
    const req = await authedRequest("http://localhost/api/conditions", {
      method: "POST",
      body: JSON.stringify({ dates: ["2026-09-06"], timeStart: "10:00", timeEnd: "09:00" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("유효한 입력이면 로그인한 User 소유로 생성한다", async () => {
    prismaMock.watchCondition.create.mockResolvedValue({
      id: "c1",
      userId: "u1",
      dates: ["2026-09-06"],
      timeStart: "06:00",
      timeEnd: "09:00",
    });
    const { POST } = await import("@/app/api/conditions/route");
    const req = await authedRequest("http://localhost/api/conditions", {
      method: "POST",
      body: JSON.stringify({ dates: ["2026-09-06"], timeStart: "06:00", timeEnd: "09:00" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(prismaMock.watchCondition.create).toHaveBeenCalledWith({
      data: { userId: "u1", dates: ["2026-09-06"], timeStart: "06:00", timeEnd: "09:00" },
    });
  });
});

describe("DELETE /api/conditions/[id]", () => {
  it("다른 User 소유의 조건은 404로 응답하고 삭제하지 않는다", async () => {
    prismaMock.watchCondition.findUnique.mockResolvedValue({ id: "c1", userId: "someone-else" });
    const { DELETE } = await import("@/app/api/conditions/[id]/route");
    const req = await authedRequest("http://localhost/api/conditions/c1", { method: "DELETE" });
    const res = await DELETE(req, { params: { id: "c1" } });
    expect(res.status).toBe(404);
    expect(prismaMock.watchCondition.delete).not.toHaveBeenCalled();
  });

  it("본인 소유의 조건은 삭제한다", async () => {
    prismaMock.watchCondition.findUnique.mockResolvedValue({ id: "c1", userId: "u1" });
    const { DELETE } = await import("@/app/api/conditions/[id]/route");
    const req = await authedRequest("http://localhost/api/conditions/c1", { method: "DELETE" });
    const res = await DELETE(req, { params: { id: "c1" } });
    expect(res.status).toBe(200);
    expect(prismaMock.watchCondition.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
  });
});
