import { describe, expect, it, beforeAll } from "vitest";
import { signSessionToken, verifySessionToken } from "@/lib/auth";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-session-secret";
});

describe("세션 토큰", () => {
  it("서명한 토큰을 검증하면 원래 userId를 돌려준다", async () => {
    const token = await signSessionToken("user-123");
    const payload = await verifySessionToken(token);
    expect(payload?.userId).toBe("user-123");
  });

  it("변조되거나 잘못된 토큰은 null을 반환한다(예외를 던지지 않음)", async () => {
    expect(await verifySessionToken("not-a-real-token")).toBeNull();
    const token = await signSessionToken("user-123");
    expect(await verifySessionToken(token + "tampered")).toBeNull();
  });
});
