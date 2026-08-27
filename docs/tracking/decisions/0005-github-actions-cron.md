# 0005 — 플랫폼 자체 Cron이 아니라 GitHub Actions 스케줄러

**맥락**: 몇 분마다 감시 사이클(`/api/cron/scan`)을 실행해줄 무료 스케줄러가 필요했다.
배포 플랫폼으로 검토한 Vercel의 자체 Cron Jobs 기능을 우선 고려했다.

**결정**: GitHub Actions의 scheduled workflow(`.github/workflows/cron.yml`, 5분 간격)가
배포된 앱의 `/api/cron/scan`을 `Authorization: Bearer` 토큰으로 호출하는 방식을 쓴다.

**대안과 기각 사유**: Vercel Hobby(무료) 플랜의 Cron Jobs는 하루 1회로 제한되어 있어 몇 분
간격 감시라는 요구 자체를 만족할 수 없어 기각.

**결과**: 스케줄링이 배포 플랫폼과 분리되어, 저장소의 GitHub Secrets(`APP_BASE_URL`,
`CRON_SECRET`)에 별도로 설정값을 등록해야 한다. GitHub Actions의 스케줄은 부하에 따라
정확히 5분마다 실행되지 않을 수 있다(수 분 지연 가능) — 개인 규모 사용에는 지장 없는
수준으로 판단했다.
