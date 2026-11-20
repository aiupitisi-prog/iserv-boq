# Release evidence — CI baseline (U6)

Date: 20 พ.ย. 2569 (2026-11-20)
Commit: `84789040d88c1a603bb4325cb239bc0e52a717bb` (workflow `ci` + brief)
Branch: main
Tests: 307 passed / 18 files (local) · CI run 44723201815 success
Typecheck: EXIT=0 (local + CI)
Build: EXIT=0 (local + CI)
Vercel: success (https://vercel.com/aiupitisi-7393/iserv-boq/5USyXzUpJftSs3eUrNLcBF7oLePx)
Prod: `/` 200 · `/rulesets` 200 · `/prices` 200
Git status: clean

## Evidence

| ID | คำสั่ง/แหล่ง | ผล |
|---|---|---|
| EV-101 | `npx vitest run` (local) | 307 passed / 18 files |
| EV-102 | `npx tsc --noEmit` (local) | EXIT=0 |
| EV-103 | `npm run build` (local) | EXIT=0 |
| EV-104 | Actions run 44723006875 (`be86150`) | success 54s — รอบแรกของ workflow |
| EV-105 | Actions run 44723201815 (`8478904`) | success 44s — หลังอัป action v5 |
| EV-106 | `gh api .../commits/8478904/status` | Vercel success |
| EV-107 | `Invoke-WebRequest` prod 3 เส้นทาง | HTTP 200 ทั้งหมด |
| EV-108 | `git status --short` | ไม่มีไฟล์ค้าง |

## Notes

- `ci` รันบน push/PR ไป `main` และ `workflow_dispatch`: `npm ci` → `npx vitest run` → `npx tsc --noEmit` → `npm run build`
- ใช้ `actions/checkout@v5` + `actions/setup-node@v5` และ Node 20 สำหรับโปรเจกต์
- **ยังไม่ตั้ง required status check / branch protection** (ต้องใช้สิทธิ์ admin) และ Vercel ไม่รอ CI — CI จับ regression หลัง push ไม่ได้บล็อก merge
- งานนี้ risk R1 ไม่แตะเงิน/เอกสารพิมพ์ จึงไม่ต้อง G2/G5; brief อยู่ที่ `docs/agent-ops/briefs/2026-11-20-ci-baseline.md`
- Vercel/prod ตรวจบน `8478904`; commit เอกสารหลักฐานนี้ตามมาหลังจากนั้นและไม่เปลี่ยน app bundle
