import { describe, expect, it, beforeAll } from "vitest";
import { isValidInviteCode } from "@/lib/inviteCode";

beforeAll(() => {
  process.env.INVITE_CODE = "friends-only-2026";
});

describe("초대코드 검증", () => {
  it("정확한 코드는 통과한다", () => {
    expect(isValidInviteCode("friends-only-2026")).toBe(true);
  });

  it("틀린 코드나 빈 값은 거부한다", () => {
    expect(isValidInviteCode("wrong-code")).toBe(false);
    expect(isValidInviteCode("")).toBe(false);
    expect(isValidInviteCode(undefined)).toBe(false);
    expect(isValidInviteCode(null)).toBe(false);
  });
});
