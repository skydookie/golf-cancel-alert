import { describe, expect, it, vi, beforeEach } from "vitest";

const prismaMock = {
  facilityCredential: { findMany: vi.fn(), update: vi.fn() },
  watchCondition: { findMany: vi.fn() },
  slotObservationState: { findMany: vi.fn(), upsert: vi.fn() },
  notificationLog: { create: vi.fn() },
};
vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

vi.mock("@/lib/crypto", () => ({
  decryptSecret: (v: string) => v.replace(/^enc:/, ""),
}));

const sendSlotPushToUser = vi.fn();
const sendLoginFailureNotice = vi.fn();
vi.mock("@/lib/push", () => ({ sendSlotPushToUser, sendLoginFailureNotice }));

const getAdapter = vi.fn();
vi.mock("@/lib/adapters/registry", () => ({ getAdapter }));

function baseCredential(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "cred1",
    userId: "u1",
    facilityId: "laviebelle-old",
    encryptedLoginId: "enc:member-id",
    encryptedPassword: "enc:member-pw",
    status: "ACTIVE",
    ...over,
  };
}

function condition(over: Partial<Record<string, unknown>> = {}) {
  return { id: "c1", userId: "u1", dates: ["2026-09-06"], timeStart: "06:00", timeEnd: "09:00", ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runScanCycle", () => {
  it("관심조건이 없는 계정은 로그인 자체를 시도하지 않고 건너뛴다", async () => {
    prismaMock.facilityCredential.findMany.mockResolvedValue([baseCredential()]);
    prismaMock.watchCondition.findMany.mockResolvedValue([]);
    const adapter = { login: vi.fn() };
    getAdapter.mockReturnValue(adapter);

    const { runScanCycle } = await import("@/lib/scanCycle");
    const summary = await runScanCycle();

    expect(adapter.login).not.toHaveBeenCalled();
    expect(summary.credentialsSkippedNoConditions).toBe(1);
  });

  it("새로 신청 가능해진 슬롯이 관심조건에 맞으면 정확히 1건 알림을 보낸다", async () => {
    prismaMock.facilityCredential.findMany.mockResolvedValue([baseCredential()]);
    prismaMock.watchCondition.findMany.mockResolvedValue([condition()]);
    prismaMock.slotObservationState.findMany.mockResolvedValue([]); // 이전 관측 없음

    const adapter = {
      login: vi.fn().mockResolvedValue({ cookie: "session-cookie" }),
      scanBookableDates: vi.fn().mockResolvedValue(["2026-09-06"]),
      scanDaySlots: vi
        .fn()
        .mockResolvedValue([{ facilityId: "laviebelle-old", date: "2026-09-06", course: "OUT", time: "07:26", price: 250000 }]),
      buildDeepLink: vi.fn().mockReturnValue("https://example.com/deep-link"),
    };
    getAdapter.mockReturnValue(adapter);

    const { runScanCycle } = await import("@/lib/scanCycle");
    const summary = await runScanCycle();

    expect(adapter.login).toHaveBeenCalledWith("member-id", "member-pw");
    expect(summary.notificationsSent).toBe(1);
    expect(sendSlotPushToUser).toHaveBeenCalledTimes(1);
    expect(sendSlotPushToUser).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ date: "2026-09-06", course: "OUT", time: "07:26" })
    );
    expect(prismaMock.notificationLog.create).toHaveBeenCalledTimes(1);
  });

  it("이미 신청 가능한 상태가 유지 중이면(전 상태와 동일) 재알림하지 않는다", async () => {
    prismaMock.facilityCredential.findMany.mockResolvedValue([baseCredential()]);
    prismaMock.watchCondition.findMany.mockResolvedValue([condition()]);
    prismaMock.slotObservationState.findMany.mockResolvedValue([
      { date: "2026-09-06", course: "OUT", time: "07:26", isBookable: true },
    ]);

    const adapter = {
      login: vi.fn().mockResolvedValue({ cookie: "session-cookie" }),
      scanBookableDates: vi.fn().mockResolvedValue(["2026-09-06"]),
      scanDaySlots: vi
        .fn()
        .mockResolvedValue([{ facilityId: "laviebelle-old", date: "2026-09-06", course: "OUT", time: "07:26", price: 250000 }]),
      buildDeepLink: vi.fn().mockReturnValue("https://example.com/deep-link"),
    };
    getAdapter.mockReturnValue(adapter);

    const { runScanCycle } = await import("@/lib/scanCycle");
    const summary = await runScanCycle();

    expect(summary.notificationsSent).toBe(0);
    expect(sendSlotPushToUser).not.toHaveBeenCalled();
  });

  it("조건에 맞지 않는 슬롯(다른 날짜)은 알림을 보내지 않는다", async () => {
    prismaMock.facilityCredential.findMany.mockResolvedValue([baseCredential()]);
    prismaMock.watchCondition.findMany.mockResolvedValue([condition({ dates: ["2026-09-13"] })]);
    prismaMock.slotObservationState.findMany.mockResolvedValue([]);

    const adapter = {
      login: vi.fn().mockResolvedValue({ cookie: "session-cookie" }),
      scanBookableDates: vi.fn().mockResolvedValue(["2026-09-06"]),
      scanDaySlots: vi
        .fn()
        .mockResolvedValue([{ facilityId: "laviebelle-old", date: "2026-09-06", course: "OUT", time: "07:26", price: 250000 }]),
      buildDeepLink: vi.fn().mockReturnValue("https://example.com/deep-link"),
    };
    getAdapter.mockReturnValue(adapter);

    const { runScanCycle } = await import("@/lib/scanCycle");
    const summary = await runScanCycle();

    expect(summary.notificationsSent).toBe(0);
  });

  it("로그인 실패 시 즉시 알리고 해당 계정을 PAUSED_LOGIN_FAILED로 바꾼다(재시도하지 않음)", async () => {
    prismaMock.facilityCredential.findMany.mockResolvedValue([baseCredential()]);
    prismaMock.watchCondition.findMany.mockResolvedValue([condition()]);

    const { LoginFailedError } = await import("@/lib/adapters/types");
    const adapter = {
      login: vi.fn().mockRejectedValue(new LoginFailedError()),
      scanBookableDates: vi.fn(),
      scanDaySlots: vi.fn(),
      buildDeepLink: vi.fn(),
    };
    getAdapter.mockReturnValue(adapter);

    const { runScanCycle } = await import("@/lib/scanCycle");
    const summary = await runScanCycle();

    expect(adapter.login).toHaveBeenCalledTimes(1); // 무한 재시도 없음 — 이 사이클에 1번만 시도
    expect(summary.loginFailures).toBe(1);
    expect(prismaMock.facilityCredential.update).toHaveBeenCalledWith({
      where: { id: "cred1" },
      data: { status: "PAUSED_LOGIN_FAILED", lastError: expect.any(String) },
    });
    expect(sendLoginFailureNotice).toHaveBeenCalledWith("u1", expect.any(String));
    expect(adapter.scanBookableDates).not.toHaveBeenCalled();
  });

  it("일시적 오류(TransientSiteError)는 계정을 잠그지 않는다", async () => {
    prismaMock.facilityCredential.findMany.mockResolvedValue([baseCredential()]);
    prismaMock.watchCondition.findMany.mockResolvedValue([condition()]);

    const { TransientSiteError } = await import("@/lib/adapters/types");
    const adapter = { login: vi.fn().mockRejectedValue(new TransientSiteError()) };
    getAdapter.mockReturnValue(adapter);

    const { runScanCycle } = await import("@/lib/scanCycle");
    const summary = await runScanCycle();

    expect(summary.transientFailures).toBe(1);
    expect(prismaMock.facilityCredential.update).not.toHaveBeenCalled();
    expect(sendLoginFailureNotice).not.toHaveBeenCalled();
  });

  it("동시에 여러 슬롯이 새로 열리면 각각 개별 알림을 보낸다", async () => {
    prismaMock.facilityCredential.findMany.mockResolvedValue([baseCredential()]);
    prismaMock.watchCondition.findMany.mockResolvedValue([condition()]);
    prismaMock.slotObservationState.findMany.mockResolvedValue([]);

    const adapter = {
      login: vi.fn().mockResolvedValue({ cookie: "session-cookie" }),
      scanBookableDates: vi.fn().mockResolvedValue(["2026-09-06"]),
      scanDaySlots: vi.fn().mockResolvedValue([
        { facilityId: "laviebelle-old", date: "2026-09-06", course: "OUT", time: "07:26", price: 250000 },
        { facilityId: "laviebelle-old", date: "2026-09-06", course: "IN", time: "07:40", price: 250000 },
      ]),
      buildDeepLink: vi.fn().mockReturnValue("https://example.com/deep-link"),
    };
    getAdapter.mockReturnValue(adapter);

    const { runScanCycle } = await import("@/lib/scanCycle");
    const summary = await runScanCycle();

    expect(summary.notificationsSent).toBe(2);
    expect(sendSlotPushToUser).toHaveBeenCalledTimes(2);
  });

  it("회원 등급 차이를 반영해 User마다 개별적으로 로그인·스캔한다(대표 계정 공용 아님)", async () => {
    prismaMock.facilityCredential.findMany.mockResolvedValue([
      baseCredential({ id: "cred1", userId: "u1", encryptedLoginId: "enc:id-1", encryptedPassword: "enc:pw-1" }),
      baseCredential({ id: "cred2", userId: "u2", encryptedLoginId: "enc:id-2", encryptedPassword: "enc:pw-2" }),
    ]);
    prismaMock.watchCondition.findMany.mockResolvedValue([condition()]);
    prismaMock.slotObservationState.findMany.mockResolvedValue([]);

    const adapter = {
      login: vi.fn().mockResolvedValue({ cookie: "session-cookie" }),
      scanBookableDates: vi.fn().mockResolvedValue([]),
      scanDaySlots: vi.fn().mockResolvedValue([]),
      buildDeepLink: vi.fn(),
    };
    getAdapter.mockReturnValue(adapter);

    const { runScanCycle } = await import("@/lib/scanCycle");
    await runScanCycle();

    expect(adapter.login).toHaveBeenCalledTimes(2);
    expect(adapter.login).toHaveBeenNthCalledWith(1, "id-1", "pw-1");
    expect(adapter.login).toHaveBeenNthCalledWith(2, "id-2", "pw-2");
  });
});
