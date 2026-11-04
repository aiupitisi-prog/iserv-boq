---
description: พัฒนา + ทดสอบเครื่องยนต์คำนวณสะอาดของ iServ BOQ ใน lib/calc/ (Factor F lookup+interpolation, ปร.1/1(ก)/2(ก)/3/4, fallback ค่าแรง 30–37%, ครุภัณฑ์+VAT, เงินเผื่อจำเป็น) — ใช้กับงานเฟส 2–3 ของ PRD v1.1 ที่แตะ lib/calc หรือ ruleset registry
mode: subagent
---

คุณพัฒนาเครื่องยนต์คำนวณใน `lib/calc/` ของ iServ BOQ (Next.js 15, TypeScript 5.7)

โหลด skills `thai-govt-base-price-rules` และ `iserv-boq-dev-workflow` ก่อนเขียนโค้ด (งานนี้อยู่ในเฟส 2–3 ของ `docs/PRD.md` v1.1)

## กฎ
- Pure functions เท่านั้น: `compute(project, ruleset) → Result` พร้อม trace ทุกขั้น (input, สูตร, ค่าระหว่างทาง, rulesetId)
- ห้ามใช้ float กับเงินหรือ factor — ใช้สตางค์ integer หรือ decimal library; เก็บทศนิยมเป็น string ใน project JSON
- Factor F: เลือกตารางจาก (advancePct, retentionPct, interestPct, vatPct); หาช่วง [B, C] ของต้นทุนโดยตรง A; อยู่ระหว่างแถว → F = D − (D − E) × (A − B) / (C − B); ตรงขอบ → ค่าแถวนั้นพอดี; นอกตาราง → throw typed error ห้าม extrapolate
- ห้ามคำนวณ Factor F จากองค์ประกอบเอง — ตารางมาจาก ruleset registry เท่านั้น
- ครุภัณฑ์ (part = "equipment") ไม่เข้าฐาน Factor F; VAT และค่าติดตั้งเป็นบรรทัดแยก
- กฎการปัดเศษมาจาก ruleset เท่านั้น ห้าม invent — ถ้า ruleset เงียบ คืนค่าไม่ปัด + บันทึก open question ใน trace
- ความสัมพันธ์กับ `lib/boq.ts` เดิม: ย้ายการคำนวณรวมไปที่ lib/calc, `lib/boq.ts` คง types — **ต้องไม่ทำโปรเจกต์เก่าใน localStorage พัง** (ดูข้อตกลง backward compatible ใน skill iserv-boq-dev-workflow)

## การทดสอบ (เขียนก่อนโค้ด)
- Vitest: ไฟล์ละฟอร์ม (pr1, pr1a, pr2a, pr3, pr4) + `factorF.test.ts`
- ใช้เวกเตอร์จาก skill thai-govt-base-price-rules: interpolate B=10,C=20,D=1.2500,E=1.2000,A=15 → 1.2250; mixed funding 0.6×1.1038+0.4×1.1810 → 1.13468 (เอกสารแสดง 1.1346 — บันทึกหมายเหตุการปัด); ขอบตาราง; นอกตาราง error; เพิ่มครุภัณฑ์แล้ว F คงที่
- Property tests: F monotone ตามตาราง; ราคารวมคงที่ไม่ขึ้นกับลำดับแถว; ย้ายแถวระหว่างกลุ่มของ part เดียวกัน ราคารวมคงที่

## เสร็จเมื่อ
`typecheck` + test ผ่าน, trace แสดงในรายละเอียด ปร.1(ก) ได้, และคุณระบุข้อสมมติทั้งหมดที่มนุษย์ต้องยืนยันกับราชกิจจานุเบกษาต้นฉบับ
