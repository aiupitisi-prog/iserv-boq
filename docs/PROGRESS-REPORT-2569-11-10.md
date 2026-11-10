# รายงานความก้าวหน้า — iServ BOQ (PRD v1.2)

**วันที่รายงาน:** 10 พฤศจิกายน 2569 · **ฐานข้อมูลอ้างอิง:** PRD ฉบับ 1.2 (`docs/PRD.md`) · **Repo:** https://github.com/aiupitisi-prog/iserv-boq (main @ `869c6f7c`) · **Production:** https://iserv-boq.vercel.app

> ⚠️ **ข้อเตือนตามกฎเหล็กของโปรเจกต์:** ตัวเลขกฎหมายทุกตัวในรายงานนี้มาจาก **Yotathai mirror** ไม่ใช่ราชกิจจานุเบกษาโดยตรง — ต้องยืนยันกับต้นฉบับทางการก่อนนำไปคำนวณเอกสารที่ส่งหน่วยงานจริง

---

## 1. สรุปผู้บริหาร (Executive Summary)

| หัวข้อ | สถานะ |
|---|---|
| เฟส 1 — คลังราคา สนค. → BOQ | ✅ เสร็จ |
| เฟส 2 — คลังราคาส่วนตัว + ปัจจุหน้า + ruleset registry | ✅ เสร็จ |
| เฟส 3 — เครื่องยนต์คำนวณ + เอกสาร + Excel | 🟡 เกือบเสร็จ (ประมาณ 80%) |
| เฟส 4 — snapshot / IndexedDB / PWA | 🟡 โค้ดเสร็จ แต่ **ยังไม่ขึ้น production** |
| เฟส 5 — บัญชีผู้ใช้ + ซิงก์ (Supabase) | ⬜ ยังไม่เริ่ม |
| เฟส 6 — วิเคราะห์ราคา / ดัชนี | ⬜ ยังไม่เริ่ม |

**สามประเด็นที่ต้องรู้ก่อนตัดสินใจงานต่อ**

1. **🚨 repo ที่ HEAD ยัง build ไม่ผ่าน → production ค้างที่ build เก่า**
   `package.json` บน GitHub ไม่มี `xlsx` และ `vitest` แต่ `lib/export.ts` มี `typeof import("xlsx")` และไฟล์ `*.test.ts` import `vitest` → `next build` (ซึ่งรัน type-check) จะตกด้วย `TS2307: Cannot find module 'xlsx'` ผลคือ production ยังเป็นเวอร์ชัน **ก่อนเฟส 3/4** (`/rulesets`, `/api/prices/snapshot/...`, `/api/prices/refresh` ตอบ 404)
2. **เส้นประสงค์ค้าง 2 เรื่อง (เป็นแกนของเฟส 3 ที่ยังไม่ปิด)**
   - ชุดตาราง **ว 481 (48 ตาราง)** ถูก generate เสร็จและมี checksum แล้ว แต่ **ยังไม่ถูกต่อเข้ากับเครื่องยนต์คำนวณและหน้า import** — `lib/calc/compute.ts` อ่านแค่ `ruleset.factorF` ตารางเดียว
   - ชุดเอกสารพิมพ์ยังเป็น **10 ฉบับโครงเดิม (ส่วน ก./ข./ค./ง. + S.W.C.)** ไม่ใช่ **9 ชิ้นตามข้อ 11 เล่ม 2** (ปร.1(ก)/ปร.1/ปร.2(ก)/ปร.2/ปร.3/ปร.4 + รายละเอียด Factor F + บันทึกเหตุผลสืบราคา) — GAP ใน PRD §5.4 ยังไม่ปิด
3. **ตัวเลขกฎหมายยังเป็น “ยังไม่ยืนยัน”** — PDF ว 475–481 มาจาก Yotathai มี manifest + sha256 ครบ แต่ยังไม่ได้ยืนยันกับราชกิจจานุเบกษา/เล่มจริง

**สรุปความคืบหน้าโดยรวม: ~68% ของแผน 6 เฟส (เฟส 1–2 เสร็จ เฟส 3 เกือบเสร็จ เฟส 4 เสร็จในโค้ดแต่ไม่ deploy เฟส 5–6 ยังไม่เริ่ม)**

---

## 2. สถานะรายเฟส (เทียบ PRD §6)

| เฟส | ฟีเจอร์หลัก | สถานะ | หลักฐานในโค้ด |
|---|---|---|---|
| **1** | F1.1 ตั้งจังหวัด/ปีงบระดับโปรเจกต์ | ✅ | `lib/boq.ts` (`province`, `budgetYear`), `app/projects/page.tsx` |
| | F1.2 ปุ่ม “เลือกจากคลังราคา” + modal | ✅ | `app/projects/[id]/editor.tsx` (openPicker, แท็บ สนค./ของฉัน) |
| | F1.3 API ค้นหาราคา + meta | ✅ | `app/api/prices/search/route.ts`, `app/api/prices/meta/route.ts` |
| | F1.4 badge ที่มาราคา + `source` | ✅ | `lib/boq.ts` (`sourceLabel`, `sourcePickedAt`), editor badge |
| | F1.5 เตือนราคาเก่า >12 เดือน | ✅ | `docs-client.tsx` (staleItems), editor row warning |
| | F1.6 PriceEvidence | ✅ | `lib/boq.ts` (`PriceEvidence` — รองรับ 2 ชนิด `tpso | private`) |
| **2** | F2.1 คลังราคาส่วนตัว (CRUD + import/export) | ✅ | `app/my-prices/page.tsx`, `lib/pricelist.ts` |
| | F2.2 ปัจจัยราคาระดับโปรเจกต์ | ✅ | `lib/boq.ts` (`ProjectFactors`), โหมด `gov | private` |
| | F2.3 คัดลอกโปรเจกต์/รายการ | ✅ | `app/projects/page.tsx` (`duplicateProject`) |
| | F2.4 Ruleset registry | ✅ | `lib/ruleset.ts` (checksum, `validateFactorFTable`, `supersededBy`), `app/rulesets/page.tsx` |
| **3** | F3.1 จัดลำดับรายการ + ยุบ/ขยายหมวด | 🟡 | มีปุ่ม ▲▼ และ collapse แล้ว · **ยังไม่มีลากสลับ (drag & drop)** |
| | F3.2 เลขหน้า/หัว-ท้าย/ลงชื่อ/บาทถ้วน | ✅ | `app/globals.css` (`@media print`), `lib/bahttext.ts`, `docs-client.tsx` (SigBlock) |
| | F3.3 รูปแบบการพิมพ์ + โหมดเอกชน | ✅ | `docs-client.tsx` |
| | F3.4 ส่งออก Excel (xlsx) / CSV | ✅ | `lib/export.ts` (CSV UTF-8 BOM + xlsx 3 ชีต), ปุ่มใน editor |
| | F3.5 เครื่องยนต์คำนวณราคากลาง `lib/calc/` | ✅ (โครงสร้าง) | `lib/calc/{money,factorf,compute,reduce}.ts` + เวกเตอร์ 39 เคส · **ยังอ่านได้แค่ตาราง Factor F เดียว** |
| | F3.6 เอกสาร 9 ชิ้นตามข้อ 11 เล่ม 2 | ⬜ | ยังเป็นชุด 10 ฉบับโครงเดิม — **GAP ยังไม่ปิด** |
| **4** | F4.1 Snapshot ราคาใน repo | ✅ (โค้ด) | `lib/snapshot.ts`, `data/snapshots/*.json` (5 ไฟล์), `next.config.mjs` (`outputFileTracingIncludes`) |
| | F4.2 Fallback + ป้ายอายุข้อมูล | ✅ (โค้ด) | `app/prices/page.tsx` (`isStale` > 24 ชม.) |
| | F4.3 รีเฟรชรายวัน 04:00 น. | ✅ (โค้ด) | `.github/workflows/snapshot-refresh.yml` (cron `0 21 * * *` UTC) + `scripts/make-snapshots.mjs` |
| | F4.4 IndexedDB + PWA | ✅ (โค้ด) | `lib/storage-idb.ts`, `lib/storage.ts` (migrate + fallback), `public/sw.js`, `public/manifest.json` |
| **5** | F5.1–F5.4 Supabase auth / sync / share link / privacy | ⬜ | ยังไม่มีโค้ด · `app/privacy/page.tsx` ระบุว่าไม่มีเซิร์ฟเวอร์ |
| **6** | F6.1–F6.4 กราฟย้อนหลัง / เทียบจังหวัด / ดัชนี K / แจ้งเตือน | ⬜ | ยังไม่มีโค้ด |

---

## 3. สิ่งที่ทำเสร็จในรอบนี้ (ไฮไลต์)

### 3.1 เฟส 1–2 (ปิดแล้ว)
- เลือกรายการจากคลังราคา สนค. ได้ใน 3 คลิก (เปิด modal → ค้นหา/กรองหมวด → เลือก) พร้อมบันทึก `PriceEvidence` ทุกครั้งที่เลือก — ตรวจสอบย้อนหลังได้
- แยกโหมด `gov` (ราชการ — ไม่มีปัจจัย % อิสระ) กับ `private` (เอกชน — ติดป้าย “ประมาณการ ไม่ใช่ราคากลางตามหลักเกณฑ์” ทุกจุด)
- Ruleset registry เริ่มต้นว่างเปล่า — ไม่มีตัวเลขกฎหมาย hardcode ในโค้ด ✅ ผ่านกฎเหล็ก

### 3.2 เฟส 3 — เครื่องยนต์คำนวณ (F3.5)
`lib/calc/` เป็น pure function ที่บังคับกฎเหล็กของ skill `thai-govt-base-price-rules`:

| ไฟล์ | หน้าที่ | กฎที่บังคับในโค้ด |
|---|---|---|
| `lib/calc/money.ts` | ตัวเงินสตางค์ integer | แปลงบาท→สตางค์ **ครั้งเดียว** ที่ขอบเขต, ปัดเศษ half-up พร้อมบันทึกใน trace |
| `lib/calc/factorf.ts` | หา Factor F | ขอบตาราง = ค่าตรง · ในช่วง = interpolate · **นอกตาราง = throw (ห้าม extrapolate)** |
| `lib/calc/compute.ts` | คำนวณราคากลาง + trace | ก./ข. แยกส่วน · ครุภัณฑ์ **ห้ามเข้าฐาน Factor F** · เงินเผื่อ/ค่าดำเนินงานใช้เฉพาะที่ ruleset ระบุ (ไม่มีค่าจากความจำ) |
| `lib/calc/reduce.ts` | ปรับลดราคาจากผู้เสนอ (แนบท้ายสัญญา) | อัตราปรับลดเดียวทั้ง BOQ · เศษปัดเหวี่ยงเข้ารายการเงินมากสุด → ผลรวมตรงเป้าหมายพอดี · ใช้ BigInt กัน overflow |

ผลทดสอบ: **5 ไฟล์ / 39 เคส ผ่านหมด** (`npm.cmd test`, vitest 5.1.0)

### 3.3 เฟส 4 — ความเร็ว + ความทนทาน (โค้ดเสร็จ)
- Snapshot 5 ไฟล์ใน `data/snapshots/` (prov 10/40 × ปี 2568/2569 + master) — `prov_10_year_2569.json` มี **6,435 แถว** ดึงเมื่อ 9 พ.ย. 2569
- `next.config.mjs` ระบุ `outputFileTracingIncludes` ให้แพ็ก `data/snapshots/**/*` ไปกับ lambda (ไม่งั้นบน Vercel จะอ่าน snapshot ไม่ได้แล้วหลุดไปเรียก สนค. สด)
- GitHub Actions รีเฟรช snapshot รายวัน 04:00 น. (ไทย) แล้ว commit เข้า repo → Vercel build ใหม่
- `lib/storage-idb.ts` — IndexedDB (`iserv-boq-db` v2, stores: projects/pricelist) พร้อม migrate จาก localStorage และ fallback เมื่อใช้ไม่ได้
- PWA: `public/sw.js` (network-first สำหรับ HTML, cache-first สำหรับ `/_next/static`) + `manifest.json`

---

## 4. เส้นประสงค์ที่ค้าง / GAP (สำคัญที่สุด)

### G1 — ชุดตาราง ว 481 (48 ตาราง) ยัง “มีข้อมูลแต่ไม่ถูกใช้” 🔴

| ส่วน | สถานะ | หลักฐาน |
|---|---|---|
| ข้อมูล 48 ตาราง (4 ประเภทงาน × 12 คู่อัตรา) | ✅ มีแล้ว | `lib/ruleset-w481-2569.ts` (180,964 ไบต์ / 2,170 บรรทัด, ไฟล์ GENERATED) |
| ตรวจความถูกต้อง | ✅ | ทุกแถว: Factor F = “รวมในรูป Factor” × 1.07 ตรงทุกช่อง · checksum ต่อตาราง · SET checksum `ea1a96fc615779ec…` · พบจุดพิมพ์เบี่ยงเบน 1 แถว (งานทาง a0-r5 ช่วง 180–190) เก็บค่าตามตัวประกาศ + ป้าย `anomalyNote` |
| Schema รองรับ ว 481 | ✅ | `lib/ruleset.ts` — `workType`, F/G ไม่รวม VAT, D2/D3 (ฝนชุก 1/2), `anomalyNote` + `selectFactorFTable()` + `factorFAt()` |
| **หน้า import `/rulesets` รับชุด 48 ตาราง** | 🔴 **ไม่ได้ทำ** | `app/rulesets/page.tsx` — `prepareImport()` อ่านแค่ `data.factorF` (ตารางเดียว) และ **ไม่มีโค้ดอ่าน `factorFTables` เลย** |
| **เครื่องยนต์คำนวณเลือกตารางตามเงื่อนไข** | 🔴 **ไม่ได้ทำ** | `lib/calc/compute.ts` บรรทัด 124 อ่านแค่ `ruleset.factorF` — ไม่เคยเรียก `selectFactorFTable` / `factorFAt` |
| **UI เลือกเงื่อนไข 4 อัตรา (จ้างล่วงหน้า/ประกันผลงาน/ดอกเบี้ย/VAT + ประเภทงาน)** | 🔴 **ไม่ได้ทำ** | ไม่มีใน editor / docs-client |
| **สคริปต์ตั้งต้น (pdfx/gen-w481.mjs)** | 🟡 ไม่ได้ commit | ไฟล์ header ระบุว่า generate จาก `pdfx/gen-w481.mjs` แต่ทั้งโฟลเดอร์ `pdfx/` ไม่มีใน local copy และไม่มีบน GitHub → **ทำซ้ำ/ตรวจสอบย้อนหลังไม่ได้** |

**ผลกระทบ:** ผู้ใช้ยังคำนวณด้วยตาราง Factor F ตารางเดียว (หรือไม่มีตารางเลย → ไม่ปรับ) — ยังไม่รองรับการเลือกตารางตามประเภทงานและเงื่อนไขสัญญาตามเล่ม 2 ข้อ 9

### G2 — ชุดเอกสารพิมพ์ยังไม่ตรงระเบียบ 2569 🔴

PRD §5.4 กำหนดให้รายงานตามข้อ 11 เล่ม 2 ประกอบด้วย **9 ชิ้น**: ปร.1(ก) · ปร.1 · ปร.2(ก) · ปร.2 · ปร.3 (ถ้ามี) · แบบแสดงการคำนวณและเหตุผลความจำเป็นของค่าใช้จ่ายพิเศษ · ปร.4 · รายละเอียดการหาค่า Factor F · แบบบันทึกแสดงเหตุผลและความจำเป็นการสืบราคาวัสดุ

สถานะจริงใน `app/projects/[id]/docs/docs-client.tsx`:

| ฉบับปัจจุบัน | สถานะเทียบระเบียบ 2569 |
|---|---|
| 1. บันทึกข้อความขออนุมัติจัดทำราคากลาง | คงไว้ (นอกตัว 9 ชิ้น) ✅ |
| 2. รายงานผลการพิจารณาจัดทำราคากลาง | คงไว้ ✅ |
| 3. ร่างประมาณราคา **ส่วน ก.** (ค่าวัสดุ) | ❌ ไม่ใช่แบบฟอร์มระเบียบ |
| 4. ร่างประมาณราคา **ส่วน ข.** (ค่าแรง) | ❌ ไม่ใช่แบบฟอร์มระเบียบ |
| 5. ร่างประมาณราคา **ส่วน ค.** เงินเผื่อจำเป็น | ❌ “เงินเผื่อจำเป็น” **ไม่ปรากฏในโครงการคำนวณของเล่ม 2** (คำว่า “เงินเผื่อ” ไม่พบทั้งเล่ม 1 และ 2 — “การเผื่อ” หมายถึงการเผื่อเพิ่มวัสดุต่อหน่วยตอนถอดแบบ) → ควรหยุดทำฉบับนี้เป็นเอกสารส่ง แต่ต้องยืนยันกับต้นฉบับก่อนตัดออกถาวร |
| 6. ร่างประมาณราคา **ส่วน ง.** ค่าดำเนินงาน (S.W.C.) | ❌ ไม่ใช่แบบฟอร์มระเบียบ |
| 7–10. เปรียบเทียบราคา / สรุปราคากลาง+Factor F+บาทถ้วน+trace / แนบท้ายสัญญา (ปรับลดราคา) | คงไว้ (มีประโยชน์) ✅ · ฉบับที่ 10 ใช้ `computePriceReduction` |

**ผลกระทบ:** เอกสารที่พิมพ์จากระบบยังทำตามโครงแบบเก่า อาจไม่ผ่านการตรวจของหน่วยงานเมื่อใช้กับโครงการจัดจ้างใหม่ (ความเสี่ยง R8 ใน PRD §4)

> **ยังไม่แก้** — ต้องเขียนชุดเอกสาร 9 ชิ้นใหม่ (งานข้อ 4 ในแผนถัดไป) เป็นงานเขียนโค้ดจริง ไม่ใช่แค่สลับ label

### G3 — Production ไม่ได้ deploy เวอร์ชันปัจจุบัน 🔴

**หลักฐาน:** `package.json` บน GitHub มีแค่ `next/react/react-dom` (+ dev: tailwind, types) — **ไม่มี `xlsx` และไม่มี `vitest`** แต่โค้ดใช้ทั้งคู่ และ `tsconfig.json` include `**/*.ts` → `next build` รัน type-check แล้วตก

ยืนยันด้วยการทดสอบ TS แยก: `type X = typeof import("xlsx")` เมื่อไม่มีแพ็กเกจติดตั้ง → `error TS2307: Cannot find module 'xlsx' or its corresponding type declarations.`

ผลกระทบที่วัดได้จริง (ยิง production เมื่อ 10 พ.ย. 2569 ก่อน push):

| เส้นทาง | ผลลัพธ์ | แปลว่า |
|---|---|---|
| `/rulesets` | **404** | หน้า registry (commit 9 พ.ย. 03:05 UTC) ไม่ได้ deploy |
| `/api/prices/snapshot/10/2569` | **404** | F4.1 snapshot ไม่ได้ deploy |
| `/api/prices/refresh` | **404** | F4.3 ไม่ได้ deploy |
| `/api/prices/meta`, `/api/prices/search` | 200 | ใช้งานได้ (ค้นหา ~350 มิลลิวินาทีเมื่อแคชเซิร์ฟเวอร์อุ่น) |
| `/prices` โหลดครั้งแรก (แคชเย็น) | **28 วินาที** | ยังไม่ผ่าน KPI “< 3 วิ” เพราะ build เก่าไม่มี snapshot → ยังดึง สนค. สด |

> ✅ **แก้แล้ว (10 พ.ย. 2569):** เพิ่ม `xlsx` + `vitest` + script `test` ใน `package.json` และ commit `package-lock.json` (ตรวจ `npm ci --dry-run` ผ่าน → Vercel ติดตั้งได้) · build ผ่าน ✅ · เทสต์ 39/39 ✅ · push ขึ้น `main` แล้ว → **ต้องตรวจ production ซ้ำหลัง Vercel build เสร็จ** ว่า `/rulesets` และ `/api/prices/snapshot/...` กลับมา และ `/prices` ลดจาก 28 วิเหลือ < 3 วิ

### G4 — โค้ด local กับ GitHub ไม่ตรงกัน (drift) — ตรวจด้วย `git diff` แล้ว

ติดตั้ง Git 2.56.0 + `git init` + `git fetch origin` + เชื่อม `main` เข้ากับ `origin/main` (@ `869c6f7c`) แล้ว → diff ได้แบบไม่แตะไฟล์งานเลย
ผล: **25 ไฟล์ต่างกัน + 4 ไฟล์ที่มีแค่ฝั่ง local** (69 insertions / 3,540 deletions)

**ฝั่ง local มีของใหม่กว่า (ยังไม่เคย deploy)**

| ไฟล์ | ต่างอะไร | ผลกระทบ |
|---|---|---|
| `package.json` | +`xlsx ^0.18.5`, +`vitest ^5.1.0`, +script `"test": "vitest run"` | **build บน Vercel ตก (G3)** · เทสต์บน CI ไม่ได้ |
| `lib/export.ts` | เพิ่มคอลัมน์ PriceEvidence ใน CSV (`ราคาที่เลือก` + `เลือกเมื่อ`) · `num2` ใช้ epsilon ปัดเศษ half-up · **แก้บั๊ก `fmtCells`** (เดิม `break` ที่แถวว่างคั่นหมวด → หมวดหลังไม่ได้ format ตัวเลข) | remote ส่งออก xlsx ผิดรูปแบบตัวเลขหมวดที่ 2 เป็นต้นไป + CSV ไม่มีที่มาราคา |
| `app/globals.css` | **ลบ** `thead { background: #f1f5f9 !important; }` | remote ยังพิมพ์หัวตารางเป็นสีเทา → ผิดเกณฑ์ F3 “ไม่มีสีพื้นหลังติด” |
| `lib/calc/money.ts` | `toSatang` มี epsilon ±1e-6 (กัน float ตกหล่างครึ่ง เช่น 1.005) | remote ปัดเศษผิดในเคสที่ลงท้าย .005 |
| `lib/calc/compute.ts` | เพิ่ม `notes` ใน trace เรื่องการปัดเศษระดับรายการ (กฎเหล็ก “ทุกจุดปัดเศษบันทึกหมายเหตุใน trace”) + ตัด try/catch ที่ไม่มีความหมาย (พฤติกรรม throw เหมือนเดิม) | remote trace ไม่บอกว่าปัดเศษตรงไหน |
| `lib/calc/money.test.ts` | +2 เคส (`toSatang(1.005) === 101`, `bahtText` ล้านล้าน) | remote ไม่มีเทสต์กันบั๊กนี้ |
| `lib/calc/factorf.test.ts` | เข้ม assertion ขอบช่วง (`expect(r2.factor).toBe(1.25)`) แทน `toContain([1.25,1.3])` | remote ทดสอบผ่านแม้ค่าผิดขอบ (โค้ดเดียวกันผ่านเคสเข้มใน local) |
| `docs/PRD.md` | +4 แถวตารางประวัติ commit + อัปเดตสถานะ ว 481 เป็น “parser เสร็จ” | remote ยังเขียนว่า “⏳ parser → FactorFTable[]” (ล้าสมัย) |
| `package-lock.json`, `vercel.json` | มีแค่ local | lockfile ไม่ถูก commit → dependency ไม่นิ่ง · cron ซ้ำกับแนวทาง F4.3 (GitHub Actions) |
| `docs/xy.pdf` (27 MB) + `docs/PROGRESS-REPORT-2569-11-10.md` | มีแค่ local | เอกสารต้นฉบับเล่ม 1–4 + รายงานนี้ |

**ฝั่ง remote มีของที่ local ไม่มี**

| ไฟล์ | หมายเหตุ |
|---|---|
| `docs/reg-2569/**` (11 ไฟล์ ~35 MB: PDF ว 475–481 + manifest sha256 + extract) | พยานหลักฐานประกาศอยู่แค่บน GitHub — local ดึงมาใช้ยืนยันตัวเลขไม่ได้ |

**Snapshot: remote ใหม่กว่า local**

`data/snapshots/*.json` ทั้ง 5 ไฟล์ต่างกันแค่ `fetchedAt` — remote = `2026-11-09T21:44:14Z` (รอบ GitHub Actions 21:00 UTC) · local = `2026-11-09T03:58:35Z` → **ระบบรีเฟรชอัตโนมัติทำงานถูกต้อง** แค่ local ยังไม่ได้ pull

> สถานะ repo หลังตั้งค่า: `main` เชื่อมกับ `origin/main` แล้ว (`git status` เห็น drift ชัดเจน) · ยัง **ไม่มี commit ใหม่** · `core.autocrlf=false` ตั้งรายโปรเจกต์ (ไม่แตะ global) เพื่อไม่ให้ LF→CRLF เพี้ยน

---

## 5. สถานะ production จริง (วัดเมื่อ 10 พ.ย. 2569)

| หน้า | สถานะ | เวลาตอบ | หมายเหตุ |
|---|---|---|---|
| `/` | 200 | 1.2 วิ | ปกติ |
| `/prices` | 200 | **28.3 วิ (ครั้งแรก)** | ❌ ไม่ผ่าน KPI `< 3 วิ` — build เก่าไม่มี snapshot |
| `/my-prices` | 200 | 0.4 วิ | ปกติ |
| `/commercial`, `/cm`, `/guide`, `/privacy`, `/terms` | 200 | 0.3–0.6 วิ | ปกติ |
| `/rulesets` | **404** | — | build เก่า |
| `/api/prices/meta` | 200 | 1.5 วิ | รายชื่อจังหวัด/หมวดครบ |
| `/api/prices/search` | 200 | ~0.35 วิ (แคชอุ่น) | ค้น “คอนกรีต” 214 / “เหล็ก” 698 / “สายไฟ” 162 รายการ — ตัวกรองชื่อ + รหัสสินค้าใช้ได้ |
| `/api/prices/snapshot/10/2569` | **404** | — | build เก่า |
| `/api/prices/refresh` | **404** | — | build เก่า |

**KPI (PRD §7)**

| ตัวชี้วัด | สถานะปัจจุบัน | เป้าหมายหลังเฟส 4 | ผล |
|---|---|---|---|
| เวลาโหลด `/prices` ครั้งแรก (แคชเย็น) | 28 วิ (production) | < 3 วิ | ❌ ยังไม่ผ่าน (รอ deploy snapshot) |
| เวลาสร้าง BOQ 10 รายการจากคลังราคา | ทำได้ (3 คลิก) | < 3 นาที | ✅ ผ่าน |
| ความพร้อมใช้ของข้อมูลราคาเมื่อ สนค. ล่ม | มีโค้ด fallback + snapshot | ใช้ snapshot ต่อได้ 100% | 🟡 โค้ดพร้อม · ยังไม่ deploy |
| โปรเจกต์ที่สูญหายจากล้างเบราว์เซอร์ | ลดลงแล้ว (IndexedDB) | เหลือเฉพาะผู้ไม่ล็อกอิน (เฟส 5) | 🟡 รอเฟส 5 |

---

## 6. คุณภาพโค้ดและการทดสอบ

| รายการ | ผล |
|---|---|
| `npm.cmd run build` | ✅ ผ่าน — Next.js 15.5.29, 16 routes, First Load JS 103–110 kB |
| `npm.cmd test` | ✅ ผ่าน — 5 ไฟล์ / 39 เคส (vitest 5.1.0, ~3.2 วิ) |
| ขนาดโค้ด | 40 ไฟล์ · **7,796 บรรทัด** (app + lib + scripts) — ไม่รวมไฟล์ข้อมูล GENERATED `lib/ruleset-w481-2569.ts` (2,170 บรรทัด) |
| ไฟล์ที่ใหญ่ที่สุด | `ruleset-w481-2569.ts` 2,170 · `docs-client.tsx` 838 · `editor.tsx` 747 · `rulesets/page.tsx` 307 |
| ความครอบคลุมเทสต์ | เฉพาะ `lib/calc/*` + `lib/export.ts` — **ยังไม่มีเทสต์ของ UI/เอกสารพิมพ์/round-trip ของ snapshot** |
| ความสอดคล้องกฎเหล็ก | ✅ ไม่มีตัวเลขกฎหมาย hardcode ในโค้ด · ✅ เงินเป็นสตางค์ integer ทุกขั้น · ✅ ทุกจุดปัดเศษมีบันทึกใน trace · ✅ disclaimer “ไม่ใช่ราคามาตรฐานของกรมบัญชีกลาง” ยังอยู่ครบ |
| Agents/Skills | 3 agents (`.claude/agents` + `.opencode/agents`) + 3 skills (`.claude/skills`) พร้อมใช้งาน |

---

## 7. ข้อเสนอแผนงานถัดไป (เรียงตามลำดับที่ควรทำ)

| # | งาน | เหตุผล / ผลกระทบ | ประมาณการ |
|---|---|---|---|
| **1** | ✅ **เสร็จแล้ว 10 พ.ย. 2569** — `package.json` (+`xlsx`, +`vitest`, +`test`), `package-lock.json`, และแก้ `lib/export.ts` / `app/globals.css` / `lib/calc/money.ts` / `lib/calc/compute.ts` ที่ local ทำไว้แต่ยังไม่เคย deploy → push ขึ้น `main` แล้ว · `docs/xy.pdf` ย้ายไป `.gitignore` · `vercel.json` ถูกลบ (ให้เหลือแนวทางเดียวคือ GitHub Actions ตาม F4.3) | ปลดล็อก G3 (build ผ่าน → production ได้เฟส 3/4) **และ** ดึงงานที่ค้างอยู่ในเครื่องขึ้น production ในครั้งเดียว | เสร็จ |
| **2** | **ต่อ `factorFTables` เข้า import ของ `/rulesets`** + ให้ `lib/calc/compute.ts` เลือกตารางด้วย `selectFactorFTable()` | ปิด G1 — ทำให้ชุด ว 481 48 ตารางใช้งานได้จริง | 0.5–1 วัน |
| **3** | **เพิ่ม UI เงื่อนไขการใช้ตาราง** (ประเภทงาน + จ้างล่วงหน้า + ประกันผลงาน + ดอกเบี้ย + VAT) ใน editor และกล่อง “เงื่อนไขการใช้ตาราง Factor F” ใน ปร.1(ก) | ตามเล่ม 2 ข้อ 9 ต้องบันทึก 4 อัตราลงเอกสาร | 0.5 วัน |
| **4** | **สร้างชุดเอกสาร 9 ชิ้นตามข้อ 11 เล่ม 2** (ปร.1(ก)/ปร.1/ปร.2(ก)/ปร.2/ปร.3/แบบเหตุผลค่าใช้จ่ายพิเศษ/ปร.4/รายละเอียดการหา F/บันทึกเหตุผลสืบราคา) แล้วหยุดพิมพ์ฉบับ ก./ข./ค./ง. เป็นเอกสารส่ง | ปิด G2 + ลดความเสี่ยง R8 | 1–2 วัน |
| **5** | ยืนยันตัวเลข ว 475–481 กับราชกิจจานุเบกษา/เล่มจริง + commit `pdfx/gen-w481.mjs` (หรือย้ายเข้า `scripts/`) | ทำให้ชุดข้อมูลทวนซ้ำ/ตรวจสอบได้ และถอดป้าย “ยังไม่ยืนยัน” | 0.5 วัน + เวลารอเล่มจริง |
| **6** | สร้างชุดข้อมูล ruleset ว 480 (ค่าแรงถอดแบบ) → แทนช่อง “ค่าแรง 30–37%” เดิม | PRD §5.5 ลำดับถัดไปหลัง ว 481 | 1 วัน |
| **7** | เพิ่มเทสต์: round-trip ของ snapshot, golden test ของเอกสาร 9 ชิ้น, เทสต์ `selectFactorFTable` | ลดความเสี่ยงสูตร/เอกสาร | 0.5 วัน |
| **8** | `git pull` เพื่อดึง snapshot ล่าสุด + `docs/reg-2569/` กลับมา และตัดสินใจ `vercel.json` (เก็บ/ลบ) ให้สอดคล้องกับแนวทาง F4.3 | ลดความสับสน “ของที่ deploy อยู่” · ปัจจุบัน git พร้อมแล้ว | 15 นาที |
| **9** | เฟส 5 (Supabase auth/sync/share) → เฟส 6 (ดัชนี K/แจ้งเตือน) | ตามลำดับ PRD · ทำหลัง 1–8 | 6–9 วัน |

---

## 8. ภาคผนวก — วิธีตรวจสอบและข้อจำกัดของรายงานนี้

**ตรวจสอบด้วยอะไร**
- โค้ด: อ่านไฟล์จริงทั้งหมดใน `app/`, `lib/`, `scripts/`, `.github/`, `data/` (local) + เทียบกับ GitHub ผ่าน MCP (`aiupitisi-prog/iserv-boq`, main @ `869c6f7c`, 30 commits, 0 PR, 0 issue)
- **Git (ติดตั้งใหม่ 10 พ.ย. 2569):** `git init` + `git remote add origin` + `git fetch origin` + เชื่อม `main` เข้ากับ `origin/main` → `git diff` ได้ drift จริง 25 ไฟล์ (ตารางใน §G4) โดยไม่แก้ไฟล์งาน
- Build/เทสต์: `npm.cmd run build` ✅ · `npm.cmd test` ✅ (39/39)
- Production: ยิงจริงทุก route ของ interest + วัดเวลาตอบ
- TS: ทดสอบ `TS2307` ใน temp dir เพื่อยืนยันสาเหตุที่ build ตก

**ข้อจำกัด**
- รอบนี้ commit + push ขึ้น `main` แล้ว (10 พ.ย. 2569) แต่ **ยังไม่ได้ตรวจ production หลัง Vercel build** — ต้องยิงซ้ำหลัง build เสร็จ (~1–2 นาที) ว่า `/rulesets` · `/api/prices/snapshot/...` กลับมา และ `/prices` เร็วขึ้น
- ไม่ได้เปิดหน้าแอปด้วยเบราว์เซอร์จริง (ไม่ได้ตรวจการพิมพ์ A4 ด้วยตา/กระดาษจริง)
- ไม่ได้ยืนยันกับราชกิจจานุเบกษา — ตัวเลขทุกตัวยังเป็น “ยืนยันกับต้นฉบับทางการ”
- ค่าเวลาที่วัดเป็นครั้งเดียวจากเครือข่ายนี้ ไม่ใช่ค่าเฉลี่ย
- `git` ติดตั้งแล้วแต่เซสชัน OpenCode ที่รันอยู่ยังใช้ PATH เก่า → เรียกด้วย `& "C:\Program Files\Git\cmd\git.exe"` หรือเปิด Terminal ใหม่

**เอกสารที่ต้องอ่านคู่กัน:** `docs/PRD.md` (ฉบับ 1.2) · `.claude/skills/thai-govt-base-price-rules/SKILL.md` (เช็กลิสต์กฎหมาย) · `.claude/skills/tpso-price-integration/SKILL.md` (รูปแบบ PriceEvidence/snapshot) · `.claude/skills/iserv-boq-dev-workflow/SKILL.md` (ข้อตกลง deploy)
