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

  it("loginless 어댑터는 login()·복호화를 건너뛰고 빈 세션으로 스캔한다", async () => {
    // loginless 골프장은 자격증명이 빈 값으로 저장돼 있다.
    prismaMock.facilityCredential.findMany.mockResolvedValue([
      baseCredential({ facilityId: "lakewood", encryptedLoginId: "enc:", encryptedPassword: "enc:" }),
    ]);
    prismaMock.watchCondition.findMany.mockResolvedValue([condition()]);
    prismaMock.slotObservationState.findMany.mockResolvedValue([]);

    const adapter = {
      loginless: true,
      login: vi.fn().mockRejectedValue(new Error("login()을 호출하면 안 됨")),
      scanBookableDates: vi.fn().mockResolvedValue(["2026-09-06"]),
      scanDaySlots: vi
        .fn()
        .mockResolvedValue([{ facilityId: "lakewood", date: "2026-09-06", course: "물길", time: "07:26", price: null }]),
      buildDeepLink: vi.fn().mockReturnValue("https://lakewood.co.kr/reservation/golf"),
    };
    getAdapter.mockReturnValue(adapter);

    const { runScanCycle } = await import("@/lib/scanCycle");
    const summary = await runScanCycle();

    expect(adapter.login).not.toHaveBeenCalled();
    expect(adapter.scanBookableDates).toHaveBeenCalledWith({ cookie: "" });
    expect(summary.notificationsSent).toBe(1);
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

  it("로그인 이후 스캔 도중 한 계정이 실패해도, 그 계정만 건너뛰고 나머지 계정은 계속 스캔한다", async () => {
    prismaMock.facilityCredential.findMany.mockResolvedValue([
      baseCredential({ id: "cred1", userId: "u1", encryptedLoginId: "enc:id-1", encryptedPassword: "enc:pw-1" }),
      baseCredential({ id: "cred2", userId: "u2", encryptedLoginId: "enc:id-2", encryptedPassword: "enc:pw-2" }),
    ]);
    prismaMock.watchCondition.findMany.mockResolvedValue([condition()]);
    prismaMock.slotObservationState.findMany.mockResolvedValue([]);

    const { TransientSiteError } = await import("@/lib/adapters/types");
    let loginCallCount = 0;
    const adapter = {
      login: vi.fn().mockImplementation(() => {
        loginCallCount += 1;
        return Promise.resolve({ cookie: `session-${loginCallCount}` });
      }),
      // 첫 번째 계정(cred1)의 스캔 도중에만 실패 — 로그인 자체는 성공했지만 그 뒤 단계에서 터지는 경우
      scanBookableDates: vi
        .fn()
        .mockImplementationOnce(() => Promise.reject(new TransientSiteError()))
        .mockImplementationOnce(() => Promise.resolve(["2026-09-06"])),
      scanDaySlots: vi
        .fn()
        .mockResolvedValue([{ facilityId: "laviebelle-old", date: "2026-09-06", course: "OUT", time: "07:26", price: 250000 }]),
      buildDeepLink: vi.fn().mockReturnValue("https://example.com/deep-link"),
    };
    getAdapter.mockReturnValue(adapter);

    const { runScanCycle } = await import("@/lib/scanCycle");
    const summary = await runScanCycle();

    // cred1은 실패로 세지고, cred2는 정상적으로 끝까지 처리되어 알림까지 나가야 한다.
    expect(summary.transientFailures).toBe(1);
    expect(summary.notificationsSent).toBe(1);
    expect(adapter.login).toHaveBeenCalledTimes(2);
    expect(sendSlotPushToUser).toHaveBeenCalledTimes(1);
    expect(sendSlotPushToUser).toHaveBeenCalledWith("u2", expect.anything());
  });

  it("예상 못한 예외(버그 등)가 나도 전체 사이클이 죽지 않고, 그 계정만 건너뛴다", async () => {
    prismaMock.facilityCredential.findMany.mockResolvedValue([
      baseCredential({ id: "cred1", userId: "u1", encryptedLoginId: "enc:id-1", encryptedPassword: "enc:pw-1" }),
      baseCredential({ id: "cred2", userId: "u2", encryptedLoginId: "enc:id-2", encryptedPassword: "enc:pw-2" }),
    ]);
    prismaMock.watchCondition.findMany.mockResolvedValue([condition()]);
    prismaMock.slotObservationState.findMany.mockResolvedValue([]);

    const adapter = {
      login: vi
        .fn()
        .mockImplementationOnce(() => {
          throw new Error("예상치 못한 버그");
        })
        .mockImplementationOnce(() => Promise.resolve({ cookie: "session-2" })),
      scanBookableDates: vi.fn().mockResolvedValue([]),
      scanDaySlots: vi.fn().mockResolvedValue([]),
      buildDeepLink: vi.fn(),
    };
    getAdapter.mockReturnValue(adapter);

    const { runScanCycle } = await import("@/lib/scanCycle");
    const summary = await runScanCycle();

    expect(summary.unexpectedFailures).toBe(1);
    expect(adapter.login).toHaveBeenCalledTimes(2); // cred2도 시도됨 — 전체가 죽지 않음
  });
});
