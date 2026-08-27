import type { SiteAdapter } from "@/lib/adapters/types";
import { laviebelleOldCourseAdapter } from "@/lib/adapters/laviebelle";

// facilityId -> 어댑터. src/lib/facilities.ts의 FACILITY_IDS와 1:1로 대응해야 한다.
// 새 골프장을 추가할 때는 이 맵에 항목만 추가하면 된다 — 핵심 엔진은 이 함수를 통해서만
// 어댑터를 얻으므로 특정 골프장 구현을 직접 알지 못한다.
const ADAPTERS: Record<string, SiteAdapter> = {
  "laviebelle-old": laviebelleOldCourseAdapter,
};

export function getAdapter(facilityId: string): SiteAdapter {
  const adapter = ADAPTERS[facilityId];
  if (!adapter) {
    throw new Error(`등록되지 않은 골프장 어댑터: ${facilityId}`);
  }
  return adapter;
}
