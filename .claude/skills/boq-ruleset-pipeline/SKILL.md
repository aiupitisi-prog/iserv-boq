---
name: BOQ Ruleset Pipeline
description: ขั้นตอนนำเข้า/อัปเดต ruleset ของ iServ BOQ จากประกาศ PDF — manifest, parser, checksum, provenance, import validation และการตั้ง supersededBy ใช้เมื่อมีประกาศ/ตาราง/อัตราใหม่หรือแก้ lib/ruleset-import.ts
---

# BOQ Ruleset Pipeline

เวอร์ชัน 1.0 — 19 พ.ย. 2569 · เจ้าของ: `price-data-steward`
ใช้ร่วมกับ `thai-govt-base-price-rules`, `tpso-price-integration`

## ใช้เมื่อ

- มีประกาศ/หนังสือเวียน/ตาราง Factor F/ค่าแรง/ค่าขนส่ง/ค่าเครื่องจักรใหม่
- ต้อง regenerate `lib/ruleset-w475/477/480/481-2569.ts`
- ต้อง import JSON ruleset หรือตรวจ checksum
- ต้องตั้ง `supersededBy` หรือเพิ่ม `notices`
- ต้องตอบว่าตัวเลขในระบบยัง `mirror-unverified` หรือไม่

## 1. ลำดับแหล่งอ้างอิง

| ลำดับ | แหล่ง | ใช้เมื่อ |
|---|---|---|
| 1 | ราชกิจจานุเบกษา / ต้นฉบับทางการ | ยืนยันตัวเลขก่อนใช้จริง |
| 2 | ประกาศ/หนังสือเวียนของหน่วยงานทางการ | ตรวจเลขที่/วันที่/ขอบเขต |
| 3 | Mirror (เช่น Yotathai) | ใช้ extracting ชั่วคราว — ต้องติดป้าย |

> ห้ามใช้บล็อก/สรุป/ความจำเป็นแหล่งตัวเลข; ถ้าไม่มีต้นฉบับให้ตอบ `unverified`

## 2. Manifest

ก่อน parse ทุกครั้ง ต้องมี/อัปเดต `docs/reg-2569/manifest.md`:

- ชื่อไฟล์, เลขที่หนังสือ, วันที่ลง, จำนวนหน้า, ขนาดไบต์
- sha256 ของ PDF
- มี text layer หรือเป็นสแกน
- วันที่ดาวน์โหลด + URL
- สถานะ provenance (`official` / `mirror-unverified`)

ไฟล์ PDF/สแกนใหม่ **ห้าม commit** เว้นแต่ได้รับอนุมัติ; เก็บใน `temp/` (gitignored)

## 3. Parser

| ไฟล์ | คำสั่ง | หมายเหตุ |
|---|---|---|
| ว 475 | `node scripts/parse-w475.mjs --dry` แล้ว `--strict` | 91 หน้า, 20 ลำดับงาน |
| ว 477 | `node scripts/parse-w477.mjs --dry` แล้ว `--strict` | 280 หน้า, 3 ประเภทรถ |
| ว 480 | `node scripts/parse-w480.mjs --dry` แล้ว `--strict` | 45 หน้า, 294 รายการ |
| ว 481 | ใช้ generator ภายนอก/ไฟล์ที่มีอยู่ | 48 ตาราง (4 ประเภทงาน × 12) |

กฎ parser:

- ตรวจ sha256 ของ PDF กับค่าที่ pin ในไฟล์ generated/parser
- ตรวจจำนวนหน้า/ลำดับหัวข้อ/จำนวนคอลัมน์
- normalize สระไทยเฉพาะที่รู้สาเหตุ (เช่น อำ) — ห้ามแก้ตัวเลข
- fail loudly: throw พร้อมหน้า/บรรทัด
- `--strict` ต้องได้ issues = 0 ก่อน generate
- อย่าแก้ไฟล์ generated ด้วยมือ — regenerate จาก parser; ถ้าจำเป็นต้องแก้ metadata ให้บันทึกเหตุผล

## 4. Checksum

| ระดับ | ฟิลด์ |
|---|---|
| ตารางเดี่ยว | `FactorFTable` / row checksum |
| ชุดตาราง | `setChecksum` (`W481_2569_SET_CHECKSUM`) |
| บัญชีค่าแรง | `wageScheduleChecksum` |
| ค่าขนส่ง | `transportScheduleChecksum` |
| ค่าเครื่องจักร | `machineryScheduleChecksum` |
| Ruleset | `rulesetChecksum()` |

- `rulesetChecksum` ครอบเฉพาะเนื้อหาตัวเลขกฎหมาย ไม่รวม metadata อย่าง `effectiveFrom`/`provenance`
- การเพิ่ม field ใหม่ต้องไม่ทำให้ checksum ของชุดเก่าเปลี่ยนโดยไม่จำเป็น
- ถ้า checksum ไม่ตรง → ห้าม import

## 5. Import validation (`lib/ruleset-import.ts`)

`prepareImport(raw)` ต้องตรวจ:

- JSON ถูกต้อง, `provenance.sourceKind` เป็น `official` หรือ `mirror-unverified`
- `effectiveFrom` เป็น ISO date; ปี ค.ศ. 1900–2100
- `factorFTables` ช่วงต่อเนื่อง, ไม่มีตารางซ้ำ, `vatPct` ถูกช่วง
- `wageSchedule` ลำดับต่อเนื่อง, ราคาเป็นบาทเต็ม > 0, ไม่มี entry ซ้ำ
- `transportSchedule` ช่วงน้ำมันต่อเนื่อง, เงินเป็นสตางค์เต็ม > 0, ระยะทางเริ่ม/ความยาวตารางสอดคล้อง และระยะ 201–1000 กม. คิดแบบ กม.ละ
- `machinerySchedule` 5 คอลัมน์ยาวเท่า items, `op + dep = total`, ค่าเสื่อมคงที่
- checksum ที่ไฟล์ระบุต้องตรงกับที่คำนวณใหม่
- ถ้าไฟล์อ้าง `wageScheduleChecksum`/`transportScheduleChecksum`/`machineryScheduleChecksum`/`setChecksum` แต่ไม่มีข้อมูล → throw

## 6. Provenance

| ค่า | ความหมาย | การแสดงผล |
|---|---|---|
| `official` | ยืนยันกับราชกิจจานุเบกษา/ต้นฉบับแล้ว | แสดงที่มาได้ |
| `mirror-unverified` | สกัดจาก mirror ยังไม่ยืนยัน | ต้องมีป้ายเตือนทุกจุดที่แสดงราคา |

- `notices` ต้องเก็บเงื่อนไข/หมายเหตุจากประกาศ
- ห้ามลบ `mirror-unverified` เพื่อให้ดูผ่าน
- การเปลี่ยนเป็น `official` ต้องมีหลักฐาน: หน้า/ข้อ/วันที่ตรวจ + ผู้ตรวจ

## 7. Superseded

- ตั้ง `supersededBy` เมื่อมีประกาศใหม่ที่แทนที่จริงและมี ruleset ใหม่ให้ชี้
- เพิ่ม `warn` notice อธิบายขอบเขต/วันมีผล
- โปรเจกต์ที่ pin ชุดเก่าต้องเห็นคำเตือนบนหน้าพิมพ์/สัญญา
- ห้ามตั้ง `supersededBy` จากความจำหรือ speculation

## 8. ขั้นตอนมาตรฐาน (R4)

1. Lead เขียน brief: ประกาศ/เล่ม/หน้า/ขอบเขต
2. Steward อัปเดต manifest + ตรวจ sha256
3. Steward parse `--dry` → ตรวจ issues → `--strict`
4. Steward generate/import + checksum + tests
5. **Human** ยืนยันตัวเลขกับต้นฉบับ + อนุมัติ
6. Reviewer ตรวจ provenance/checksum/ไม่ hardcode
7. QA รัน full suite + build + release
8. Lead บันทึก `docs/reg-2569/README.md` + progress report

## 9. ข้อห้าม

- ห้าม auto-apply ขึ้น production
- ห้าม commit PDF/สแกนใหม่โดยไม่ได้รับอนุมัติ
- ห้ามแก้ตัวเลขในไฟล์ generated ด้วยมือ
- ห้ามลบ/ลด notices หรือ provenance
- ห้ามใช้ `effectiveFrom` เป็นวันลงหนังสือเวียนถ้าไม่ใช่วันมีผล
- ห้ามอ้าง “ตรวจราชกิจจานุเบกษาแล้ว” ถ้าไม่ได้เปิดต้นฉบับจริง

## 10. Acceptance

- manifest ครบ + sha256 ตรง
- parser `--strict` issues = 0
- import tests ผ่าน
- checksum ครบและตรง
- provenance แสดงถูกทุกจุด
- human sign-off (R4)
- reviewer PASS
- ไม่มีไฟล์ PDF/สแกน/temp หลุด commit
