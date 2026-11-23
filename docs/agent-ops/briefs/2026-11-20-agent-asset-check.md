# Brief — Agent asset check (drift guard)

Date: 20 พ.ย. 2569 (2026-11-20)
Risk: R1 — tooling/docs ไม่แตะเงิน เอกสารพิมพ์ หรือ agent behavior
Owner: `boq-qa-release` (ตรวจ) + `boq-lead` (รับรอง scope)
Author: main session

## Goal

ย้ายการตรวจความสอดคล้องของ agent/skill จากสคริปต์ชั่วคราวใน `temp/` มาเป็นสคริปต์ที่ commit ได้
และบังคับรันใน CI เพื่อกัน drift ระหว่าง `.opencode/agents/` กับ `.claude/agents/`
รวมถึงกัน skill ที่ถูกอ้างแต่ไม่มีไฟล์จริง

## In scope

- `scripts/verify-agent-assets.mjs`
- npm script `verify:agents`
- CI step ใน `.github/workflows/ci.yml`
- เอกสาร PRD/progress/brief/release evidence

## Out of scope

- แก้เนื้อหา agent/skill (ต้องมี PRD change แยก)
- เพิ่ม agent ใหม่ (`boq-ui-engineer` ยังเป็น Phase 4)
- ตรวจ hardcode ตัวเลขกฎหมายทั้ง repo (แยกงาน)
- บังคับ required status check ใน GitHub settings

## Acceptance

- [ ] `npm run verify:agents` PASS บน tree ปัจจุบัน
- [ ] ทดสอบ negative case: แก้ body ฝั่งเดียวแล้วสคริปต์ต้อง FAIL
- [ ] ตรวจว่า agent ทุกตัวอ้าง skill ที่มีจริง, reviewer ยัง read-only, ไม่มี secret/TODO
- [ ] CI เขียวโดยมี step `Verify agent assets`
- [ ] vitest ≥ 307, tsc EXIT=0, build EXIT=0, prod 200

## Gates

G0 (brief นี้) · G1 (tests/tsc/build + script) · G4 (push + Vercel + prod)

ไม่ต้อง G2/G5 เพราะ R1 ไม่เปลี่ยนการคำนวณหรือเอกสารส่งหน่วยงาน

## Stop conditions

- สคริปต์ต้องผ่อนกฎเพื่อให้ผ่าน → หยุดและรายงาน (ห้ามลด guard)
- พบ agent/skill drift จริงที่ต้องแก้เนื้อหา → แยกงานให้เจ้าของ scope
- CI แดงจาก environment → หยุด วิเคราะห์
