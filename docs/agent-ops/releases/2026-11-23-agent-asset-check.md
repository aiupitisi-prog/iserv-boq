# Release evidence — Agent asset check (drift guard)

Date: 23 พ.ย. 2569 (2026-11-23)
Commit: `dd9f207f8bbd9fe9c1d29e537eb0d977cab2ba07`
Branch: main
Tests: 307 passed / 18 files (local) · CI run 45178717384 success (1m0s)
Typecheck: EXIT=0 (local + CI)
Build: EXIT=0 (local + CI)
Agent check: PASS agents=6 skills=8 references=8 (local + CI step)
Vercel: success (https://vercel.com/aiupitisi-7393/iserv-boq/CzR1J6ZjJpe5ubJ8aYteg7A7Dtnv)
Prod: `/` 200 · `/rulesets` 200 · `/prices` 200
Git status: clean

## Evidence

| ID | คำสั่ง/แหล่ง | ผล |
|---|---|---|
| EV-201 | `npm run verify:agents` | PASS agents=6 skills=8 references=8 |
| EV-202 | negative test (copy tree + เติม body ฝั่ง `.opencode` ฝ่ายเดียว) | FAIL `body mismatch` ตามคาด |
| EV-203 | `npx vitest run` | 307 passed / 18 files |
| EV-204 | `npx tsc --noEmit` | EXIT=0 |
| EV-205 | `npm run build` | EXIT=0 |
| EV-206 | Actions run 45178717384 (`dd9f207`) | success 1m0s — มี step `Verify agent assets` |
| EV-207 | `gh api .../commits/dd9f207/status` | Vercel success |
| EV-208 | `Invoke-WebRequest` prod 3 เส้นทาง | HTTP 200 ทั้งหมด |
| EV-209 | `git status --short` | ไม่มีไฟล์ค้าง |

## Notes

- Brief G0: `docs/agent-ops/briefs/2026-11-20-agent-asset-check.md` (risk R1 — tooling/docs)
- สคริปต์ตรวจ agent/skill อยู่ที่ `scripts/verify-agent-assets.mjs`; รันใน CI ก่อน `npm ci`
- ระหว่างรอ release มี snapshot bot push 3 commits — rebase แล้วรัน vitest/tsc/build/verify:agents ซ้ำทั้งหมดก่อน push
- ไม่แตะเงิน/เอกสารพิมพ์/ตัวเลขกฎหมาย จึงไม่ต้อง G2/G5
- ยังไม่ทำ: grep hardcode ตัวเลขกฎหมาย, disclaimer presence check, required status check
