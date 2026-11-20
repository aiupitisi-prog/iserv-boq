# Release evidence — agent-team-v1

Date: 20 พ.ย. 2569 (2026-11-20)
Commit: `d31df90b5f24187dbd8aaf7488404589ec3c2fd7` (ไฟล์ agent/skill)
Deployed HEAD: `fb0647b217fc29c2429f076f77fb353db3f87ef5` (รวม commit งานนี้)
Branch: main
Tests: 307 passed / 18 files
Typecheck: EXIT=0
Build: EXIT=0
Vercel: success (https://vercel.com/aiupitisi-7393/iserv-boq/ELA3NaLtS9d2tJJWoZ2kQvz145zM)
Prod: https://iserv-boq.vercel.app/ → 200; https://iserv-boq.vercel.app/rulesets → 200
Git status: clean

## Evidence

| ID | คำสั่ง/แหล่ง | ผล |
|---|---|---|
| EV-001 | `node temp/verify-agent-assets.mjs` | PASS agents=6 skills=8, BODY_OK 6/6 |
| EV-002 | `npx vitest run` | 307 passed / 18 files |
| EV-003 | `npx tsc --noEmit` | EXIT=0 |
| EV-004 | `npm run build` | EXIT=0 |
| EV-005 | `gh api repos/aiupitisi-prog/iserv-boq/commits/fb0647b.../status` | Vercel success |
| EV-006 | `Invoke-WebRequest` prod `/` และ `/rulesets` | HTTP 200 ทั้งคู่ |
| EV-007 | `git rebase origin/main` (รับ snapshot bot commit) | สำเร็จ แล้วรัน EV-002/003/004 ซ้ำ |
| EV-008 | `git status --short` | ไม่มีไฟล์ค้าง |

## Notes

- งานนี้เป็น **การสร้างไฟล์ทีมเอเจนต์** ไม่ใช่ผลรัน pilot — pilot W1–W6 ยังไม่เริ่ม (U7 คงสถานะเดิม)
- ไม่มี PDF/สแกน/secret/ข้อมูลลูกค้าใน commit; `temp/` ถูก gitignore
- Vercel ของ commit `d31df90` ก็ success เช่นกัน (https://vercel.com/aiupitisi-7393/iserv-boq/FvANpFtfbgPsANE5RjXdPWddAeUK) แต่หลักฐานหลักอ้าง deployed HEAD `fb0647b`
- Reviewer read-only ยังไม่ได้ตรวจงานรอบนี้ เพราะงานเป็น ops/docs ของทีมเอง (R1) ไม่แตะเงิน/เอกสารพิมพ์; งาน R2–R4 ครั้งถัดไปต้องผ่าน G2 ตามปกติ
