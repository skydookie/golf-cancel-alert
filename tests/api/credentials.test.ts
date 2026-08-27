import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = {
  facilityCredential: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

beforeAll(() => {
  process.env.SESSION_SECRET = "test-session-secret";
  process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
});

beforeEach(() => {
  vi.clearAllMocks();
});

async function authedRequest(url: string, init: { method: string; body?: string } = { method: "GET" }) {
  const { signSessionToken } = await import("@/lib/auth");
  const token = signSessionToken("u1");
  return new NextRequest(url, {
    method: init.method,
    body: init.body,
    headers: { cookie: `session=${token}` },
  });
}

describe("POST /api/credentials", () => {
  it("등록 응답에는 암호화된 값도, 평문도 절대 포함되지 않는다", async () => {
    prismaMock.facilityCredential.findUnique.mockResolvedValue(null);
    prismaMock.facilityCredential.create.mockResolvedValue({
      id: "c1",
      facilityId: "laviebelle-old",
      status: "ACTIVE",
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { POST } = await import("@/app/api/credentials/route");
    const req = await authedRequest("http://localhost/api/credentials", {
      method: "POST",
      body: JSON.stringify({ facilityId: "laviebelle-old", loginId: "01012345678", password: "secret" }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(JSON.stringify(body)).not.toContain("01012345678");
    // 저장 시 실제로 암호화 함수를 거쳤는지(평문이 그대로 DB로 가지 않는지) 확인
    const createArg = prismaMock.facilityCredential.create.mock.calls[0][0];
    expect(createArg.data.encryptedLoginId).not.toBe("01012345678");
    expect(createArg.data.encryptedPassword).not.toBe("secret");
  });

  it("지원하지 않는 골프장이면 400", async () => {
    const { POST } = await import("@/app/api/credentials/route");
    const req = await authedRequest("http://localhost/api/credentials", {
      method: "POST",
      body: JSON.stringify({ facilityId: "some-random-course", loginId: "a", password: "b" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("이미 등록된 (User, Facility)면 409", async () => {
    prismaMock.facilityCredential.findUnique.mockResolvedValue({ id: "existing" });
    const { POST } = await import("@/app/api/credentials/route");
    const req = await authedRequest("http://localhost/api/credentials", {
      method: "POST",
      body: JSON.stringify({ facilityId: "laviebelle-old", loginId: "a", password: "b" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
  });
});

describe("PATCH /api/credentials/[id]", () => {
  it("다른 User 소유면 404", async () => {
    prismaMock.facilityCredential.findUnique.mockResolvedValue({ id: "c1", userId: "someone-else" });
    const { PATCH } = await import("@/app/api/credentials/[id]/route");
    const req = await authedRequest("http://localhost/api/credentials/c1", {
      method: "PATCH",
      body: JSON.stringify({ password: "new-pass" }),
    });
    const res = await PATCH(req, { params: { id: "c1" } });
    expect(res.status).toBe(404);
  });

  it("갱신하면 상태가 ACTIVE로 재개되고 lastError가 지워진다", async () => {
    prismaMock.facilityCredential.findUnique.mockResolvedValue({
      id: "c1",
      userId: "u1",
      status: "PAUSED_LOGIN_FAILED",
    });
    prismaMock.facilityCredential.update.mockResolvedValue({
      id: "c1",
      facilityId: "laviebelle-old",
      status: "ACTIVE",
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { PATCH } = await import("@/app/api/credentials/[id]/route");
    const req = await authedRequest("http://localhost/api/credentials/c1", {
      method: "PATCH",
      body: JSON.stringify({ password: "new-pass" }),
    });
    const res = await PATCH(req, { params: { id: "c1" } });
    expect(res.status).toBe(200);
    const updateArg = prismaMock.facilityCredential.update.mock.calls[0][0];
    expect(updateArg.data.status).toBe("ACTIVE");
    expect(updateArg.data.lastError).toBeNull();
  });
});

describe("DELETE /api/credentials/[id]", () => {
  it("본인 소유면 삭제한다", async () => {
    prismaMock.facilityCredential.findUnique.mockResolvedValue({ id: "c1", userId: "u1" });
    const { DELETE } = await import("@/app/api/credentials/[id]/route");
    const req = await authedRequest("http://localhost/api/credentials/c1", { method: "DELETE" });
    const res = await DELETE(req, { params: { id: "c1" } });
    expect(res.status).toBe(200);
    expect(prismaMock.facilityCredential.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
  });
});
