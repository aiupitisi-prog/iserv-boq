# รายงานความก้าวหน้า — iServ BOQ (PRD v1.2) · 13 พฤศจิกายน 2569

**วันที่รายงาน:** 13 พฤศจิกายน 2569
**Repo:** https://github.com/aiupitisi-prog/iserv-boq · **Production:** https://iserv-boq.vercel.app
**ต่อเนื่องจาก:** `PROGRESS-REPORT-2569-11-12-G2.md` (ปิด GAP G2) → แผน §6: ตรวจข้อสมมติ unverified · สกัด ว 480 · ว 477 → ว 475 · export BOQ ข้อ 20

---

## 1. สรุปผู้บริหาร

| หัวข้อ | สถานะ |
|---|---|
| ข้อสมมติ #3 (เดือน สนค. ยกเลิกเผยแพร่ราคาส่วนกลาง) | ✅ **ปิดด้วยหลักฐานจริง** — เปลี่ยนเป็นกฎปฏิทิน `notYetPublished` |
| **ว 480 บัญชีค่าแรงงาน/ดำเนินการ (45 หน้า)** | ✅ **สกัดเป็นชุดข้อมูล + import/export + checksum ครบ** |
| Compliance review (boq-compliance-reviewer) | รอบ 1 ❌ FAIL (fix 9 · note 8) → **แก้ครบ 9 ข้อ** → ตรวจซ้ำ ✅ |
| เทสต์ | ✅ **131/131 ผ่าน (9 ไฟล์)** — ว 480 = 19 เคส |
| tsc / build | ✅ ผ่านทั้งคู่ |
| งานถัดไป | ว 477 (ค่าขนส่ง 280 หน้า) → ว 475 (เครื่องจักร 91 หน้า) · export BOQ ข้อ 20 |

---

## 2. ข้อสมมติ #3 — ตรวจกับระบบ สนค. จริง (ปิด)

`scripts/tpso-central-months-check.mjs` ยิง API สนค. (`index.tpso.go.th`) เมื่อ 13 พ.ย. 2569:

| ปี | เดือนที่มีราคาส่วนกลาง (type 10) | จำนวนรายการ |
|---|---|---|
| 2566–2568 | ทุกเดือน | 2,788–4,650 |
| 2569 | ม.ค.–ต.ค. | 4,462–5,511 |
| 2569 | พ.ย.–ธ.ค. | 0 (ยังไม่ถึงรอบเผยแพร่) |

- เดือนที่เคยเชื่อว่า "ยกเลิกเผยแพร่" (ก.ค.2567 · พ.ค.–มิ.ย.2568 · ธ.ค.2568 · เม.ย.2569) **มีราคาจริงครบ** (4,020 / 4,455 / 4,650 / 4,462 รายการ)
- `temp/tpso-central-carry-check.mjs`: ทุกเดือนมีสัดส่วนราคาเปลี่ยน 3–18% (เดือนก่อนหน้า 82–97% คงเดิม) = พฤติกรรมสำรวจปกติ ไม่มีเดือน carried-forward พิเศษ
- **สรุป:** ไม่มี "รายชื่อเดือนยกเลิก" ในระบบ — เปลี่ยนเป็น **กฎปฏิทิน**: เดือนอ้างอิง ≥ เดือนที่พิมพ์ = `notYetPublished` (ลบ `TPSO_CENTRAL_CANCELLED` ออกจาก `lib/report2569.ts`; เทสต์ 3 เคส; ป้ายชิ้น 9 อัปเดต)

---

## 3. ว 480 — ชุดข้อมูลบัญชีค่าแรงงาน (งานหลักรอบนี้)

### 3.1 ตัวเลขที่สกัดได้

| รายการ | ค่า |
|---|---|
| หน้า PDF | 45 (ดิจิทัล, text layer) |
| รายการทั้งหมด | **294** |
| แบ่งกลุ่ม | 1 งานโครงสร้างวิศวกรรม **51** · 2 งานสถาปัตยกรรม **157** · 3 ระบบสุขาภิบาล/ดับเพลิง **16** · 4 ระบบไฟฟ้า/สื่อสาร **59** · 5 ระบบปรับอากาศ/ระบายอากาศ **11** |
| ระดับ | 1 = 5 · 2 = 104 · 3 = 155 · 4 = 30 |
| แถวราคา (tier) | **515** |
| Bullet/variant ที่มีราคา | **956** |
| หมายเหตุท้ายบัญชี | **3 ข้อ** |
| ค่าแรงเหมารวมนอกบัญชี | **30–37% ของยอดค่าวัสดุ** (ดึงจากหมายเหตุข้อ 1) |
| checksum ชุด | `2060d31c60ac1ed8` |
| checksum ruleset | `f15226a818ecc23e` |
| sha256 w480.pdf | `65e87e15576cbe5cef9593e68b0702b6bad279180845ca5beef27738d76b2e16` |
| sha256 extract | `760f6ef41289c8a0cbcdb459d107961a92c5d95b607ae96680b624764a04a538` |

### 3.2 วิธีสกัด (`scripts/parse-w480.mjs`)

- **geometry จาก mupdf** ไม่ใช่ text flow: คอลัมน์จาก x0 (no <68 · name <300 · unit <340 · price <385 · note ≥385), แถว = กลุ่ม y ±4, state ต่อเนื่องข้ามหน้า
- **normalizer สระ 2 ขั้น**: collapse whitespace → `ำ→า` → `" า"→ำ` (ครอบทั้ง 3 ฟอนต์; ตรวจแล้วไม่มี "จานวน/กาหนด" แบบไม่มี space)
- **ข้อยกเว้นที่ตรวจจากตัวประกาศจริง:**
  - พิมพ์ลำดับ `2.68` (ควรเป็น 2.6.8) → เก็บ `noPrinted` + `anomaly` ไม่แก้ต้นฉบับ
  - ชื่อรายการตัดบรรทัด (วงเล็บ เช่น `(เสาเข็ม คอร. รูปกลมกลวง)`) → รวมกลับเป็นชื่อ entry
  - bullet เชิงหมายเหตุ (`- ไม่รวมงาน...`) และ variant ที่ไม่มีราคาทั้ง subtree → ย้ายเป็น `notes`
- **fail loudly:** ราคาไม่ใช่บาทเต็ม · ลำดับซ้ำ/กระโดด (รายพ่อแม่) · บรรทัดตารางหลุดขอบ · จำนวนหน้าไม่ตรง · **sha256 ของ PDF ไม่ตรงที่ pin** → throw พร้อมหน้า+y
- **`--dry` / `--strict`**: `--strict` ล้มเหลวเมื่อมี issues; ไฟล์ generated บันทึก `notes`/`issues` ไว้ในหัวไฟล์ (`W480_2569_QUALITY = { notes: 89, issues: 0 }`)

### 3.3 โครงสร้างที่เพิ่มใน `lib/ruleset.ts`

- `WagePriceRow` / `WageVariant` / `WageEntry` / `WageSchedule` · `Ruleset.wageSchedule?` · `Ruleset.wageScheduleChecksum?` · `Ruleset.provenance?`
- `rulesetChecksum` ใส่ `wageSchedule` **เฉพาะเมื่อมี entries** → ชุดกฎเดิม checksum ไม่เปลี่ยน (backward compatible)
- `getW480Ruleset()`: `labor` จากหมายเหตุข้อ 1 · `provenance = mirror-unverified` · schedule ถูก freeze ลึกกัน mutate
- `verifyW480Checksums()`: ตรวจรายรายการ + ชุด + **ruleset checksum** + checksum ของรายการที่ไม่มีอยู่

### 3.4 Import/export (`lib/ruleset-import.ts`)

- ตรวจโครงสร้างเข้มเท่า parser: `no` รูป `1.2.3` ไม่ซ้ำ · `level` ตรงกับจำนวนช่วง · ราคาเป็นบาทเต็ม **> 0** · ฟิลด์ข้อความถูกชนิด · `notices` เป็น string
- `wageScheduleChecksum` pattern เดียวกับ `setChecksum` (ไฟล์ถูกตัด/แก้ภายหลัง = ปฏิเสธ)
- `entries` ว่าง = ถือว่าไม่ระบุ (ตรงกับ comment เดิม)
- `provenance` ผ่าน round-trip (ไม่รวมใน checksum)

---

## 4. Compliance review — รอบ 1 FAIL → แก้ครบ → ผ่าน

| # | ข้อบกพร่อง (รอบ 1) | การแก้ |
|---|---|---|
| B1 | `30/37` hardcode 2 ที่ใน generator | ดึงจาก `W480_2569_NOTICES[0]` ด้วย regex, ต้องมีคู่เดียว/สมเหตุสมผล ไม่งั้น fail |
| B2 | เทสต์ยืนยัน 30–37 ด้วย literal | เทสต์ถอดค่าจากหมายเหตุข้อ 1 แล้วเทียบ `W480_2569_LABOR` |
| B3 | ชื่อรายการ 24 จุดเพี้ยน (บรรทัดต่อชื่อไปติดแถวราคา) | ต่อวงเล็บกลับเป็น `entry.name` + เทสต์ `toBe` แบบ strict |
| B4 | `verifyW480Checksums` ไม่ตรวจ ruleset checksum | เพิ่ม `__RULESET__` + ตรวจ orphan key |
| B5 | warning ไม่ strict / บรรทัดถูกตัดเงียบ | แยก `notes`/`issues` · `--strict` · ตรวจจับเลขในคอลัมน์ค่าแรงที่หลุดขอบ |
| B6 | manifest ไม่มีแถว extract ของ w480 / sha เป็น prefix | เพิ่มแถว extract + sha256 เต็ม + pin sha ใน parser |
| B7 | เทสต์ไม่ตรวจ sha256 ของ PDF จริง | เพิ่มเทสต์อ่าน `docs/reg-2569/w480.pdf` แล้วเทียบ |
| B8 | ไม่มีเทสต์ backward-compat ของ wageSchedule | เพิ่ม 4 เคส (undefined/null/entries ว่าง + ไฟล์เก่า + price 0/level ผิด) |
| B9 | `sourceUrl`/provenance ไม่มีในระดับ data | เพิ่ม `sourceUrl` + `provenance` (mirror-unverified) ใน dataset/import |

**ผลตรวจซ้ำ:** issues = 0 · เทสต์ 131/131 · tsc ผ่าน · build ผ่าน

---

## 5. ยืนยันคุณภาพข้อมูล (spot-check กับ extract)

- `1.1` = 95/97/133 · 112/114/159 · 132/135/183 บาท/ต้น
- `1.2.1.10` = 2,691 / 3,008 / 3,326 บาท/ต้น + ชื่อรวม `(เสาเข็ม คอร. รูปกลมกลวง)`
- `2.6.8` (พิมพ์ `2.68`) = 205 บาท/ชุด
- `5.9` dia 4"–12" = 26/31/31/36/41/46/51/62 บาท/เมตร
- `5.10` Linear Slot Diffuser LSD-1..4 = 138/267/374/492 บาท/เมตร
- หมายเหตุ 3 ข้อประกอบข้าม y ถูกต้อง (ข้อ 1 มีทั้ง "เหมารวมร้อยละ 30 - 37" และส่วนขยาย "และหรือความขาดแคลนของแรงงาน...")
- ข้อความสะอาด: 0 "จ านวน" · 0 "งำน" · 0 U+FFFD · แถวราคาไม่มีหน่วย = 0

---

## 6. ข้อสมมติ / unknown ที่ยังต้องยืนยันก่อนใช้ส่งราชการ

| # | เรื่อง | สถานะ |
|---|---|---|
| U1 | sha256 ของ `w480.pdf` ตรงกับไฟล์จริง | ✅ ปิด — เทสต์ + pin ใน parser |
| U2 | เนื้อหาเหมือนต้นฉบับราชกิจจานุเบกษา/เล่มจริง (ไฟล์ที่ใช้เป็น Yotathai mirror) | ⚠️ ยัง — provenance `mirror-unverified` |
| U3 | ตัวสะกดจาก text layer เช่น "ผู้หน้าที่" (ข้อ 1), "Reture Air Grille" | ⚠️ เก็บตาม text layer — ต้องเทียบตัวพิมพ์ |
| U4 | reproducibility ของ parser | ✅ `--strict` ผ่าน, stats ตรง, checksum คงที่ |
| U5 | วันมีผลบังคับใช้ (`effectiveFrom` = วันลงหนังสือ 26 มิ.ย. 2569) | ⚠️ ยังไม่ยืนยันวันมีผล |
| U6 | ว 480 แทนบัญชีค่าแรงงานฉบับก่อนหรือไม่ (ต้องตั้ง `supersededBy`) | ⚠️ ยัง — ต้องตรวจประกาศ |
| U7 | ครบทุกแถว 45 หน้า (ไม่มีแถวหลุด y<95/y>800) | ✅ guard ใน parser (ไม่พบเลขในคอลัมน์ค่าแรงนอกช่วง) |
| U8 | เทสต์ผ่านในเครื่องนี้ | ✅ 131/131 |
| U9 | ถ้อยคำหมายเหตุข้อ 1 ("ให้ใช้คิดเหมารวม" vs "ใช้คิดเหมารวม") | ⚠️ เก็บตาม text layer |

---

## 7. Commits รอบนี้

1. `feat(lib): TPSO calendar rule` — `lib/report2569.ts` / `.test.ts` / `reg2569-client.tsx` + docs/skills/agents + `scripts/tpso-central-months-check.mjs`
2. `feat(lib): w480 wage schedule dataset` — `scripts/parse-w480.mjs` · `scripts/extract-pdf-pages.mjs` · `lib/ruleset-w480-2569.ts` · `.test.ts` · `lib/ruleset.ts` · `lib/ruleset-import.ts` · tests · `docs/reg-2569/extract/w480-pages.txt` · `mupdf` devDependency
3. `docs: PRD 5.5 + manifest + reg-2569 README + progress report`

`temp/` ยัง untracked (เครื่องมือวิเคราะห์: w480-geom/gaps/scan/inspect/names/dump-line, tpso-central-carry-check)

---

## 8. ขั้นถัดไป

1. **ว 477 ค่าขนส่ง** (280 หน้า, ~41,660 ค่า) — เริ่มจากสำรวจ geometry รายหน้า (โครงตารางจังหวัด × ระยะ)
2. **ว 475 เครื่องจักรงานทาง** (91 หน้า) — ค่าดำเนินการ + ค่าเสื่อมราคา
3. **Export BOQ ตามข้อ 20** (Excel/BOQ)
4. ปิด U2/U5/U6 ด้วยการเทียบราชกิจจานุเบกษา/เล่มจริง
