# Brief — Pilot W2 baseline audit (docs/contract)

Date: 23 พ.ย. 2569 (2026-11-23)
Risk: R2 — read-only audit ของเอกสาร/สัญญา ไม่แก้ไฟล์ผลิตภัณฑ์
Owner: `boq-lead` (route/ปิดรอบ) + `boq-compliance-reviewer` (ตรวจ)
Author: main session

## Goal

เริ่ม pilot ทีมเอเจนต์รอบแรกด้วยงาน W2 แบบ baseline: ตรวจชุดเอกสารราชการ 2569
และแนบท้ายสัญญาบน `main` ปัจจุบัน กับเช็กลิสต์ใน `boq-compliance-reviewer`
เพื่อดูว่า gate G2 ตรวจจับ invariant/ disclaimer/ปี พ.ศ. ได้จริงหรือไม่

ไม่มี diff ของผลิตภัณฑ์ในรอบนี้ — เป็นการตรวจสถานะปัจจุบัน ไม่ใช่การอนุมัติ release ใหม่

## In scope

- `lib/report2569.ts`
- `lib/export-reg2569.ts`, `lib/export-contract.ts`
- `lib/calc/reduce.ts`
- `app/projects/[id]/docs/reg2569/page.tsx`, `reg2569-client.tsx`
- `app/projects/[id]/docs/contract/page.tsx`, `contract-client.tsx`
- เทสต์ที่เกี่ยวข้อง: `lib/report2569.test.ts`, `lib/export-reg2569.test.ts`, `lib/export-contract.test.ts`, `lib/calc/reduce.test.ts`
- `docs/reg-2569/README.md` (เฉพาะ provenance/notices)

## Checks ที่ต้องตอบให้ได้

1. `contractBase` = `summary.constructionSat + summary.equipmentSat` และถูกใช้เป็นฐานสัญญา
2. จำนวนแผ่น = `5 + p1Pages + (p2 ? 2 : 0) + (p3 ? 1 + reasons : 0)`
3. disclaimer ครบใน report/export/contract/print และคำว่า “ไม่ใช่ราคากลาง/ไม่ใช่ราคามาตรฐานของกรมบัญชีกลาง”
4. ปี พ.ศ. มาจาก `rulesetBeYear` ไม่ hardcode 2569 ในเอกสาร
5. `computePriceReduction` บล็อกงานที่มี ปร.3 และ invariant `Σ reducedSat = winItemsSat`
6. superseded/notices/PriceEvidence/`notYetPublished`/`unverified` ถูกส่งต่อถึงเอกสาร
7. เทสต์ที่อ้าง invariant ไม่ใช่ tautology และมีเคสขอบ

## Out of scope

- การพิมพ์จริง/จำนวนแผ่นบนกระดาษ (U5 — ต้อง human)
- การตรวจตัวเลขกฎหมายกับราชกิจจานุเบกษา (U1/U2 — ต้องแหล่งต้นฉบับ)
- การแก้โค้ด/เอกสารในรอบนี้
- Release/deploy ใหม่

## Acceptance

- Reviewer คืน report ตาม template: verdict PASS/FAIL, findings มี `file:line`, unverified ระบุแหล่ง
- ถ้า FAIL ต้องแยก finding เป็น block/fix/note และมี suggested fix
- ห้ามประกาศ PASS ถ้ามี block/fix ค้าง

## Gates

G0 (brief นี้) · G2 (review report)

ไม่ต้อง G1/G4/G5 เพราะไม่มีการเปลี่ยนโค้ดหรือปล่อยเวอร์ชัน

## Stop conditions

- ต้องใช้ shell/เทสต์รันเอง → หยุดและขอหลักฐานจาก lead (reviewer เป็น read-only)
- ต้องเปิดเอกสารภายนอกที่ไม่มีใน repo → บันทึก `unverified` ห้ามเดา
- พบว่าต้องแก้โค้ด → แยกงานให้เจ้าของ scope แล้ว reviewer ตรวจซ้ำ
