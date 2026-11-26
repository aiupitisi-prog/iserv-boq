# Release evidence — pilot W2 fixes (FND-001..FND-007)

Date: 26 พ.ย. 2569 (2026-11-26)
Commit: `b5549a09cdec08d15582925b11ed834f724aaf3c`
Branch: `main`
Scope: ปิด finding จาก pilot W2 baseline audit (G2 เฉพาะ FND-001..FND-007)

## Gate status

| Gate | ผล | หลักฐาน |
|---|---|---|
| G0 brief/risk | ผ่าน | `docs/agent-ops/briefs/2026-11-23-pilot-w2-audit.md`, `docs/agent-ops/plans/2026-11-23-pilot-w2-fixes.md` |
| G1 tests/tsc/build | ผ่าน | vitest 19 ไฟล์ / 314 เทสต์ · tsc EXIT=0 · build EXIT=0 |
| G2 compliance | ผ่านเฉพาะ FND-001..FND-007 | `docs/agent-ops/reviews/2026-11-26-pilot-w2-rereview.md` — block 0 / fix 0 / note 6 |
| G3 docs/skills | ผ่าน | audit + re-review + plan + open questions อัปเดต; `verify:agents` PASS |
| G4 release | ผ่าน | CI `45845567076` success · Vercel success · prod 200 · tree clean |
| G5 human sign-off | **ยังไม่ผ่าน** | U1–U5 / FND-008 ต้องมีแหล่ง/human ตามเดิม |

## Commands

- `npx vitest run` → **19 ไฟล์ / 314 เทสต์ ผ่านทั้งหมด** · EXIT=0 (baseline 18/307)
- `npx tsc --noEmit` → EXIT=0
- `npm run build` → EXIT=0 (Next.js 15.5.29, 16 หน้า)
- `npm run verify:agents` → PASS agents=6 skills=8 references=8 · EXIT=0
- `git diff --check` → EXIT=0
- รันซ้ำหลัง rebase บน `origin/main` (snapshot bot 3 commits) แล้ว — ผลเหมือนกัน

## CI / Vercel / production

- CI run: `45845567076` (workflow `ci`) → success
- Vercel commit status: success — https://vercel.com/aiupitisi-7393/iserv-boq/6dKfqpEbhzwMMQHPeAr5KuGPS92X
- Production smoke:
  - https://iserv-boq.vercel.app/ → 200
  - https://iserv-boq.vercel.app/rulesets → 200
  - https://iserv-boq.vercel.app/prices → 200
  - https://iserv-boq.vercel.app/projects → 200
- `git status` หลัง push: clean, `main` ตรงกับ `origin/main`

## สิ่งที่แก้

- **FND-001** — `computePriceReduction` บล็อกแนบท้ายสัญญาเมื่อมีแถว ปร.3 ทุกกรณี (รวม amount 0) และนับจำนวนจาก array ทั้งหมด
- **FND-002** — หน้าพิมพ์ reg2569 แสดงชื่อชุดกฎ/effectiveFrom/checksum/provenance/notices ทั้ง footer และบล็อกบนแผ่นแรก; กรณีไม่มีชุดกฎแสดง unverified
- **FND-003** — `lib/ruleset-w481-meta.ts` เติม provenance mirror-unverified + notice ที่เส้นทางติดตั้ง โดยไม่แก้ไฟล์ GENERATED; idempotent และผ่าน `prepareImport`
- **FND-004** — เทสต์ golden ลำดับชีต 12/8 และจำนวนแผ่น 13/6 (ไม่ใช้สูตร implementation สร้าง expected)
- **FND-005** — เพิ่ม bahtText literal 2 เคส (`4,235,857` และ `125,000` สตางค์)
- **FND-006** — พิมพ์ superseded warning บนแผ่นแรกด้วย `print-warn`
- **FND-007** — วันที่พิมพ์ในสัญญาใช้ state ครั้งเดียว ไม่เรียก `new Date()` ใน render

## Follow-up (note 6 ข้อ — ไม่บล็อก release)

N-01 `reg2569` date hydration · N-02 ป้ายปี unverified บนหัวพิมพ์ · N-03 sourceDoc/checksum เต็มบนกระดาษ · N-04 bahtText literal ใน contract test · N-05 helper official-provenance edge · N-06 ข้อความแนะนำลบแถว ปร.3 ว่าง

## Unverified (คงไว้)

U1 ปร.3 + VAT/เงินเผื่อ · U2 ตัวเลข ว 475/477/480/481 · U3 `ROUNDDOWN` · U4 แนวทาง ปร.3 กับสัญญา · U5 พิมพ์จริง A4 หลายหน้า · FND-008 อัลกอริทึมปรับลด

## หมายเหตุพฤติกรรม

โครงการที่มีแถว ปร.3 (แม้ยอด 0) จะถูกบล็อกจากแนบท้ายสัญญาจนกว่าจะลบแถวออกหรือมีแนวทางที่ยืนยันได้ — เป็นการปิดช่องเดิมที่ยอด 0 หลุด guard
