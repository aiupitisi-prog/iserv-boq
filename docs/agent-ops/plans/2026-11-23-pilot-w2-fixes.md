# Plan — Pilot W2 fixes (FND-001..FND-007)

Date: 23 พ.ย. 2569 (2026-11-23)
Risk: R2 (money guard / tests) + R3 (print metadata) — ต้องมี reviewer PASS ก่อน release
Owner: `boq-lead` (route) · ผู้แก้ตาม scope · `boq-compliance-reviewer` (re-review)

## Steps

| # | เจ้าของ | งาน | Output | Gate |
|---|---|---|---|---|
| 1 | `boq-calc-engineer` | FND-001: บล็อก ปร.3 ทุกกรณี (รวม amount 0) + เทสต์ | `lib/calc/reduce.ts`, `lib/calc/reduce.test.ts` | G1 |
| 2 | `boq-docs-engineer` | FND-002: print metadata/provenance/notices; FND-004: golden page count/sheet order; FND-005: bahtText hardcode; FND-006: printed superseded; FND-007: stable contract date | `reg2569-client.tsx`, `contract-client.tsx`, `lib/export-reg2569.test.ts` | G1 |
| 3 | `price-data-steward` | FND-003: W481 provenance/notices ผ่าน helper (ห้ามแก้ไฟล์ generated) + เทสต์ | `lib/ruleset-w481-meta.ts`, `app/rulesets/page.tsx`, test | G1 |
| 4 | `boq-qa-release` / main | รวม diff, รัน vitest/tsc/build, ตรวจ diff hygiene | EV | G1 |
| 5 | `boq-compliance-reviewer` | ตรวจซ้ำเฉพาะ FND-001..FND-007 + diff | review report ฉบับที่ 2 | G2 |
| 6 | `boq-qa-release` | commit/push/Vercel/prod + release evidence | release evidence | G4 |

## Dependencies

- Step 2/3 แตะคนละไฟล์กับ step 1 — ทำขนานได้
- Step 5 ต้องเห็น diff + ผลเทสต์ครบก่อน
- FND-008 (unverified algorithm) ไม่แก้ในรอบนี้ — คงสถานะ U1/U4

## Risks

- Print metadata อาจทำให้ footer ยาว/ล้น A4 → ใช้ตัวอักษรเล็กและทดสอบ print CSS; การพิมพ์จริงยังเป็น U5
- W481 เป็นไฟล์ GENERATED — ห้ามแก้มือ; ใช้ helper ฝั่งติดตั้ง
- การแก้ guard อาจกระทบโปรเจกต์ที่มีแถว ปร.3 ว่าง → ต้องแจ้งผู้ใช้ให้ลบแถวว่าง

## Stop conditions

- เทสต์/tsc/build แดง → หยุด
- ต้องแก้ไฟล์ generated หรือลด guard → หยุดและรายงาน
- Reviewer ยัง FAIL → ห้าม commit/push ในชื่อว่า PASS

## สถานะ 26 พ.ย. 2569

- Step 1–3 เสร็จ — FND-001..FND-007 แก้ครบ (FND-003 ผ่าน `lib/ruleset-w481-meta.ts`, ไม่แตะไฟล์ generated)
- Vitest 19 ไฟล์ / 314 เทสต์ · tsc EXIT=0 · build EXIT=0 · verify:agents PASS · diff --check EXIT=0
- Re-review: **PASS** — block 0 / fix 0 / note 6 → `docs/agent-ops/reviews/2026-11-26-pilot-w2-rereview.md`
- Note 6 ข้อเป็น follow-up ไม่บล็อก commit; U1–U5/FND-008 ยัง unverified
- เหลือ step 6: commit/push/CI/Vercel/prod + release evidence
