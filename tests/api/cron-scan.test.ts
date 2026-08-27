import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const runScanCycle = vi.fn();
vi.mock("@/lib/scanCycle", () => ({ runScanCycle }));

beforeAll(() => {
  process.env.CRON_SECRET = "test-cron-secret";
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/cron/scan", () => {
  it("올바른 비밀 토큰 없이는 401이고 스캔을 실행하지 않는다", async () => {
    const { POST } = await import("@/app/api/cron/scan/route");
    const req = new NextRequest("http://localhost/api/cron/scan", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(runScanCycle).not.toHaveBeenCalled();
  });

  it("올바른 토큰이면 스캔 사이클을 실행하고 요약을 반환한다", async () => {
    runScanCycle.mockResolvedValue({
      credentialsScanned: 1,
      credentialsSkippedNoConditions: 0,
      loginFailures: 0,
      transientFailures: 0,
      notificationsSent: 1,
    });
    const { POST } = await import("@/app/api/cron/scan/route");
    const req = new NextRequest("http://localhost/api/cron/scan", {
      method: "POST",
      headers: { authorization: "Bearer test-cron-secret" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(runScanCycle).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.notificationsSent).toBe(1);
  });
});
