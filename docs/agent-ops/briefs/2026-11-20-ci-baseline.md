# Brief — CI baseline (U6)

Date: 20 พ.ย. 2569 (2026-11-20)
Risk: R1 — infra/docs ไม่แตะเงิน เอกสารพิมพ์ หรือตัวเลขกฎหมาย
Owner: repo owner (human) + `boq-qa-release` (ตรวจผล)
Author: main session

## Goal

เพิ่ม GitHub Actions ให้รัน vitest / tsc / build ทุก push และ pull request ไป `main`
เพื่อจับ regression ก่อนที่ Vercel จะ deploy — ปิดช่อง U6 ที่ยังไม่มี CI รันเทสต์

## In scope

- `.github/workflows/ci.yml`
- brief นี้

## Out of scope

- แก้โค้ดผลิตภัณฑ์หรือเทสต์
- บังคับ required status checks ใน GitHub settings (ต้องใช้สิทธิ์ admin — ทำภายหลัง)
- แก้ `snapshot-refresh.yml`
- เปลี่ยน Node version ของ Vercel

## Acceptance

- [ ] workflow ถูก push และ GitHub Actions รันบน commit ที่เพิ่ม
- [ ] CI เขียว: vitest ≥ 307 passed, `tsc --noEmit` EXIT=0, `npm run build` EXIT=0
- [ ] ไม่มี secret/PII/token ใน workflow
- [ ] Vercel ของ commit ยัง success และ prod 200

## Gates required

G0 (brief นี้) · G1 (tests/tsc/build ทั้ง local และ CI) · G4 (push + Vercel + prod)

ไม่ต้องใช้ G2 reviewer เพราะ R1 ไม่แตะการคำนวณ/เอกสารส่งหน่วยงาน
ไม่ต้องใช้ G5 เพราะไม่เปลี่ยนตัวเลขหรือแบบฟอร์ม

## Stop conditions

- push ถูกปฏิเสธเพราะ credential ไม่มี `workflow` scope → หยุดและรายงาน human
- CI แดงจาก environment (ไม่ใช่โค้ด) → หยุด วิเคราะห์ ห้ามปิด U6
- พบว่าต้องเพิ่ม secret ใด ๆ → หยุดและถาม human
