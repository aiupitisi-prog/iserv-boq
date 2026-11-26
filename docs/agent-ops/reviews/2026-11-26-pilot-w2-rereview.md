# Compliance review — pilot W2 re-review (FND-001..FND-007)

Date: 26 พ.ย. 2569 (2026-11-26)
Reviewer: `boq-compliance-reviewer` (session แยก, read-only)
Scope: working tree หลังแก้ FND-001..FND-007 (base HEAD `eb7656d`)
Brief: `docs/agent-ops/briefs/2026-11-26-pilot-w2-rereview.md`
Audit เดิม: `docs/agent-ops/reviews/2026-11-23-pilot-w2-audit.md`

Verdict: **PASS** — G2 เฉพาะ FND-001..FND-007
คงเหลือ: **block 0 / fix 0 / note 6**

## การปิด finding

| FND | ผล | หลักฐาน |
|---|---|---|
| FND-001 | ปิด | `lib/calc/reduce.ts:170-175` ใช้ `(project.specialExpenses ?? []).length > 0` ไม่กรอง `amount`; `err()` คืน `lines: []`; builder สร้างแผ่น ปร.3 เมื่อ `expenses.length > 0` (`lib/report2569.ts:464`); เทสต์ `lib/calc/reduce.test.ts:216-244` |
| FND-002 | ปิด | `reg2569-client.tsx:34-52,150-172` มีชื่อชุดกฎ/effectiveFrom/checksum/provenance/notices; พิมพ์บนแผ่นแรก `:404` + footer `:353-360`; `pinnedRs = null` แสดง unverified ไม่ crash |
| FND-003 | ปิด | `lib/ruleset-w481-meta.ts:13-27` เติม provenance + notice แบบ idempotent ไม่แตะ checksum/ตาราง/effectiveFrom; `app/rulesets/page.tsx:120,133-142` ใช้ helper ก่อน `prepareImport`; เทสต์ `lib/ruleset-w481-meta.test.ts:10-64` รวมเส้นทาง import จริง |
| FND-004 | ปิด | `lib/export-reg2569.test.ts:145-169` hardcode ลำดับชีต 12/8; `:182-183` และ `:401-411` จำนวนแผ่น 13/6; ตรงกับ `lib/export-reg2569.ts:63-66,642` |
| FND-005 | ปิด | `export-reg2569.test.ts:262-265` ยอด `4,235,857` สตางค์ → “สี่หมื่นสองพันสามร้อยห้าสิบแปดบาทห้าสิบเจ็ดสตางค์”; `:413-414` `125,000` สตางค์ → “หนึ่งพันสองร้อยห้าสิบบาทถ้วน” (ตรวจแล้วว่าสะกดถูกและตรงยอด) |
| FND-006 | ปิด | `reg2569-client.tsx:405-411` warning superseded พิมพ์บนแผ่น ปร.1(ก) ด้วย `print-warn` ไม่ใช่ `no-print`; CSS `app/globals.css:83-86` |
| FND-007 | ปิดตามเกณฑ์ brief | `contract-client.tsx:152-153` ใช้ `useState(() => new Date())`; footer `:238` ใช้ `printedAt`; ไม่มี `new Date()` ใหม่ใน render body |
| FND-008 | คง unverified | `lib/calc/reduce.ts:230-233` ยังมี warning อัลกอริทึมปรับลดอ้างอิง ว 651 + unverified |

## Notes คงเหลือ (ไม่บล็อก commit — บันทึกเป็น follow-up)

| # | File:line | Finding | แนวทาง |
|---|---|---|---|
| N-01 | `reg2569-client.tsx:278` | `thDate(new Date())` ใน render ของ reg2569 ยังเสี่ยง hydration mismatch (แก้เฉพาะ contract ในรอบนี้) | ใช้ state/`useEffect` แบบ contract |
| N-02 | `reg2569-client.tsx:353` | ถ้า `rulesetBeYear()` เป็น `null` แต่มี `pinnedRs` หัวพิมพ์ไม่มีป้าย “ไม่ทราบปี (unverified)” (ป้ายมีเฉพาะ toolbar `no-print`) | พิมพ์ป้ายใน header/footer เมื่อ `regYear === null` |
| N-03 | `reg2569-client.tsx:154-160` | ไม่พิมพ์ `sourceDoc` และ checksum เต็ม (ตัด 12 ตัว + `…`) | เพิ่ม sourceDoc + ระบุจุดตรวจ checksum เต็ม |
| N-04 | `lib/export-contract.test.ts:176` | expected bahtText ยังสร้างจาก `bahtText()` (tautology) — literal ใหม่มีเฉพาะ export-reg2569 | เพิ่ม literal อย่างน้อย 1 เคสใน contract test |
| N-05 | `lib/ruleset-w481-meta.ts:17-26` | ถ้า caller ส่ง provenance `official` helper ยังเติม notice mirror-unverified (ปัจจุบัน install ใช้ไฟล์ที่ไม่มี provenance จึงไม่กระทบ) | เติม mirror notice เฉพาะเมื่อ provenance เป็น mirror/ถูก default |
| N-06 | `lib/calc/reduce.ts:172-174` | ข้อความบล็อกไม่ได้บอกให้ลบแถว ปร.3 ว่าง/ยอด 0 | เพิ่มคำแนะนำในข้อความ error |

## ไฟล์ GENERATED / golden

- ไม่มีไฟล์ generated ถูกแก้เชิงเนื้อหา — `lib/ruleset-w481-2569.ts` ยังมี notices 2 ข้อ ไม่มี provenance และ checksum ชุดเดิม; การแก้ FND-003 อยู่ที่ helper แยก
- Helper ไม่แตะตัวเลข: เทสต์ `ruleset-w481-meta.test.ts:34-46` ตรวจ id/name/sourceDoc/sourceUrl/effectiveFrom/checksum/setChecksum/factorFTables/createdAt
- Golden ไม่เป็น tautology: ลำดับชีต/จำนวนแผ่นเป็นค่าคงที่ ไม่ map จากสูตร implementation

## หลักฐานการรัน (lead)

- `npx vitest run` → 19 ไฟล์ / 314 เทสต์ ผ่าน · EXIT=0 (baseline 18/307 → +1 ไฟล์ +7 เทสต์)
- `npx tsc --noEmit` → EXIT=0
- `npm run build` → EXIT=0
- `npm run verify:agents` → PASS agents=6 skills=8 references=8 · EXIT=0
- `git diff --check` → EXIT=0

## Unverified (คงไว้)

- U1 ปร.3 + VAT/เงินเผื่อ · U2 ตัวเลข ว 475/477/480/481 · U3 `ROUNDDOWN` · U4 แนวทาง ปร.3 กับสัญญา · U5 พิมพ์จริง A4 หลายหน้า · FND-008 อัลกอริทึมปรับลด
- Reviewer ไม่ได้รัน shell เอง (read-only) — ผลรันข้างต้นอ้าง log ของ lead/CI

## G2

**ผ่านเฉพาะ FND-001..FND-007** — ไม่ได้ปิด U1–U5, FND-008, G5 หรือ release gate G4
