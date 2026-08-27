import { describe, expect, it, beforeAll } from "vitest";
import { hashPassword, verifyPassword, encryptSecret, decryptSecret } from "@/lib/crypto";

beforeAll(() => {
  // 32바이트 키를 base64로 인코딩한 테스트용 값
  process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("App User 비밀번호 — 단방향 해시", () => {
  it("해시는 원문을 포함하지 않고, 원문으로 되돌릴 수 없다", async () => {
    const plain = "hunter2-super-secret";
    const hash = await hashPassword(plain);
    expect(hash).not.toContain(plain);
    // bcrypt 해시에는 복호화 API 자체가 없다 — verifyPassword로 검증만 가능함을 확인
    expect(await verifyPassword(plain, hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("같은 비밀번호도 매번 다른 해시를 만든다(salt)", async () => {
    const h1 = await hashPassword("same-password");
    const h2 = await hashPassword("same-password");
    expect(h1).not.toEqual(h2);
  });
});

describe("Facility Credential — 가역 암호화", () => {
  it("암호화한 값을 다시 복호화하면 원문과 정확히 같다", () => {
    const plain = "member-login-id-or-password-123";
    const encrypted = encryptSecret(plain);
    expect(encrypted).not.toContain(plain);
    expect(decryptSecret(encrypted)).toBe(plain);
  });

  it("같은 원문도 매번 다른 암호문을 만든다(랜덤 IV)", () => {
    const e1 = encryptSecret("same-secret");
    const e2 = encryptSecret("same-secret");
    expect(e1).not.toEqual(e2);
    expect(decryptSecret(e1)).toBe("same-secret");
    expect(decryptSecret(e2)).toBe("same-secret");
  });

  it("변조된 암호문은 복호화에 실패한다(무결성 보장)", () => {
    const encrypted = encryptSecret("tamper-check");
    const [iv, tag, ciphertext] = encrypted.split(":");
    const tampered = [iv, tag, Buffer.from("tampered-bytes").toString("base64")].join(":");
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
