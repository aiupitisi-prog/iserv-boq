---
name: BOQ Money Invariants
description: กฎและ invariant ทางการเงินของ iServ BOQ — ใช้เมื่อแตะการคำนวณเงิน สัดส่วน การปัดเศษ Factor F ครุภัณฑ์ เงินเผื่อ หรือการปรับลดราคาในแนบท้ายสัญญา
---

# BOQ Money Invariants

เวอร์ชัน 1.0 — 19 พ.ย. 2569 · เจ้าของ: `boq-calc-engineer`
ใช้ร่วมกับ `thai-govt-base-price-rules` และ `boq-report-2569`

## ใช้เมื่อ

- แก้ `lib/calc/**`, `lib/report2569.ts` หรือ `lib/export-contract.ts`
- เพิ่ม/แก้สูตรเงิน, การปัดเศษ, การกระจายสัดส่วน, VAT, ค่าติดตั้ง
- ตรวจว่าเอกสารพิมพ์/สัญญาตรงกับยอดที่เครื่องยนต์คำนวณ
- เขียนเทสต์ invariant หรือสอบสวนยอดไม่ตรง

## 1. หน่วยเงินและขอบเขต

| กฎ | รายละเอียด |
|---|---|
| หน่วยคำนวณ | `Satang` = `number` ที่เป็นจำนวนเต็ม (1 บาท = 100 สตางค์) |
| ขอบเขต float | ราคาใน storage/UI เป็นบาททศนิยมได้ — แปลงเป็นสตางค์ **ครั้งเดียว** ด้วย `toSatang()` |
| หลังแปลง | ห้าม float ในเส้นทางคำนวณ — บวก/คูณ/หารสัดส่วนต้องเป็น integer หรือ BigInt |
| การแสดงผล | `satangToBaht()` / `formatSatang()` ใช้แสดงเท่านั้น ห้ามนำผลกลับไปคำนวณ |
| ปริมาณ | ทศนิยม ≤ 4 ตำแหน่ง; ใช้ `scaledQuantity()` + `amountFromScaled()` (QTY_SCALE = 10,000) |
| Safe integer | ถ้าผลคูณเกิน `Number.MAX_SAFE_INTEGER` ต้องคืน error ไม่คืนยอดเพี้ยน |
| การปัดเศษ | half-up ครั้งเดียว ณ จุดที่กำหนด; ทุกจุดที่ปัดต้องมี note/trace |

### ฟังก์ชันเงินกลาง (`lib/calc/money.ts`)

| ฟังก์ชัน | สูตร/พฤติกรรม |
|---|---|
| `toSatang(baht)` | `round(baht × 100)` + epsilon กัน float; ค่าไม่ finite → 0 |
| `sumSatang(list)` | ผลบวก integer |
| `proportionSat(part, num, denom)` | `part × num ÷ denom` แบบ half-up ด้วย BigInt |
| `pctOf(satang, pct)` | `round(satang × pct ÷ 100)` |
| `mulQty(qty, unitPriceBaht)` | แปลงราคาเป็นสตางค์ก่อน แล้ว `round(satang × qty)` |
| `formatSatang(satang)` | ข้อความบาท 2 ตำแหน่ง (แสดงผลเท่านั้น) |

> ห้ามเขียนสูตรกระจายสัดส่วนซ้ำใน component/export — ใช้ `proportionSat` ตัวเดียว

## 2. ลำดับคำนวณเงิน

1. **รายการ** — `mulQty` หรือ `amountFromScaled` ได้ยอดต่อรายการ
2. **ต้นทุนโดยตรงโครงการ (A)** — รวมค่าวัสดุ + ค่าแรงของงานก่อสร้างเท่านั้น; ครุภัณฑ์ไม่เข้าฐาน
3. **Factor F** — lookup/interpolate จากตารางใน ruleset; `afterFactor` มาจากเครื่องยนต์
4. **ปร.1(ก)** — ค่าก่อสร้างรวม = `calc.afterFactor`
5. **ครุภัณฑ์** — ราคา + VAT + ค่าติดตั้ง + VAT ตามที่ ruleset/หลักฐานกำหนด; แยกจากฐาน Factor F
6. **ค่าใช้จ่ายพิเศษ (ปร.3)** — ตามที่ผู้ใช้ระบุ; ยัง unverified เรื่อง VAT/การตัดเงินเผื่อ
7. **ปร.4** — ค่าก่อสร้าง + ครุภัณฑ์ + ค่าใช้จ่ายพิเศษ
8. **แนบท้ายสัญญา** — ฐานจาก `Reg2569Report.contractBase` แล้วกระจายส่วนลด

## 3. Invariants บังคับ

| ID | เงื่อนไข | ตรวจที่ |
|---|---|---|
| INV-1 | `Σ matSat + Σ labSat = calc.directCost` | `lib/report2569.test.ts` |
| INV-2 | `Σ ค่าก่อสร้างรายกลุ่ม + roundingAdj = calc.afterFactor` | `report2569` / `export-reg2569` |
| INV-3 | `contractBase.constructionSat = summary.constructionSat` | `report2569.test.ts` |
| INV-4 | `contractBase.equipmentSat = summary.equipmentSat` | `report2569.test.ts` |
| INV-5 | `contractBase.totalSat = constructionSat + equipmentSat` | `report2569.test.ts` |
| INV-6 | `contractBase.totalSat + summary.expenseSat = summary.totalSat` | `report2569.test.ts` |
| INV-7 | `Σ contractBase.lines.baseSat = contractBase.totalSat` | `report2569.test.ts` |
| INV-8 | base map ครบทุก `project.items` และไม่มี `itemId` ซ้ำ | `reduce.test.ts` |
| INV-9 | `Σ reduce.lines.reducedSat = reduce.winItemsSat` | `reduce.test.ts` / `export-contract.test.ts` |
| INV-10 | `reduce.winningSat = winItemsSat + fixedTotalSat` | `reduce.test.ts` |
| INV-11 | จำนวนแผ่นรวม = `5 + p1Pages + (p2?2:0) + (p3?1+reasons:0)` | `export-reg2569.test.ts` / หน้าพิมพ์ |
| INV-12 | ตัวอักษรบาทตรงกับยอดตัวเลขใน ปร.4/สัญญา | `export-*.test.ts` |

> ถ้า invariant ใดไม่ผ่าน ให้หยุดและรายงานเป็น block — ห้าม “ปรับตัวเลขให้ผ่าน” โดยไม่มีหลักฐาน

## 4. ฐานราคากลางของแนบท้ายสัญญา

`Reg2569Report.contractBase` คือแหล่งเดียว:

- **งานก่อสร้าง** = `afterFactor` กระจายตามสัดส่วน `mat+lab` ของแต่ละรายการ
  - ใช้ `proportionSat` + เศษปัดเศษเข้ารายการที่มีค่าน้ำหนักมากที่สุด (deterministic)
  - `roundingAdjSat` ต้องตรวจย้อนกลับได้
- **ครุภัณฑ์** = `p2.rows[i].totalSat` (ราคา + VAT + ค่าติดตั้ง + VAT) — ห้ามใช้ราคาดิบ
- **ปร.3** ยังไม่รวมใน `contractBase`; `computePriceReduction` ต้องบล็อกโครงการที่มี `specialExpenses`
- `PriceReductionBase` ต้องมี `lines` ครบทุก item และ `totalSat` ตรงกับผลรวม

### ห้าม

- ใช้ `calc.total` เป็นฐานสัญญา (รวมเงินเผื่อจำเป็น/ค่าดำเนินงานของโครงเดิม)
- คำนวณฐานซ้ำใน `export-contract.ts` หรือ `contract-client.tsx`
- ใช้ `afterFactor + ราคาครุภัณฑ์ดิบ` (ขาด VAT/ค่าติดตั้ง)
- ปล่อยผ่านเมื่อ `Σ baseSat ≠ base.totalSat`

## 5. การปรับลดราคา (`computePriceReduction`)

ลำดับ:

1. รับ `base` จาก `contractBase` (บังคับ)
2. ตรวจ base ครบ/ไม่ซ้ำ/Σ ตรง
3. ถ้ามี `specialExpenses` → คืน error (ยังไม่มีแนวทางยืนยัน)
4. `winningSat = toSatang(winningPrice)`
5. `winItems = winningSat − fixedTotalSat` (โหมด base จาก ปร.4: `fixedTotal = 0`)
6. ถ้า `winItems < 0` → error
7. ถ้า `reducibleBase <= 0` → error
8. ถ้า `winItems >= reducibleBase` → error (ต้องต่ำกว่าฐาน)
9. กระจาย `winItems` ด้วย `proportionSat(median, winItems, reducibleBase)` ต่อรายการ
10. เศษ `winItems − Σ` เหวี่ยงเข้ารายการที่ `reducedSat` มากที่สุด
11. ตรวจ `Σ reducedSat = winItems` อีกครั้งก่อนคืนค่า

### Error ที่ต้องมีข้อความชัด

- ราคาเสนอไม่ถูกต้อง/ศูนย์
- ราคาเสนอต่ำกว่าส่วนคงเดิม
- ราคาเสนอเท่ากับหรือสูงกว่าฐาน
- ฐานไม่ครบ/ซ้ำ/Σ ไม่ตรง
- BOQ ไม่มีรายการราคา
- โครงการมีปร.3 (บล็อก)
- โครงการโหมดเอกชน (บล็อกที่ export)

> ห้ามกลืน error แล้วคืนเอกสารว่าง; ห้าม auto-balance ด้วยการแก้ยอดแบบไม่มีหลักฐาน

## 6. ข้อห้ามเด็ดขาด

- ห้ามใช้ float คูณเงินหลังแปลงเป็นสตางค์
- ห้ามปัดเศษหลายจุดโดยไม่มี trace
- ห้ามใช้ `ROUNDDOWN(...,-3)` หรือ “ยอดสุทธิปัดลงหลักพัน” เว้นแต่มนุษย์อนุมัติและมีแหล่งกฎ
- ห้ามคำนวณ VAT จากอัตราที่ hardcode — ใช้ `FactorFTable.vatPct` หรือ ruleset
- ห้ามใช้ `ruleset.durableHandlingPct` แทนค่าติดตั้งครุภัณฑ์ที่สืบราคา
- ห้ามคำนวณเงินใน UI/export คนละสูตรกับ `lib/calc`

## 7. Test checklist

- [ ] unit test ของสูตรที่แก้ (input → expected satang)
- [ ] invariant ตาม §3 อย่างน้อย 1 เคสต่อข้อที่เกี่ยวข้อง
- [ ] เคสขอบ: 0, ค่าติดลบ, NaN/Infinity, ปริมาณเกิน 4 ตำแหน่ง, เกิน safe integer
- [ ] เคสเศษปัดเศษ: Σ ต้องพอดีหลังเหวี่ยง
- [ ] เคสครุภัณฑ์: VAT/ค่าติดตั้งไม่เข้าฐาน Factor F
- [ ] เคสปร.3: ต้องได้ error ที่อ่านรู้เรื่อง
- [ ] golden จากเอกสาร/ตารางจริง โดยระบุแหล่ง

## 8. Acceptance

- `npx vitest run` ผ่าน และจำนวนเทสต์ไม่ต่ำกว่า baseline
- `npx tsc --noEmit` EXIT=0
- invariant ทุกข้อที่เกี่ยวข้องมีเทสต์
- ไม่มี float ในเส้นทางเงินหลัง `toSatang`
- reviewer ตรวจแล้วเห็นว่าตัวเลขทุกเส้นทางมาจากแหล่งเดียว
