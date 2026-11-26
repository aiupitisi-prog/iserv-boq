# Re-review brief — Pilot W2 fixes (FND-001..FND-007)

Date: 26 พ.ย. 2569 (2026-11-26)
Reviewer: `boq-compliance-reviewer` (session แยก, read-only)
รอบ: ตรวจซ้ำหลังแก้ finding จาก `docs/agent-ops/reviews/2026-11-23-pilot-w2-audit.md`
Base: HEAD `eb7656d` + working tree ที่ยังไม่ commit (diff ด้านล่าง)

## ขอบเขต

ตรวจเฉพาะ finding FND-001..FND-007 และผลกระทบต่อ invariant/เอกสารพิมพ์ ห้ามใช้ shell — หลักฐานการรันอยู่ด้านล่าง
FND-008 (อัลกอริทึมปรับลดยัง unverified) ไม่ได้แก้โดยเจตนา — ต้องคงสถานะ unverified

## Diff ที่ต้องตรวจ

| ไฟล์ | Finding | สาระ |
|---|---|---|
| `lib/calc/reduce.ts` | FND-001 | guard ใช้ `project.specialExpenses ?? []` ทั้ง array (ไม่กรอง `amount !== 0`) + ข้อความนับทุกรายการ |
| `lib/calc/reduce.test.ts` | FND-001 | เพิ่มเทสต์แถวเดียว amount 0 และแถวผสม 0/100 (ปฏิเสธ + `lines` ว่าง) |
| `app/projects/[id]/docs/reg2569/reg2569-client.tsx` | FND-002/006 | เพิ่ม `rulesetProvenanceLabel`/`shortChecksum`/`RulesetProvenanceBlock`; footer มีชื่อชุดกฎ/effectiveFrom/checksum/provenance; แผ่นแรกพิมพ์ notices + superseded warning (`print-warn`); ยังคง disclaimer เดิม |
| `app/projects/[id]/docs/contract/contract-client.tsx` | FND-007 | วันที่พิมพ์เป็น `useState(() => new Date())` แทน `new Date()` ใน render |
| `lib/export-reg2569.test.ts` | FND-004/005 | golden sheet order 12/8 ชีต, จำนวนแผ่น 13/6, bahtText literal 2 เคส; ไม่ใช้สูตร implementation สร้าง expected |
| `lib/ruleset-w481-meta.ts` (ใหม่) | FND-003 | `withW481Provenance()` เติม provenance mirror-unverified + notice แบบ idempotent; ไม่แตะ checksum/ตาราง |
| `lib/ruleset-w481-meta.test.ts` (ใหม่) | FND-003 | 4 เคส + เส้นทาง `prepareImport` จริง |
| `app/rulesets/page.tsx` | FND-003 | `installW481()` เรียก helper และลบ notice ซ้ำเดิม; คง SET checksum note |
| `docs/agent-ops/open-questions.md` | — | U4 ระบุบล็อกทุกแถวรวมยอด 0; U7 = กำลังดำเนินการ |
| `docs/agent-ops/reviews/2026-11-23-pilot-w2-audit.md`, `docs/agent-ops/plans/2026-11-23-pilot-w2-fixes.md` | — | บันทึก audit/แผน (เอกสารเท่านั้น) |

**ยืนยัน:** ไม่มีไฟล์ GENERATED ถูกแก้ (`lib/ruleset-w481-2569.ts` และชุด `ruleset-w*-2569.ts` ไม่ปรากฏใน diff)

## หลักฐานการรัน (lead รันที่ working tree นี้)

- `npx vitest run` → **19 ไฟล์ / 314 เทสต์ ผ่านทั้งหมด** · EXIT=0 (baseline 18/307 → เพิ่ม 1 ไฟล์ + 7 เทสต์)
- `npx tsc --noEmit` → EXIT=0
- `npm run build` → EXIT=0 (Next.js 15.5.29, 16 หน้า)
- `npm run verify:agents` → PASS agents=6 skills=8 references=8 · EXIT=0
- `git diff --check` → EXIT=0

## จุดที่ขอให้ตรวจเป็นพิเศษ

1. **FND-001** — การบล็อกเมื่อมีแถว ปร.3 ยอด 0 ตรงกับ `report2569.ts` ที่สร้างแผ่นเมื่อ `expenses.length > 0` หรือไม่; ข้อความ error นับจำนวนถูก; ไม่มีการสร้าง `lines` บางส่วน
2. **FND-002** — metadata ครบ (ชื่อชุดกฎ, effectiveFrom, checksum, provenance, notices) และพิมพ์จริง; กรณี `pinnedRs = null` ต้องไม่ crash และต้องแสดง unverified; ไม่ hardcode ปี พ.ศ.; checksum ที่ตัดสั้นต้องไม่ทำให้เข้าใจผิดว่าครบ
3. **FND-003** — helper ไม่แก้ตัวเลข/checksum/effectiveFrom, idempotent, ไม่ทับ provenance ที่มีอยู่; `prepareImport` รักษา provenance/notice; ไฟล์ generated ไม่ถูกแตะ
4. **FND-004** — golden 12/8 ชีตและ 13/6 แผ่นตรงกับผลจริง; ถ้าสูตร implementation เปลี่ยน ต้องมีเทสต์แดง
5. **FND-005** — ข้อความ bahtText literal สะกดถูกและตรงยอด (`4,235,857 สตางค์` และ `125,000 สตางค์`)
6. **FND-006** — superseded warning พิมพ์บนแผ่นแรกและไม่หายตอน print (ไม่ใช่ `no-print`)
7. **FND-007** — ไม่มี `new Date()` ใหม่ใน render path ของ contract; รูปแบบวันที่/ข้อความ disclaimer ไม่เปลี่ยน

## สิ่งที่ยัง unverified (ต้องคงไว้)

U1 ปร.3+VAT/เงินเผื่อ · U2 ตัวเลข ว 475/477/480/481 · U3 `ROUNDDOWN` · U4 แนวทาง ปร.3 กับสัญญา · U5 พิมพ์จริง A4 หลายหน้า
— ห้ามใช้ผล re-review นี้ปิด U1–U5 หรือ G5

## ผลลัพธ์ที่ต้องการ

- Verdict `PASS` / `FAIL`
- จำนวน `block` / `fix` / `note` คงเหลือ พร้อม file:line
- ถ้า PASS: ระบุว่า FND-001..FND-007 ปิดได้ และ G2 ผ่านเฉพาะ scope นี้
- ถ้า FAIL: ระบุ finding ใหม่/ที่ยังค้างให้แก้ก่อน commit
