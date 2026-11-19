---
name: TPSO Price Integration
description: การดึงราคาวัสดุก่อสร้างจาก สนค. (TPSO index.tpso.go.th) — endpoints, ข้อจำกัด CORS/timeout, การแคช, snapshot-first/fallback, กฎปฏิทินราคาส่วนกลาง และ PriceEvidence ใช้เมื่อแก้ lib/tpso.ts หน้า /prices API ราคา หรือระบบ snapshot
---

# TPSO (สนค.) — การเชื่อมข้อมูลราคาวัสดุก่อสร้าง (v1.1)

เวอร์ชัน 1.1 — 19 พ.ย. 2569 · เจ้าของ: `price-data-steward`
ใช้ร่วมกับ `thai-govt-base-price-rules`

แหล่งราคา: https://index.tpso.go.th/construction-material-prices
เจ้าของข้อมูล: สำนักงานนโยบายและแผนการขนส่ง (สนค.) กระทรวงคมนาคม

## 1. ข้อเท็จจริงเหล็ก

- **TPSO ไม่ส่ง CORS headers** → เรียกจาก **ฝั่งเซิร์ฟเวอร์เท่านั้น** (Server Component / Route Handler) — ห้าม fetch จากเบราว์เซอร์
- ไม่ต้องใช้ API key; เว็บ สนค. เรียก `/api/csrf-token` เองก่อน POST แต่ filter เรียกตรงจากเซิร์ฟเวอร์ได้ (ถ้าเจอ 401 ให้เริ่มหา token)
- payload เต็มปีต่อจังหวัด **~2MB** → ต้องแคช/ใช้ snapshot; ห้ามดึงซ้ำโดยไม่จำเป็น
- ข้อมูลส่วนกลาง ปี 2569 = 6,435 รายการ (ณ วันที่ตรวจ)
- Vercel Hobby `maxDuration = 30` — หน้า `/prices` ตั้งไว้แล้ว

## 2. Endpoints

### `GET https://index.tpso.go.th/api/cmip/master`

หมวดและจังหวัด (แคชได้ยาว):

```json
{ "headCategories": [{ "code": "01", "name": "วัสดุเทหล่อกับที่" }],
  "types": [{ "type": "10", "typeName": "ส่วนกลาง" },
            { "type": "14", "typeName": "พระนครศรีอยุธยา" }] }
```

- `type 10` = ส่วนกลาง; `14+` = จังหวัด

### `POST https://index.tpso.go.th/api/cmip/filter`

```json
{ "YearBase": 2558, "Categories": [], "Search": "",
  "Types": ["40"], "HeadCategories": [], "TimeOption": true,
  "Period": { "StartYear": "2569", "StartMonth": "1", "EndYear": "2569", "EndMonth": "12" } }
```

Response เป็น array — **เดิน `children` แบบ recursive**:

```ts
{ unitName, headCategory, headCategoryName, commodityCode, commodityNameTH,
  years: [{ year, months: [{ priceCur, priceVAT, month, type, typeName }] }],
  children }
```

- `priceCur` เป็น null ได้ — กรองเฉพาะเดือนที่มีราคาแล้วเลือกเดือนสูงสุด
- เก็บ `priceCur` (ไม่รวม VAT) และ `priceVAT` แยก

### `POST https://index.tpso.go.th/api/cmip/search` (ยังไม่ใช้)

body `{ "Keyword": "…" }` — autocomplete

## 3. กฎปฏิทินราคาส่วนกลาง

ตรวจกับระบบ สนค. จริง ณ 13 พ.ย. 2569 (`scripts/tpso-central-months-check.mjs`):

- ราคาส่วนกลาง (type 10) มีครบ 2566–2569 ถึงเดือนก่อนเดือนปัจจุบัน
- **ไม่มีเดือน “ยกเลิกเผยแพร่” จริง** — ข้อสมมติเดิม (ก.ค. 2567 / พ.ค. 2568 / ธ.ค. 2568 / เม.ย. 2569) ถูกหักล้างด้วยข้อมูลจริง
- เดือนอ้างอิง ≥ เดือนที่พิมพ์/เลือก = **ยังไม่ปรากฏในระบบ** (ไม่ใช่ยกเลิก)
- UI/เอกสารต้องเตือน + แนะนำใช้ราคารายจังหวัด/สืบราคาแทน
- `report2569` ใช้ฟิลด์ `notYetPublished` ตามกฎนี้

## 4. แคชและ snapshot-first

### Cache

- `master`: module-scope cache 1 ชั่วโมง
- `prices`: `Map` key `"<type>:<year>"` อายุ 1 ชั่วโมง
- ห้าม cache ข้ามผู้ใช้แบบมีข้อมูลส่วนตัว — ข้อมูลนี้เป็นราคาสาธารณะ

### Snapshot

- ไฟล์: `data/snapshots/prov_<prov>_year_<year>.json` + `master.json`
- `SnapshotMeta`: `prov`, `year`, `fetchedAt` (ISO), `rows`, `source: "tpsolive" | "fallback"`
- `/prices` ใช้ **snapshot-first** → ถ้าไม่มีจึงดึงสด → ถ้าดึงสด fail แต่มี snapshot เก่า ใช้ snapshot + แสดงอายุ
- `snapshotAge > 24 ชั่วโมง` → แสดง warning
- production filesystem อ่านอย่างเดียว — snapshot ถูกเติมโดย GitHub Actions (`.github/workflows/snapshot-refresh.yml`) แล้ว commit
- `next.config.mjs` ต้องมี `outputFileTracingIncludes` สำหรับ `/prices`, `/api/prices/snapshot/[prov]/[year]`, `/api/prices/refresh`
- ห้ามเขียน snapshot จาก request runtime บน production

### Scripts

```powershell
node scripts/make-snapshots.mjs
node scripts/tpso-central-months-check.mjs
```

- `SNAP_PROVS`, `SNAP_YEARS` กำหนดจังหวัด/ปี
- ตรวจผลลัพธ์ก่อน commit; snapshot bot อาจ push แทรก

## 5. PriceEvidence

ทุกครั้งที่ผู้ใช้เลือกราคาจากคลัง:

```ts
type TpsoSource = {
  kind: "tpso";
  code: string;        // commodityCode
  prov: string;        // TPSO type
  provName: string;
  year: number;        // พ.ศ.
  month: number | null;
  priceAtPick: number; // บาท/หน่วย ณ ตอนเลือก
  pickedAt: string;    // ISO
};
```

- ราคา >12 เดือน → `stale` + รายละเอียด
- ส่วนกลางเดือน ≥ เดือนพิมพ์ → `notYetPublished`
- ไม่ระบุแหล่ง → `unstated` + warning
- คลังส่วนตัวต้องมี `note` เหตุผล; ไม่มี → `unstated`
- ห้ามเก็บข้อมูลโครงการจริงใน fixture/เทสต์

## 6. สิ่งที่ต้องตรวจเมื่อแก้ integration

- [ ] เรียกจากเซิร์ฟเวอร์เท่านั้น
- [ ] cache ครอบ (จังหวัด, ปี) และ master
- [ ] เดิน `children` ครบ
- [ ] เลือกราคาล่าสุดตามเดือน กรอง null
- [ ] snapshot-first/fallback + แสดง `fetchedAt`/อายุ
- [ ] `notYetPublished` ตามกฎปฏิทิน
- [ ] error ภาษาไทย + ลิงก์ สนค. ให้ผู้ใช้ตรวจเอง
- [ ] `outputFileTracingIncludes` ครบ
- [ ] ไม่มี fetch จาก client
- [ ] ทดสอบ production หลัง deploy (cold start ~30 วิ)

## 7. Acceptance

- `/prices` ใช้ snapshot ได้เมื่อ TPSO ล่ม
- ป้ายอายุข้อมูล/ที่มาตรง
- ไม่มี client fetch
- snapshot ไม่ถูกเขียนบน production
- evidence ครบทุกเส้นทางเลือก price
