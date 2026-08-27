import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = {
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
};

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

beforeAll(() => {
  process.env.SESSION_SECRET = "test-session-secret";
  process.env.INVITE_CODE = "friends-only-2026";
});

beforeEach(() => {
  vi.clearAllMocks();
});

function postJson(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/signup", () => {
  it("초대코드가 틀리면 가입을 거부한다 (403)", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");
    const res = await POST(
      postJson("http://localhost/api/auth/signup", {
        email: "a@example.com",
        password: "password123",
        inviteCode: "wrong-code",
      })
    );
    expect(res.status).toBe(403);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("초대코드가 없으면 가입을 거부한다 (400 — 스키마 검증 실패)", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");
    const res = await POST(
      postJson("http://localhost/api/auth/signup", {
        email: "a@example.com",
        password: "password123",
      })
    );
    expect(res.status).toBe(400);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("이미 가입된 이메일이면 거부한다 (409)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", email: "a@example.com" });
    const { POST } = await import("@/app/api/auth/signup/route");
    const res = await POST(
      postJson("http://localhost/api/auth/signup", {
        email: "a@example.com",
        password: "password123",
        inviteCode: "friends-only-2026",
      })
    );
    expect(res.status).toBe(409);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("유효한 초대코드 + 새 이메일이면 가입에 성공하고 세션 쿠키를 내려준다", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: "u1", email: "a@example.com" });
    const { POST } = await import("@/app/api/auth/signup/route");
    const res = await POST(
      postJson("http://localhost/api/auth/signup", {
        email: "a@example.com",
        password: "password123",
        inviteCode: "friends-only-2026",
      })
    );
    expect(res.status).toBe(201);
    expect(res.cookies.get("session")).toBeTruthy();
    // 저장에 넘어간 값에 원문 비밀번호가 그대로 들어가지 않았는지(해시됐는지) 확인
    const createArg = prismaMock.user.create.mock.calls[0][0];
    expect(createArg.data.passwordHash).not.toBe("password123");
  });
});

describe("POST /api/auth/login", () => {
  it("존재하지 않는 이메일과 틀린 비밀번호를 동일하게 401로 처리한다(정보 노출 방지)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(
      postJson("http://localhost/api/auth/login", {
        email: "nobody@example.com",
        password: "whatever123",
      })
    );
    expect(res.status).toBe(401);
  });

  it("올바른 이메일+비밀번호면 세션 쿠키를 내려준다", async () => {
    const { hashPassword } = await import("@/lib/crypto");
    const passwordHash = await hashPassword("correct-password");
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", email: "a@example.com", passwordHash });
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(
      postJson("http://localhost/api/auth/login", {
        email: "a@example.com",
        password: "correct-password",
      })
    );
    expect(res.status).toBe(200);
    expect(res.cookies.get("session")).toBeTruthy();
  });
});

describe("DELETE /api/auth/delete-account", () => {
  it("로그인하지 않은 요청은 401", async () => {
    const { DELETE } = await import("@/app/api/auth/delete-account/route");
    const req = new NextRequest("http://localhost/api/auth/delete-account", { method: "DELETE" });
    const res = await DELETE(req);
    expect(res.status).toBe(401);
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
  });

  it("로그인한 요청은 User 레코드를 삭제한다(연쇄삭제는 스키마의 onDelete: Cascade가 담당)", async () => {
    const { signSessionToken } = await import("@/lib/auth");
    const token = signSessionToken("u1");
    prismaMock.user.delete.mockResolvedValue({ id: "u1" });
    const { DELETE } = await import("@/app/api/auth/delete-account/route");
    const req = new NextRequest("http://localhost/api/auth/delete-account", {
      method: "DELETE",
      headers: { cookie: `session=${token}` },
    });
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    expect(prismaMock.user.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
  });
});
