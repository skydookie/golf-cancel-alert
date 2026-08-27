import { NextRequest, NextResponse } from "next/server";
import { runScanCycle } from "@/lib/scanCycle";
import { jsonError } from "@/lib/api-helpers";

// 외부 스케줄러(GitHub Actions cron 등)가 이 엔드포인트를 몇 분마다 호출한다.
// CRON_SECRET을 Authorization: Bearer 헤더로 요구해, 아무나 감시 사이클을 강제로 돌리지 못하게 한다.
export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return jsonError("CRON_SECRET 환경변수가 설정되지 않았습니다.", 500);
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${expected}`) {
    return jsonError("인증되지 않은 요청입니다.", 401);
  }

  const summary = await runScanCycle();
  return NextResponse.json(summary);
}
