# Open questions — iServ BOQ

อัปเดต: 23 พ.ย. 2569 · เจ้าของทะเบียน: `boq-lead`

ข้อที่ยัง **unverified** ต้องมี owner และแหล่งที่ต้องเปิดก่อนปิด
ห้ามปิดรายการด้วยการเดา/ใช้ค่าจากบล็อก/สรุป — ต้องมีหลักฐานอ้างอิง

| ID | เรื่อง | สถานะ | Owner | แหล่งที่ต้องเปิด | ผลกระทบ |
|---|---|---|---|---|---|
| U1 | สูตร ปร.3 กับ VAT และการตัดเงินเผื่อจำเป็นของชุด 2569 | **unverified** | human owner + `boq-docs-engineer` | หลักเกณฑ์ราคากลาง เล่ม 2 ข้อ 11 และแบบฟอร์ม ปร.3 ต้นฉบับ | ปร.3/เหตุผล และ VAT ของค่าใช้จ่ายพิเศษ |
| U2 | ตาราง ว 475/477/480/481 จาก Yotathai mirror | **mirror-unverified** | `price-data-steward` | ราชกิจจานุเบกษา/เล่มประกาศจริง | ตัวเลข Factor F, ค่าแรง, ค่าขนส่ง, ค่าเครื่องจักร |
| U3 | `ROUNDDOWN(...,-3)` ในแบบฟอร์ม .xls | ยังไม่รองรับ | human owner | คำยืนยันเป็นลายลักษณ์อักษรจากหน่วยงาน | การปัดยอดสุทธิระดับพัน |
| U4 | โครงการที่มีปร.3 กับแนบท้ายสัญญา | **บล็อก** โดย `computePriceReduction` — ทุกแถวใน `specialExpenses` รวมยอด 0 (FND-001, 23 พ.ย. 2569) | human owner + `boq-calc-engineer` | แนวทางที่หน่วยงานยืนยัน | ไม่สามารถออกแนบท้ายสัญญาได้จนกว่าจะปิด |
| U5 | พิมพ์จริงกับโครงการตารางหลายหน้า | ยังไม่ทดสอบครบ | `boq-qa-release` + human | Chrome/Edge พิมพ์จริง A4 หลายหน้า | layout/จำนวนแผ่น/หัวกระดาษ |
| U6 | CI รันเทสต์ | **ปิดแล้ว 20 พ.ย. 2569** — `ci` เขียว 2 รอบ; ยังไม่บังคับ required check | `boq-qa-release` | `.github/workflows/ci.yml` + Actions run 44723201815 | regression ถูกจับหลัง push ก่อน/ระหว่าง deploy; ยังไม่บล็อก merge |
| U7 | Pilot ทีมเอเจนต์ W1–W6 | **pilot W2 ผ่าน G2 เฉพาะ FND-001..FND-007** — release `b5549a0` (CI `45845567076`, Vercel success, prod 200); W1/W3–W6 ยังไม่มีผลรัน | `boq-lead` | ผลรันจริงรอบแรก + metrics §12 | ยังไม่มีหลักฐานว่า gate ทำงานครบทุก workflow |

## Follow-up จาก re-review 26 พ.ย. 2569 (note — ไม่บล็อก G2)

| ID | เรื่อง | Owner | ไฟล์ |
|---|---|---|---|
| N-01 | `thDate(new Date())` ใน render ของ reg2569 — เสี่ยง hydration mismatch | `boq-docs-engineer` | `app/projects/[id]/docs/reg2569/reg2569-client.tsx` |
| N-02 | พิมพ์ป้าย “ไม่ทราบปี (unverified)” เมื่อ `rulesetBeYear()` เป็น null | `boq-docs-engineer` | `reg2569-client.tsx` |
| N-03 | พิมพ์ `sourceDoc` + จุดตรวจ checksum เต็ม | `boq-docs-engineer` | `reg2569-client.tsx` |
| N-04 | เพิ่ม bahtText literal ใน contract test (กัน tautology) | `boq-docs-engineer` | `lib/export-contract.test.ts` |
| N-05 | helper W481 เติม mirror notice แม้ provenance เป็น official | `price-data-steward` | `lib/ruleset-w481-meta.ts` |
| N-06 | ข้อความบล็อก ปร.3 แนะนำให้ลบแถวว่าง/ยอด 0 | `boq-calc-engineer` | `lib/calc/reduce.ts` |

## กติกาการปิดรายการ

1. ระบุหลักฐาน: เอกสาร/หน้า/ข้อ/วันที่ตรวจ + ผู้ตรวจ
2. ถ้าเป็นการเปลี่ยนข้อมูลกฎหมาย → ต้องมี human sign-off (G5)
3. อัปเดต `docs/reg-2569/README.md` และ progress report เมื่อปิด
4. รายการที่ยังไม่มีแหล่ง → คงสถานะ `unverified` และห้ามใช้ตัวเลขนั้นในเอกสารที่ส่งหน่วยงาน
