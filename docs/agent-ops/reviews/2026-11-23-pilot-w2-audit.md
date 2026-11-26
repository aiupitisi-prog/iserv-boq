# Compliance review — pilot W2 baseline audit

Date: 23 พ.ย. 2569 (2026-11-23)
Reviewer: `boq-compliance-reviewer` (session แยก, read-only)
Scope: HEAD `f433bb5` — ชุดเอกสารราชการ 2569 + แนบท้ายสัญญา (baseline, ไม่มี diff ผลิตภัณฑ์)
Brief: `docs/agent-ops/briefs/2026-11-23-pilot-w2-audit.md`

Verdict: **FAIL** — ไม่มี `block` ด้านตัวเลข/invariant แต่มี `fix` ค้าง 4 ข้อ

## Findings

| ID | Severity | File:line | Rule | Finding | Suggested fix |
|---|---|---|---|---|---|
| FND-001 | fix | `lib/calc/reduce.ts:168` | บล็อกแนบท้ายสัญญาเมื่อมี ปร.3 (U4) | `specialExpenses` ถูกกรองด้วย `amount !== 0` ทำให้โครงการที่มี ปร.3 แต่ยอด 0 ผ่าน guard ไปออกสัญญาได้ ทั้งที่ builder สร้างแผ่น ปร.3 (`lib/report2569.ts:464`) และฟอร์มรับ amount 0 | บล็อกเมื่อ `(project.specialExpenses ?? []).length > 0` และเพิ่มเทสต์ amount 0 |
| FND-002 | fix | `app/projects/[id]/docs/reg2569/reg2569-client.tsx:306` | หัว/ท้ายกระดาษต้องมีชุดกฎ/ปี/effectiveFrom/checksum/provenance/notices | print header/footer มีเพียงชื่อโครงการ/ปี/disclaimer; ไม่มีชื่อชุดกฎ, effectiveFrom, checksum, provenance หรือ notices — ตรวจย้อนกลับไม่ได้ว่าใช้ชุดกฎใด | เพิ่ม metadata ใน `FormHead`/footer และพิมพ์ notices ของชุดกฎ |
| FND-003 | fix | `lib/ruleset-w481-2569.ts:2152-2163` | provenance/notices ต้องแสดงและส่งต่อ | `getW481Ruleset()` ไม่มี `provenance` และ `W481_2569_NOTICES` ไม่มีข้อความ mirror-unverified (ต่างจาก ว 475/477/480) — คำเตือนอยู่เฉพาะ comment/UI install | เพิ่ม provenance + notice ที่เส้นทางติดตั้ง (ไฟล์ generated ห้ามแก้มือ) + เทสต์ |
| FND-004 | fix | `lib/export-reg2569.test.ts:237-239` | เทสต์ต้องไม่ tautology | จำนวนแผ่นคำนวณด้วยสูตรเดียวกับ implementation จึงผ่านเสมอแม้สูตรผิด | เพิ่ม golden 2 ชุด (มี/ไม่มี ป.2+ป.3) และ hardcode จำนวนแผ่น/ลำดับชีต |
| FND-005 | note | `lib/export-reg2569.test.ts:233`; `lib/export-contract.test.ts:176` | INV-12 ตัวอักษรบาทตรงตัวเลข | expected ถูกสร้างด้วย `bahtText()` เอง (tautological) แม้มี golden unit test ที่ `lib/calc/money.test.ts` | เพิ่ม expected เป็นข้อความ hardcode อย่างน้อย 1 เคสใน export test |
| FND-006 | note | `reg2569-client.tsx:282-287` | ชุดที่ถูกแทนที่ต้องเตือน | banner superseded เป็น `no-print`; ข้อเท็จจริงพิมพ์ผ่าน `PrintWarnings` แต่เห็นยาก | พิมพ์ banner บนแผ่นแรกหรือเพิ่มใน `FormHead` |
| FND-007 | note | `contract-client.tsx:236` | ความถูกต้องของวันที่ | `new Date()` ใน render ฝั่ง client — เสี่ยง hydration mismatch | คำนวณวันที่ใน state/`useEffect` |
| FND-008 | note | `lib/calc/reduce.ts:229-234` | ห้ามเดาข้อกฎหมาย | อัลกอริทึมปรับลดยังติดป้าย unverified ตามตัวอย่าง ว 651 — ถูกต้อง | คงไว้ + human ยืนยันก่อนใช้จริง |

## สรุปที่ผ่าน

- `contractBase` = construction afterFactor + equipment (VAT/ค่าติดตั้ง) = ปร.4; INV-3..7 ผ่านและมีเทสต์ B1 (`lib/report2569.test.ts:186-260`)
- `Σ matSat + Σ labSat = directCost`, `Σ กลุ่ม + roundingAdj = afterFactor`, `Σ baseSat = totalSat`, `Σ reducedSat = winItemsSat`
- จำนวนแผ่นสูตรตรงกันระหว่าง print (`reg2569-client.tsx:230`) และ xlsx (`lib/export-reg2569.ts:642`)
- disclaimer ครบทุกชีต/ทุกหน้าพิมพ์ และสัญญามี `CONTRACT_DISCLAIMER` + ป้าย “ไม่ใช่ราคากลาง/ไม่ใช่ราคามาตรฐานของกรมบัญชีกลาง”
- ปี พ.ศ. มาจาก `rulesetBeYear` ไม่ hardcode; null → unverified
- `PriceEvidence` ครบ, stale 12/13 เดือนมีเทสต์, `notYetPublished` พิมพ์ flag
- โหมดเอกชนถูกปฏิเสธทั้งหน้าและ export; `calc.total` ใช้เฉพาะ warning

## Unverified (ณ วันที่ตรวจ)

- **U-01** ผล vitest/tsc/build ที่ HEAD `f433bb5` — reviewer ห้ามรันเอง; release evidence ล่าสุดอ้าง `dd9f207` → ต้องมี log จาก CI/lead
- **U-02** สูตร ปร.3 + VAT + การตัดเงินเผื่อจำเป็น → U1 (เล่ม 2 ข้อ 11 + แบบฟอร์มต้นฉบับ)
- **U-03** ตัวเลข ว 475/477/480/481 จาก Yotathai mirror → U2 (ราชกิจจานุเบกษา)
- **U-04** แนวทาง ปร.3 กับแนบท้ายสัญญา → U4 (หน่วยงานยืนยัน)
- **U-05** ผลพิมพ์จริงหลายหน้า A4 → U5 (Chrome/Edge + human)

## Evidence checked

EV-01 `lib/report2569.ts` · EV-02 `lib/calc/reduce.ts` · EV-03 `lib/calc/money.ts`/`compute.ts`/`factorf.ts` · EV-04 `lib/ruleset.ts` + ชุด ว 47x · EV-05 `lib/export-reg2569.ts` · EV-06 `lib/export-contract.ts` · EV-07 `reg2569-client.tsx`/`contract-client.tsx` · EV-08 ชุดเทสต์ report/export/reduce/money · EV-09 `app/globals.css` print styles · EV-10 skills + PRD §8 + `docs/reg-2569/README.md`

## G2

ยังปิด G2 ไม่ได้ — ต้องแก้ FND-001..FND-004 ให้ครบและให้ reviewer ตรวจซ้ำก่อนประกาศ PASS
