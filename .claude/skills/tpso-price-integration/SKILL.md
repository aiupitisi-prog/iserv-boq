---
name: TPSO Price Integration
description: การดึงราคาวัสดุก่อสร้างจาก สนค. (TPSO index.tpso.go.th) — endpoints, ข้อจำกัด CORS/timeout, การแคช, เดือนที่ยกเลิกเผยแพร่ราคาส่วนกลาง, snapshot และ PriceEvidence ใช้เมื่อแก้ lib/tpso.ts หน้า /prices API ราคา หรือระบบ snapshot
---

# TPSO (สนค.) — การเชื่อมข้อมูลราคาวัสดุก่อสร้าง

แหล่งราคา: https://index.tpso.go.th/construction-material-prices
เจ้าของข้อมูล: สำนักงานนโยบายและแผนการขนส่ง (สนค.) กระทรวงคมนาคม

## ข้อเท็จจริงเหล็ก

- **TPSO ไม่ส่ง CORS headers** → เรียกได้จาก**ฝั่งเซิร์ฟเวอร์เท่านั้น** (Server Component / Route Handler) — ห้าม fetch จากเบราว์เซอร์
- ไม่ต้องใช้ API key เว็บ สนค. เรียก `/api/csrf-token` เองก่อน POST แต่พบว่า filter เรียกตรงจากเซิร์ฟเวอร์ได้โดยไม่ต้องมี token (ถ้าอนาคตเจอ 401 ให้เริ่มจากการหา token)
- payload เต็มปีต่อจังหวัด **~2MB** → ต้องแคชทุกครั้ง ห้ามดึงซ้ำโดยไม่จำเป็น
- ปริมาณข้อมูล: ส่วนกลาง ปี 2569 = 6,435 รายการ

## Endpoints

### `GET https://index.tpso.go.th/api/cmip/master`
หมวดและจังหวัด (ข้อมูลค่อนข้างคงที่ — แคชได้ยาว):
```json
{ "headCategories": [{ "code": "01", "name": "วัสดุเทหล่อกับที่" }],  // 21 หมวด (01–21)
  "types": [{ "type": "10", "typeName": "ส่วนกลาง" },
            { "type": "14", "typeName": "พระนครศรีอยุธยา" }] }        // 10 = ส่วนกลาง, 14+ = จังหวัด
```

### `POST https://index.tpso.go.th/api/cmip/filter`
ดึงราคาตามเงื่อนไข:
```json
{ "YearBase": 2558, "Categories": [], "Search": "",
  "Types": ["40"], "HeadCategories": [], "TimeOption": true,
  "Period": { "StartYear": "2569", "StartMonth": "1", "EndYear": "2569", "EndMonth": "12" } }
```
- Response เป็น array — **ต้องเดิน `children` แบบ recursive**
- โครงสร้าง: `{ unitName, headCategory, headCategoryName, commodityCode, commodityNameTH, years: [{ year, months: [{ priceCur, priceVAT, month, type, typeName }] }], children }`
- `priceCur` เป็น null ได้ — กรองเฉพาะเดือนที่มีราคาแล้วเลือกเดือนสูงสุด

### `POST https://index.tpso.go.th/api/cmip/search` (ยังไม่ได้ใช้)
body `{ "Keyword": "…" }` — autocomplete ชื่อสินค้า

## ราคาส่วนกลาง สนค. — กฎปฏิทิน (แทนรายชื่อเดือนตายตัว)

ตรวจกับระบบ สนค. จริง ณ 13 พ.ย. 2569 (`scripts/tpso-central-months-check.mjs`): ราคาส่วนกลาง (type 10) มีครบ 2566–2569 ถึงเดือนก่อนเดือนปัจจุบัน — **ไม่มีเดือน "ยกเลิกเผยแพร่" จริง** (ข้อสมมติเดิม ก.ค.2567 / พ.ค.2568 / ธ.ค.2568 / เม.ย.2569 ถูกหักล้างด้วยข้อมูลจริง)
→ สนค. เผยแพร่ราคาหลังสำรวจจบ ดังนั้นเดือนอ้างอิง ≥ เดือนที่พิมพ์/เลือก = ยังไม่ปรากฏในระบบ → UI ต้องเตือน + ให้ใช้ **ราคารายจังหวัดเป็นหลัก** (ใช้กฎนี้แล้วใน `lib/report2569.ts` — ฟิลด์ `notYetPublished`)

## แคชปัจจุบัน (`lib/tpso.ts`)

- master: module-scope cache 1 ชั่วโมง
- prices: `Map` key `"<type>:<year>"` อายุ 1 ชั่วโมง
- หน้า `/prices` ตั้ง `export const maxDuration = 30` (Vercel Hobby)

## Snapshot และ fallback (เฟส 4 ของ PRD)

- เก็บ snapshot ล่าสุดต่อ (จังหวัด, ปี) — เมื่อ TPSO ล่ม ใช้ snapshot + แสดง **"ข้อมูล ณ <วันที่>"** ชัดเจน
- Vercel Cron รายวัน: รีเฟรชจังหวัด/ปียอดนิยม
- อายุราคาเกิน 12 เดือน → flag ใน PriceEvidence

## PriceEvidence (เฟส 1–2)

ทุกครั้งที่ผู้ใช้เลือกราคาจากคลังราคามาใส่ BOQ ต้องบันทึก:
```ts
{ source: "tpso", commodityCode, prov, year, month, priceAtPick, pickedAt }
```
เพื่อตรวจสอบย้อนหลังและเตือนเมื่อราคาเก่า แหล่งอื่น (ราคาส่วนตัว/ตารางค่าแรง) ต้องมีเหตุผลกำกับ

## เช็กลิสต์เมื่อแก้ integration

1. เรียกจากเซิร์ฟเวอร์เท่านั้น
2. แคชครอบ (จังหวัด, ปี)
3. เดิน `children` ครบ
4. เลือกราคาล่าสุดตามเดือน กรอง null ออก
5. error → ข้อความภาษาไทย + ลิงก์เว็บ สนค. ให้ผู้ใช้ไปตรวจเอง
6. ทดสอบบน production หลัง deploy — แคชเย็นรอบแรกอาจใช้เวลา ~30 วิ (Vercel Hobby maxDuration)
