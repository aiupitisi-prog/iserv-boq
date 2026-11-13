// ตรวจ + เตรียม ruleset จาก JSON ที่ผู้ใช้นำเข้า (pure — ไม่แตะ DOM/storage จึงทดสอบด้วย Vitest ได้)
//
// ⚠️ กฎเหล็ก (skill thai-govt-base-price-rules):
// - ระบบตรวจ "โครงสร้าง/ความสมเหตุสมผลของตาราง" เท่านั้น — ไม่ตรวจว่าตัวเลขถูกตามกฎหมาย
//   (ผู้นำเข้าต้องอ้างเอกสารต้นทางเอง — sourceDoc บังคับ)
// - checksum ผูกกับเนื้อหาตาราง (รวมชุดตาราง factorFTables ของ ว 481) — แก้ไฟล์ภายหลัง = ตรวจพบ
import type { FactorFTable, MachineryRateSchedule, Ruleset, TransportSchedule, WageSchedule, WorkTypeCode } from "./ruleset";
import { computeChecksum, rulesetChecksum, validateFactorFTable } from "./ruleset";

const WORK_TYPES: readonly WorkTypeCode[] = ["building", "road", "bridge", "irrigation"];

// ตรึงข้อมูลที่นำเข้าแบบลึก — กันผู้เรียกเผลอแก้ตารางหลังตรวจ checksum แล้ว
// (checksum ถูกคำนวณตอน import; ถ้าข้อมูลเปลี่ยนภายหลังโดยไม่คำนวณใหม่ checksum จะไม่ตรงกับเนื้อหา)
function deepFreeze<T>(v: T): T {
  if (Array.isArray(v)) {
    for (const x of v) deepFreeze(x);
    return Object.freeze(v) as T;
  }
  if (v && typeof v === "object") {
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
    return Object.freeze(v);
  }
  return v;
}

// ตรวจโครงสร้างบัญชีค่าแรงงาน (ว 480) — โครงสร้างเท่านั้น ไม่ตรวจว่าค่าถูกตามกฎหมาย
// เข้มเท่ากับ parser (scripts/parse-w480.mjs): ลำดับรูปแบบ/ไม่ซ้ำ, ระดับตรงกับจำนวนช่วง, ราคาเป็นบาทเต็ม > 0
function wageScheduleError(s: WageSchedule, where = "wageSchedule"): string | null {
  if (typeof s !== "object" || s === null || Array.isArray(s)) return `${where} ไม่ถูกต้อง — ต้องเป็น object { entries, notices }`;
  if (!Array.isArray(s.entries)) return `${where}.entries ต้องเป็น array ของรายการ`;
  if (!Array.isArray(s.notices) || s.notices.some((n) => typeof n !== "string"))
    return `${where}.notices ต้องเป็น array ของข้อความ`;
  const seen = new Set<string>();
  for (let i = 0; i < s.entries.length; i++) {
    const e = s.entries[i] as WageSchedule["entries"][number];
    const w = `${where}.entries[${i}] (no=${String((e as { no?: unknown }).no)})`;
    if (typeof e !== "object" || e === null || Array.isArray(e)) return `${w} ไม่ถูกต้อง — ต้องเป็น object ของรายการ`;
    if (typeof e.no !== "string" || !/^\d+(?:\.\d+)*$/.test(e.no))
      return `${w}.no ต้องเป็นข้อความลำดับรูป "1" หรือ "1.2.3"`;
    if (seen.has(e.no)) return `${w}.no ซ้ำ (${e.no}) — ลำดับต้องไม่ซ้ำ`;
    seen.add(e.no);
    if (typeof e.name !== "string" || !e.name) return `${w}.name ต้องเป็นข้อความ`;
    if (![1, 2, 3, 4].includes(e.level)) return `${w}.level ต้องเป็น 1, 2, 3 หรือ 4`;
    if (e.level !== e.no.split(".").length)
      return `${w}.level (${e.level}) ไม่ตรงกับจำนวนช่วงของ no (${e.no} = ${e.no.split(".").length} ช่วง)`;
    if (!Array.isArray(e.notes) || e.notes.some((n) => typeof n !== "string")) return `${w}.notes ต้องเป็น array ของข้อความ`;
    if (!Array.isArray(e.prices)) return `${w}.prices ต้องเป็น array ของแถวราคา`;
    for (let j = 0; j < e.prices.length; j++) {
      const p = e.prices[j] as WageSchedule["entries"][number]["prices"][number];
      if (typeof p !== "object" || p === null || Array.isArray(p)) return `${w}.prices[${j}] ไม่ถูกต้อง — ต้องเป็น object ของแถวราคา`;
      const perr = priceRowError(p, `${w}.prices[${j}]`);
      if (perr) return perr;
    }
    const checkVariants = (vs: WageSchedule["entries"][number]["variants"], path: string): string | null => {
      if (vs === undefined || vs === null) return null;
      if (!Array.isArray(vs)) return `${path} ต้องเป็น array ของ variant`;
      for (let k = 0; k < vs.length; k++) {
        const v = vs[k] as NonNullable<WageSchedule["entries"][number]["variants"]>[number];
        if (typeof v !== "object" || v === null || Array.isArray(v)) return `${path}[${k}] ไม่ถูกต้อง — ต้องเป็น object ของ variant`;
        if (typeof v.name !== "string" || !v.name) return `${path}[${k}].name ต้องเป็นข้อความ`;
        if (!Array.isArray(v.prices)) return `${path}[${k}].prices ต้องเป็น array ของแถวราคา`;
        for (let j = 0; j < v.prices.length; j++) {
          const p = v.prices[j] as WageSchedule["entries"][number]["prices"][number];
          if (typeof p !== "object" || p === null || Array.isArray(p)) return `${path}[${k}].prices[${j}] ไม่ถูกต้อง`;
          const perr = priceRowError(p, `${path}[${k}].prices[${j}]`);
          if (perr) return perr;
        }
        const sub = checkVariants(v.children, `${path}[${k}].children`);
        if (sub) return sub;
      }
      return null;
    };
    const verr = checkVariants(e.variants, `${w}.variants`);
    if (verr) return verr;
  }
  return null;
}

// แถวราคาเดียว — ราคาต้องเป็นบาทเต็ม > 0 (ตัวประกาศไม่มีราคา 0) และฟิลด์ข้อความต้องเป็น string
function priceRowError(p: { price: number; unit?: string; name?: string; note?: string }, path: string): string | null {
  if (typeof p.price !== "number" || !Number.isFinite(p.price) || !Number.isInteger(p.price) || p.price <= 0)
    return `${path}.price ต้องเป็นจำนวนเต็มบาทที่มากกว่า 0 (ตัวประกาศพิมพ์เป็นบาทเต็ม)`;
  for (const k of ["unit", "name", "note"] as const) {
    if (p[k] !== undefined && typeof p[k] !== "string") return `${path}.${k} ต้องเป็นข้อความ (ถ้ามี)`;
  }
  return null;
}

// ตรวจโครงสร้างตารางค่าขนส่ง (ว 477) — โครงสร้าง/ความต่อเนื่องเท่านั้น ไม่ตรวจว่าค่าถูกตามกฎหมาย
// เข้มเท่ากับ parser (scripts/parse-w477.mjs): จำนวนเงินเป็นสตางค์จำนวนเต็ม > 0, ช่วงน้ำมันต่อเนื่อง,
// อัตรา 201–1000 กม. เริ่มต่อจากระยะสุดท้ายของตาราง, ราคา/ตัน กับ /ลบ.ม. มีความยาวเท่ากันและไม่ลดลงตามระยะ
// หมายเหตุ: sections = [] ถือว่า "ไม่ระบุตาราง" (ไม่ใช่โครงสร้างผิด) — prepareImport จะตัดทิ้ง
function transportScheduleError(s: TransportSchedule, where = "transportSchedule"): string | null {
  if (typeof s !== "object" || s === null || Array.isArray(s)) return `${where} ไม่ถูกต้อง — ต้องเป็น object { distanceStartKm, sections, conditions, fuelPriceBasis, notices, unit }`;
  if (!Array.isArray(s.sections)) return `${where}.sections ต้องเป็น array ของประเภทารถ`;
  if (s.sections.length === 0) return null;
  if (s.unit !== "satang") return `${where}.unit ต้องเป็น "satang" (ชุดนี้เก็บจำนวนเงินเป็นสตางค์จำนวนเต็ม)`;
  if (!Number.isInteger(s.distanceStartKm) || s.distanceStartKm <= 0) return `${where}.distanceStartKm ต้องเป็นจำนวนเต็มบวก`;
  if (!Array.isArray(s.conditions) || s.conditions.length === 0 || s.conditions.some((c) => typeof c !== "string" || !c.trim()))
    return `${where}.conditions ต้องเป็น array ของข้อความเงื่อนไขหัวตาราง (อย่างน้อย 1) — เงื่อนไขการใช้ตารางต้องมาพร้อมข้อมูล`;
  if (typeof s.fuelPriceBasis !== "string" || !s.fuelPriceBasis.trim())
    return `${where}.fuelPriceBasis ต้องเป็นข้อความระบุฐานราคาน้ำมันตามหัวตาราง`;
  if (!Array.isArray(s.notices) || s.notices.some((n) => typeof n !== "string")) return `${where}.notices ต้องเป็น array ของข้อความ`;
  const seenCombo = new Set<string>();
  for (let i = 0; i < s.sections.length; i++) {
    const sec = s.sections[i];
    const w = `${where}.sections[${i}]`;
    if (typeof sec !== "object" || sec === null || Array.isArray(sec)) return `${w} ไม่ถูกต้อง — ต้องเป็น object ของประเภทรถ`;
    if (typeof sec.truckType !== "string" || !sec.truckType) return `${w}.truckType ต้องเป็นข้อความ`;
    if (typeof sec.titlePrinted !== "string" || !sec.titlePrinted.trim()) return `${w}.titlePrinted ต้องเป็นข้อความหัวตารางตามที่พิมพ์`;
    if (!Number.isInteger(sec.lorryCount) || sec.lorryCount <= 0) return `${w}.lorryCount ต้องเป็นจำนวนเต็มบวก`;
    if (typeof sec.hasTrailer !== "boolean") return `${w}.hasTrailer ต้องเป็น boolean`;
    if (typeof sec.maxGrossTons !== "number" || !Number.isFinite(sec.maxGrossTons) || sec.maxGrossTons <= 0)
      return `${w}.maxGrossTons ต้องเป็นตัวเลขบวก`;
    const combo = `${sec.lorryCount}|${sec.hasTrailer}`;
    if (seenCombo.has(combo)) return `${w}: ประเภทารถซ้ำ (${sec.lorryCount} ล้อ · พ่วง=${sec.hasTrailer}) — เลือกได้ไม่ชัดเจน`;
    seenCombo.add(combo);
    if (!Array.isArray(sec.bands) || sec.bands.length === 0) return `${w}.bands ต้องเป็น array ของช่วงราคาน้ำมัน`;
    let prevFuelMin = -Infinity;
    for (let j = 0; j < sec.bands.length; j++) {
      const b = sec.bands[j];
      const bw = `${w}.bands[${j}]`;
      if (typeof b !== "object" || b === null || Array.isArray(b)) return `${bw} ไม่ถูกต้อง — ต้องเป็น object ของช่วงราคาน้ำมัน`;
      for (const k of ["fuelMinSatang", "fuelMaxSatang", "avgFuelSatang", "farMinKm", "farMaxKm", "farPerTonSatang", "farPerM3Satang"] as const) {
        if (!Number.isInteger(b[k]) || b[k] <= 0) return `${bw}.${k} ต้องเป็นจำนวนเต็มบวก (สตางค์/กม.)`;
      }
      if (!(b.fuelMaxSatang > b.fuelMinSatang)) return `${bw}: fuelMaxSatang ต้องมากกว่า fuelMinSatang`;
      if (!(b.fuelMinSatang > prevFuelMin)) return `${bw}: ช่วงราคาน้ำมันต้องเรียงจากน้อยไปมาก (fuelMinSatang ${b.fuelMinSatang} ไม่มากกว่าช่วงก่อนหน้า ${prevFuelMin})`;
      prevFuelMin = b.fuelMinSatang;
      if (b.avgFuelSatang < b.fuelMinSatang || b.avgFuelSatang > b.fuelMaxSatang)
        return `${bw}: ค่าเฉลี่ยน้ำมัน (${b.avgFuelSatang}) ต้องอยู่ในช่วง ${b.fuelMinSatang}–${b.fuelMaxSatang}`;
      if (!(b.farMaxKm > b.farMinKm)) return `${bw}: farMaxKm ต้องมากกว่า farMinKm`;
      const n = Array.isArray(b.perTonSatang) ? b.perTonSatang.length : -1;
      if (n <= 0) return `${bw}.perTonSatang ต้องเป็น array ของราคาต่อตัน (อย่างน้อย 1 ระยะ)`;
      if (!Array.isArray(b.perM3Satang) || b.perM3Satang.length !== n)
        return `${bw}: perTonSatang กับ perM3Satang ต้องมีจำนวนระยะเท่ากัน (${n} ≠ ${Array.isArray(b.perM3Satang) ? b.perM3Satang.length : "ไม่ใช่ array"})`;
      for (let k = 0; k < n; k++) {
        if (!Number.isInteger(b.perTonSatang[k]) || b.perTonSatang[k] <= 0) return `${bw}.perTonSatang[${k}] ต้องเป็นจำนวนเต็มบวก (สตางค์)`;
        if (!Number.isInteger(b.perM3Satang[k]) || b.perM3Satang[k] <= 0) return `${bw}.perM3Satang[${k}] ต้องเป็นจำนวนเต็มบวก (สตางค์)`;
        if (k > 0) {
          if (b.perTonSatang[k] < b.perTonSatang[k - 1])
            return `${bw}: perTonSatang ลดลงเมื่อระยะทางเพิ่ม (ระยะ ${s.distanceStartKm + k} กม.: ${b.perTonSatang[k - 1]} → ${b.perTonSatang[k]} สตางค์) — ราคาต้องไม่ลดลงตามระยะ`;
          if (b.perM3Satang[k] < b.perM3Satang[k - 1])
            return `${bw}: perM3Satang ลดลงเมื่อระยะทางเพิ่ม (ระยะ ${s.distanceStartKm + k} กม.: ${b.perM3Satang[k - 1]} → ${b.perM3Satang[k]} สตางค์) — ราคาต้องไม่ลดลงตามระยะ`;
        }
      }
      // ตารางต้องสิ้นสุดก่อนช่วง "กม.ละ" 1 กม. (เช่น ระยะ 1–200 แล้วต่อด้วย 201–1000)
      if (b.farMinKm !== s.distanceStartKm + n) return `${bw}: farMinKm (${b.farMinKm}) ต้องเท่ากับระยะสุดท้ายของตาราง + 1 (${s.distanceStartKm + n})`;
      if (!Array.isArray(b.sourcePages) || b.sourcePages.length !== 2 || b.sourcePages.some((p) => !Number.isInteger(p) || p <= 0))
        return `${bw}.sourcePages ต้องเป็น [หน้าแรก, หน้าที่สอง] ของ PDF ต้นฉบับ`;
      if (!(b.sourcePages[0] < b.sourcePages[1]))
        return `${bw}.sourcePages ต้องเรียงจากน้อยไปมาก (หน้าแรก ${b.sourcePages[0]} < หน้าที่สอง ${b.sourcePages[1]})`;
      if (j > 0) {
        const prev = sec.bands[j - 1];
        if (b.fuelMinSatang !== prev.fuelMaxSatang + 1)
          return `${bw}: ช่วงราคาน้ำมันไม่ต่อเนื่อง (ช่วงก่อนหน้าจบ ${prev.fuelMaxSatang} แต่ช่วงนี้เริ่ม ${b.fuelMinSatang})`;
      }
    }
  }
  return null;
}

// ตรวจโครงสร้างตารางค่าดำเนินการ/ค่าเสื่อมราคา (ว 475) — โครงสร้าง/ความสอดคล้องภายในเท่านั้น
// เข้มเท่ากับ parser (scripts/parse-w475.mjs): เงินเป็นสตางค์จำนวนเต็ม > 0, 5 คอลัมน์ยาวเท่า items,
// บรรทัดราคาเต็มต้องเป็น operation + dep = total (ทั้งปกติ/ฝนชุก), บรรทัดค่าก้อนเดียวมีเฉพาะค่าดำเนินการ,
// บรรทัดหัวเรื่องไม่มีราคา, ช่วงน้ำมันต่อเนื่อง, ค่าเสื่อมราคาคงที่ทุกช่วง, ค่าดำเนินการไม่ลดลงเมื่อน้ำมันแพงขึ้น
// หมายเหตุ: bands = [] ถือว่า "ไม่ระบุตาราง" (ไม่ใช่โครงสร้างผิด) — prepareImport จะตัดทิ้ง
function machineryScheduleError(s: MachineryRateSchedule, where = "machinerySchedule"): string | null {
  if (typeof s !== "object" || s === null || Array.isArray(s))
    return `${where} ไม่ถูกต้อง — ต้องเป็น object { titlePrinted, fuelPriceBasis, items, bands, unit }`;
  if (!Array.isArray(s.items)) return `${where}.items ต้องเป็น array ของบรรทัดรายการ`;
  if (!Array.isArray(s.bands)) return `${where}.bands ต้องเป็น array ของช่วงราคาน้ำมัน`;
  if (s.bands.length === 0) return null;
  if (s.unit !== "satang") return `${where}.unit ต้องเป็น "satang" (ชุดนี้เก็บจำนวนเงินเป็นสตางค์จำนวนเต็ม)`;
  if (typeof s.titlePrinted !== "string" || !s.titlePrinted.trim())
    return `${where}.titlePrinted ต้องเป็นข้อความหัวตารางตามที่พิมพ์`;
  if (typeof s.fuelPriceBasis !== "string" || !s.fuelPriceBasis.trim())
    return `${where}.fuelPriceBasis ต้องเป็นข้อความระบุฐานราคาน้ำมันตามหัวตาราง`;
  if (s.items.length === 0) return `${where}.items ต้องมีอย่างน้อย 1 บรรทัด`;

  const seen = new Set<string>();
  for (let i = 0; i < s.items.length; i++) {
    const it = s.items[i];
    const w = `${where}.items[${i}]`;
    if (typeof it !== "object" || it === null || Array.isArray(it)) return `${w} ไม่ถูกต้อง — ต้องเป็น object ของบรรทัดรายการ`;
    if (!Number.isInteger(it.entryNo) || it.entryNo <= 0) return `${w}.entryNo ต้องเป็นจำนวนเต็มบวก (ลำดับในเอกสาร)`;
    if (typeof it.entryName !== "string" || !it.entryName.trim()) return `${w}.entryName ต้องเป็นข้อความชื่อลำดับ`;
    if (typeof it.label !== "string" || !it.label.trim()) return `${w}.label ต้องเป็นข้อความชื่อบรรทัด`;
    if (it.unit !== null && (typeof it.unit !== "string" || !it.unit.trim()))
      return `${w}.unit ต้องเป็นข้อความหน่วย หรือ null (ต้นฉบับไม่พิมพ์หน่วย)`;
    if (it.priced !== "five" && it.priced !== "lump" && it.priced !== "none")
      return `${w}.priced ต้องเป็น "five" | "lump" | "none"`;
    if (!Number.isInteger(it.occurrence) || it.occurrence <= 0) return `${w}.occurrence ต้องเป็นจำนวนเต็มบวก`;
    if (it.priced !== "none" && it.unit === null) return `${w}: "${it.label}" มีราคาแต่ไม่มีหน่วย — ต้นฉบับต้องพิมพ์หน่วย`;
    if (it.priced === "none" && it.unit !== null) return `${w}: "${it.label}" ไม่มีราคาแต่มีหน่วย — โครงสร้างไม่ตรงต้นฉบับ`;
    const key = `${it.entryNo}|${it.label}|${it.occurrence}`;
    if (seen.has(key)) return `${w}: รายการซ้ำ (ลำดับ ${it.entryNo} · ${it.label} · ครั้งที่ ${it.occurrence}) — ค้นหาไม่ชัดเจน`;
    seen.add(key);
  }

  const COLS = ["operationSatang", "depNormalSatang", "depRainySatang", "totalNormalSatang", "totalRainySatang"] as const;
  const n = s.items.length;
  let prevMax = -Infinity;
  for (let j = 0; j < s.bands.length; j++) {
    const b = s.bands[j];
    const bw = `${where}.bands[${j}]`;
    if (typeof b !== "object" || b === null || Array.isArray(b)) return `${bw} ไม่ถูกต้อง — ต้องเป็น object ของช่วงราคาน้ำมัน`;
    if (!Number.isInteger(b.fuelMinSatang) || b.fuelMinSatang <= 0) return `${bw}.fuelMinSatang ต้องเป็นจำนวนเต็มบวก (สตางค์/ลิตร)`;
    if (!Number.isInteger(b.fuelMaxSatang) || b.fuelMaxSatang <= 0) return `${bw}.fuelMaxSatang ต้องเป็นจำนวนเต็มบวก (สตางค์/ลิตร)`;
    if (!(b.fuelMaxSatang > b.fuelMinSatang)) return `${bw}: fuelMaxSatang ต้องมากกว่า fuelMinSatang`;
    if (j > 0 && b.fuelMinSatang !== prevMax + 1)
      return `${bw}: ช่วงราคาน้ำมันไม่ต่อเนื่อง (ช่วงก่อนหน้าจบ ${prevMax} แต่ช่วงนี้เริ่ม ${b.fuelMinSatang})`;
    prevMax = b.fuelMaxSatang;
    if (!Array.isArray(b.sourcePages) || b.sourcePages.length !== 2 || b.sourcePages.some((p) => !Number.isInteger(p) || p <= 0))
      return `${bw}.sourcePages ต้องเป็น [หน้าแรก, หน้าที่สอง] ของ PDF ต้นฉบับ`;
    if (!(b.sourcePages[0] < b.sourcePages[1]))
      return `${bw}.sourcePages ต้องเรียงจากน้อยไปมาก (หน้าแรก ${b.sourcePages[0]} < หน้าที่สอง ${b.sourcePages[1]})`;
    if (j > 0 && b.sourcePages[0] !== s.bands[j - 1].sourcePages[1] + 1)
      return `${bw}.sourcePages ไม่ต่อเนื่องจากช่วงก่อนหน้า (${s.bands[j - 1].sourcePages[1]} → ${b.sourcePages[0]})`;
    for (const c of COLS) {
      if (!Array.isArray(b[c])) return `${bw}.${c} ต้องเป็น array ของราคา (length = items)`; 
      if (b[c].length !== n) return `${bw}.${c} ต้องมี ${n} ค่า (ตามจำนวน items) แต่พบ ${b[c].length}`;
      for (let k = 0; k < n; k++) {
        const v = b[c][k];
        if (v !== null && (!Number.isInteger(v) || v <= 0)) return `${bw}.${c}[${k}] ต้องเป็นจำนวนเต็มบวก (สตางค์) หรือ null`;
      }
    }
    for (let k = 0; k < n; k++) {
      const it = s.items[k];
      const [op, dn, dr, tn, tr] = COLS.map((c) => b[c][k]);
      if (it.priced === "five") {
        if (op === null || dn === null || dr === null || tn === null || tr === null)
          return `${bw}: "${it.label}" (ราคา 5 ค่า) ต้องมีครบทั้ง 5 คอลัมน์`;
        if (op + dn !== tn) return `${bw}: "${it.label}" — ค่าดำเนินการ ${op} + ค่าเสื่อมราคาปกติ ${dn} ≠ รวมปกติ ${tn} (สตางค์)`;
        if (op + dr !== tr) return `${bw}: "${it.label}" — ค่าดำเนินการ ${op} + ค่าเสื่อมราคาฝนชุก ${dr} ≠ รวมฝนชุก ${tr} (สตางค์)`;
        if (dr < dn) return `${bw}: "${it.label}" — ค่าเสื่อมราคาฝนชุก (${dr}) ต้องไม่น้อยกว่าปกติ (${dn})`;
      } else if (it.priced === "lump") {
        if (op === null) return `${bw}: "${it.label}" (ค่าก้อนเดียว) ต้องมีค่าดำเนินการ`;
        if (dn !== null || dr !== null || tn !== null || tr !== null)
          return `${bw}: "${it.label}" (ค่าก้อนเดียว) ต้องมีเฉพาะค่าดำเนินการ ช่องอื่นต้องเป็น null`;
      } else if (op !== null || dn !== null || dr !== null || tn !== null || tr !== null) {
        return `${bw}: "${it.label}" (หัวเรื่องไม่มีราคา) ต้องเป็น null ทุกช่อง`;
      }
    }
  }

  // ข้ามช่วงน้ำมัน: ค่าเสื่อมราคา/ค่าก้อนเดียวคงที่ · ค่าดำเนินการไม่ลดลงเมื่อน้ำมันแพงขึ้น
  const first = s.bands[0];
  for (let k = 0; k < n; k++) {
    const it = s.items[k];
    if (it.priced === "none") continue;
    if (it.priced === "lump") {
      if (s.bands.some((b) => b.operationSatang[k] !== first.operationSatang[k]))
        return `${where}: "${it.label}" (ค่าก้อนเดียว) เปลี่ยนค่าระหว่างช่วงราคาน้ำมัน — ต้นฉบับต้องคงที่`;
      continue;
    }
    if (s.bands.some((b) => b.depNormalSatang[k] !== first.depNormalSatang[k]))
      return `${where}: "${it.label}" — ค่าเสื่อมราคาปกติไม่คงที่ข้ามช่วงราคาน้ำมัน — ต้นฉบับต้องคงที่`;
    if (s.bands.some((b) => b.depRainySatang[k] !== first.depRainySatang[k]))
      return `${where}: "${it.label}" — ค่าเสื่อมราคาฝนชุกไม่คงที่ข้ามช่วงราคาน้ำมัน — ต้นฉบับต้องคงที่`;
    for (let j = 1; j < s.bands.length; j++) {
      const prev = s.bands[j - 1].operationSatang[k] as number;
      const cur = s.bands[j].operationSatang[k] as number;
      if (cur < prev)
        return `${where}: "${it.label}" — ค่าดำเนินการลดลงเมื่อราคาน้ำมันแพงขึ้น (ช่วง ${s.bands[j].fuelMinSatang}: ${prev} → ${cur} สตางค์)`;
    }
  }
  return null;
}

// ตรวจพารามิเตอร์หัวตาราง (ตัวเลขครบ) — where เช่น "factorF" หรือ "factorFTables[3]"
function headerError(t: FactorFTable, where: string): string | null {
  for (const k of ["advancePct", "retentionPct", "interestPct", "vatPct"] as const) {
    if (typeof t[k] !== "number") return `${where}.${k} ต้องเป็นตัวเลข`;
  }
  return null;
}

// คืน (ruleset พร้อม checksum ที่คำนวณเอง, คำเตือน) หรือ throw Error(ข้อความไทย)
export async function prepareImport(raw: string): Promise<{ rs: Ruleset; note: string }> {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("JSON ไม่ถูกต้อง — ตรวจรูปแบบไฟล์อีกครั้ง");
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error("โครงสร้างไม่ถูกต้อง — ต้องเป็น object ของชุดกฎ");
  const name = String(data.name ?? "").trim();
  const sourceDoc = String(data.sourceDoc ?? "").trim();
  const effectiveFrom = String(data.effectiveFrom ?? "").trim();
  if (!name) throw new Error("ต้องมี name (ชื่อชุดกฎ)");
  if (!sourceDoc) throw new Error("ต้องมี sourceDoc (เอกสารต้นทางทางการ) — ห้ามนำเข้าชุดกฎไม่ระบุที่มา");
  if (!effectiveFrom) throw new Error("ต้องมี effectiveFrom (วันที่เริ่มมีผล)");

  // — ตารางเดี่ยว (factorF) — รูปแบบเดิมของเฟส 2
  const factorF = data.factorF as FactorFTable | undefined;
  if (factorF !== undefined) {
    if (typeof factorF !== "object" || factorF === null || !Array.isArray(factorF.rows)) throw new Error("factorF ไม่ถูกต้อง — ต้องมี advancePct/retentionPct/interestPct/vatPct และ rows");
    const hdr = headerError(factorF, "factorF");
    if (hdr) throw new Error(hdr);
    const err = validateFactorFTable(factorF);
    if (err) throw new Error(`ตาราง Factor F ไม่ผ่านการตรวจ: ${err}`);
  }

  // — ชุดตารางหลายตาราง (factorFTables) — รูปแบบประกาศ ว 481 (48 ตาราง)
  // ว่าง (array ว่าง) = ถือว่าไม่ระบุชุด — เครื่องยนต์ถือว่าไม่มีชุดตารางเช่นกัน ตัดทิ้งเพื่อให้ checksum เทียบเท่าแบบไม่มีชุด
  const rawTables = data.factorFTables;
  let factorFTables: FactorFTable[] | undefined;
  let setNote = "";
  // setChecksum = checksum เฉพาะ array ของชุดตาราง (กันการตัด factorFTables ทิ้งแล้ว import ใหม่แบบเงียบ ๆ —
  // ชุดกฎแบบมีทั้ง factorF เดี่ยวและชุดตาราง ถ้าตัดชุดตารางออก เครื่องยนต์จะ fallback ไปตารางเดี่ยวซึ่งอาจเป็นประกาศต่างฉบับ)
  const fileSetChecksum = typeof data.setChecksum === "string" && data.setChecksum ? data.setChecksum : undefined;
  if (rawTables !== undefined && rawTables !== null) {
    if (!Array.isArray(rawTables)) throw new Error("factorFTables ไม่ถูกต้อง — ต้องเป็น array ของตาราง Factor F");
    if (rawTables.length > 0) {
      factorFTables = [];
      const seen = new Set<string>();
      for (let i = 0; i < rawTables.length; i++) {
        const where = `factorFTables[${i}]`;
        const t = rawTables[i] as FactorFTable;
        if (typeof t !== "object" || t === null || Array.isArray(t)) throw new Error(`${where} ไม่ถูกต้อง — ต้องเป็น object ของตาราง`);
        if (!WORK_TYPES.includes(t.workType as WorkTypeCode))
          throw new Error(`${where}.workType ต้องเป็นหนึ่งใน building | road | bridge | irrigation (ชุดตารางต้องระบุประเภทงาน เพื่อให้เครื่องยนต์เลือกตารางได้)`);
        const hdr = headerError(t, where);
        if (hdr) throw new Error(hdr);
        const err = validateFactorFTable(t);
        if (err) throw new Error(`ตาราง Factor F ลำดับ ${i} (${t.workType} ทดรองจ่าย ${t.advancePct}% · ประกันผลงาน ${t.retentionPct}%) ไม่ผ่านการตรวจ: ${err}`);
        const combo = `${t.workType}|${t.advancePct}|${t.retentionPct}`;
        if (seen.has(combo))
          throw new Error(`${where}: มีตารางซ้ำกัน (ประเภทงาน ${t.workType} · ทดรองจ่าย ${t.advancePct}% · ประกันผลงาน ${t.retentionPct}%) — ชุดตารางต้องไม่ซ้ำ ไม่งั้นเครื่องยนต์จะเลือกตารางไม่ชัดเจน`);
        seen.add(combo);
        factorFTables.push(t);
      }
      setNote = factorF === undefined
        ? `ไฟล์มีชุดตาราง Factor F ${factorFTables.length} ตาราง — เครื่องยนต์เลือกตารางตามเงื่อนไขสัญญา (ประเภทงาน × ทดรองจ่าย × ประกันผลงาน)`
        : `ไฟล์มีทั้ง factorF (ตารางเดี่ยว) และ factorFTables (ชุด ${factorFTables.length} ตาราง) — เครื่องยนต์จะใช้ชุดตารางเท่านั้น ไม่ fallback ไปตารางเดี่ยว`;
    }
  }

  // — บัญชีค่าแรงงาน (wageSchedule) — รูปแบบบัญชีค่าแรงงานฯ ว 480 (ตรวจโครงสร้าง ไม่ตรวจค่ากฎหมาย)
  // ว่าง (entries array ว่าง) = ถือว่าไม่ระบุ — ตัดทิ้งเพื่อให้ checksum เทียบเท่าแบบไม่มีบัญชี
  let wageSchedule: WageSchedule | undefined;
  let wageNote = "";
  const fileWageChecksum = typeof data.wageScheduleChecksum === "string" && data.wageScheduleChecksum ? data.wageScheduleChecksum : undefined;
  if (data.wageSchedule !== undefined && data.wageSchedule !== null) {
    const s = data.wageSchedule as WageSchedule;
    const err = wageScheduleError(s);
    if (err) throw new Error(err);
    if (s.entries.length > 0) {
      wageSchedule = s;
      wageNote = `ไฟล์มีบัญชีค่าแรงงาน (wageSchedule) ${s.entries.length} รายการ + หมายเหตุ ${s.notices.length} ข้อ — ต้องยืนยันตัวเลขกับเอกสารต้นทางก่อนใช้คำนวณจริง`;
    }
  }
  if (fileWageChecksum && !wageSchedule) {
    throw new Error("ไฟล์ระบุ wageScheduleChecksum (checksum ของบัญชีค่าแรงงาน) แต่ไม่พบ wageSchedule — ไฟล์อาจถูกตัดหรือแก้ไข ห้ามนำเข้า");
  }

  // — ตารางค่าขนส่ง (transportSchedule) — รูปแบบตาราง ว 477 (ตรวจโครงสร้าง ไม่ตรวจค่ากฎหมาย) —
  // ว่าง (sections array ว่าง) = ถือว่าไม่ระบุ — ตัดทิ้งเพื่อให้ checksum เทียบเท่าแบบไม่มีตาราง
  let transportSchedule: TransportSchedule | undefined;
  let transportNote = "";
  const fileTransportChecksum =
    typeof data.transportScheduleChecksum === "string" && data.transportScheduleChecksum ? data.transportScheduleChecksum : undefined;
  if (data.transportSchedule !== undefined && data.transportSchedule !== null) {
    const s = data.transportSchedule as TransportSchedule;
    const err = transportScheduleError(s);
    if (err) throw new Error(err);
    if (s.sections.length > 0) {
      // ตรึงข้อมูลลึก — checksum ผูกกับเนื้อหาตอน import; แก้ภายหลัง = checksum ไม่ตรงกับข้อมูลจริง
      transportSchedule = deepFreeze(s);
      const bands = s.sections.reduce((a, x) => a + x.bands.length, 0);
      transportNote = `ไฟล์มีตารางค่าขนส่ง (transportSchedule) ${s.sections.length} ประเภทารถ × ${bands} ช่วงราคาน้ำมัน — จำนวนเงินเป็นสตางค์ · ต้องยืนยันตัวเลขกับเอกสารต้นทางก่อนใช้คำนวณจริง`;
    } else {
      transportNote = "ไฟล์ระบุ transportSchedule ว่าง (sections = []) — ถือว่าไม่ระบุตาราง ตัดทิ้งเพื่อให้ checksum เทียบเท่าแบบไม่มีตาราง";
    }
  }
  if (fileTransportChecksum && !transportSchedule) {
    throw new Error("ไฟล์ระบุ transportScheduleChecksum (checksum ของตารางค่าขนส่ง) แต่ไม่พบ transportSchedule — ไฟล์อาจถูกตัดหรือแก้ไข ห้ามนำเข้า");
  }

  // — ตารางค่าดำเนินการ/ค่าเสื่อมราคา (machinerySchedule) — รูปแบบตาราง ว 475 (ตรวจโครงสร้าง ไม่ตรวจค่ากฎหมาย) —
  // ว่าง (bands array ว่าง) = ถือว่าไม่ระบุ — ตัดทิ้งเพื่อให้ checksum เทียบเท่าแบบไม่มีตาราง
  let machinerySchedule: MachineryRateSchedule | undefined;
  let machineryNote = "";
  const fileMachineryChecksum =
    typeof data.machineryScheduleChecksum === "string" && data.machineryScheduleChecksum ? data.machineryScheduleChecksum : undefined;
  if (data.machinerySchedule !== undefined && data.machinerySchedule !== null) {
    const s = data.machinerySchedule as MachineryRateSchedule;
    const err = machineryScheduleError(s);
    if (err) throw new Error(err);
    if (s.bands.length > 0) {
      // ตรึงข้อมูลลึก — checksum ผูกกับเนื้อหาตอน import; แก้ภายหลัง = checksum ไม่ตรงกับข้อมูลจริง
      machinerySchedule = deepFreeze(s);
      machineryNote = `ไฟล์มีตารางค่าดำเนินการ/ค่าเสื่อมราคา (machinerySchedule) ${s.items.length} บรรทัด × ${s.bands.length} ช่วงราคาน้ำมัน — จำนวนเงินเป็นสตางค์ · ต้องยืนยันตัวเลขกับเอกสารต้นทางก่อนใช้คำนวณจริง`;
    } else {
      machineryNote = "ไฟล์ระบุ machinerySchedule ว่าง (bands = []) — ถือว่าไม่ระบุตาราง ตัดทิ้งเพื่อให้ checksum เทียบเท่าแบบไม่มีตาราง";
    }
  }
  if (fileMachineryChecksum && !machinerySchedule) {
    throw new Error("ไฟล์ระบุ machineryScheduleChecksum (checksum ของตารางค่าดำเนินการ/ค่าเสื่อมราคา) แต่ไม่พบ machinerySchedule — ไฟล์อาจถูกตัดหรือแก้ไข ห้ามนำเข้า");
  }

  for (const k of ["contingencyPct", "swcPct", "durableHandlingPct"] as const) {
    if (data[k] !== undefined && data[k] !== null && typeof data[k] !== "number") throw new Error(`${k} ต้องเป็นตัวเลข (ถ้ามี)`);
  }
  if (data.labor !== undefined && data.labor !== null) {
    const l = data.labor as { minPct?: unknown; maxPct?: unknown };
    if (typeof l.minPct !== "number" || typeof l.maxPct !== "number") throw new Error("labor ต้องเป็น { minPct, maxPct }");
  }

  // provenance — metadata ที่มา (ไม่รวมใน checksum) ใช้เตือนว่าไฟล์ยังไม่ยืนยันกับราชกิจจานุเบกษา
  let provenance: Ruleset["provenance"];
  if (data.provenance !== undefined && data.provenance !== null) {
    const p = data.provenance as Record<string, unknown>;
    if (typeof p !== "object" || Array.isArray(p)) throw new Error("provenance ต้องเป็น object");
    if (p.sourceKind !== "official" && p.sourceKind !== "mirror-unverified")
      throw new Error('provenance.sourceKind ต้องเป็น "official" หรือ "mirror-unverified"');
    provenance = { sourceKind: p.sourceKind };
    if (typeof p.verifiedAgainstGazette === "boolean") provenance.verifiedAgainstGazette = p.verifiedAgainstGazette;
    if (typeof p.retrievedFrom === "string") provenance.retrievedFrom = p.retrievedFrom;
  }

  // setChecksum ต้องตรวจก่อน checksum หลัก — ป้องกันไฟล์ที่อ้างว่ามีชุดตารางแต่ถูกตัดทิ้ง
  const notes: string[] = [];
  let setChecksum: string | undefined;
  if (fileSetChecksum) {
    if (!factorFTables || factorFTables.length === 0) {
      throw new Error("ไฟล์ระบุ setChecksum (checksum ของชุดตาราง Factor F) แต่ไม่พบ factorFTables — ไฟล์อาจถูกตัดหรือแก้ไข ห้ามนำเข้า");
    }
    const actual = await computeChecksum(factorFTables);
    if (actual !== fileSetChecksum) {
      throw new Error(
        `setChecksum ไม่ตรงกับชุดตาราง (ไฟล์: ${fileSetChecksum.slice(0, 8)}… / คำนวณใหม่: ${actual.slice(0, 8)}…) — ชุดตารางอาจถูกแก้ภายหลัง ห้ามนำเข้า`,
      );
    }
    setChecksum = fileSetChecksum;
  } else if (factorFTables && factorFTables.length > 0) {
    // ไฟล์มีชุดตารางแต่ไม่มี setChecksum → ระบบคำนวณและแนบให้ เพื่อให้การ export รอบถัดไปตรวจจับการตัดชุดตารางได้
    setChecksum = await computeChecksum(factorFTables);
    notes.push("ระบบคำนวณ setChecksum ของชุดตารางให้ใหม่ (ป้องกันการตัดชุดตารางออกจากไฟล์ภายหลัง)");
  }

  // wageScheduleChecksum — pattern เดียวกับ setChecksum แต่ผูกบัญชีค่าแรงงาน (ว 480)
  let wageScheduleChecksum: string | undefined;
  if (fileWageChecksum && wageSchedule) {
    const actual = await computeChecksum(wageSchedule);
    if (actual !== fileWageChecksum) {
      throw new Error(
        `wageScheduleChecksum ไม่ตรงกับบัญชีค่าแรงงาน (ไฟล์: ${fileWageChecksum.slice(0, 8)}… / คำนวณใหม่: ${actual.slice(0, 8)}…) — บัญชีค่าแรงงานอาจถูกแก้ภายหลัง ห้ามนำเข้า`,
      );
    }
    wageScheduleChecksum = fileWageChecksum;
  } else if (wageSchedule) {
    wageScheduleChecksum = await computeChecksum(wageSchedule);
    notes.push("ระบบคำนวณ wageScheduleChecksum ของบัญชีค่าแรงงานให้ใหม่ (ป้องกันการตัดบัญชีออกจากไฟล์ภายหลัง)");
  }

  // transportScheduleChecksum — pattern เดียวกัน ผูกตารางค่าขนส่ง (ว 477)
  let transportScheduleChecksum: string | undefined;
  if (fileTransportChecksum && transportSchedule) {
    const actual = await computeChecksum(transportSchedule);
    if (actual !== fileTransportChecksum) {
      throw new Error(
        `transportScheduleChecksum ไม่ตรงกับตารางค่าขนส่ง (ไฟล์: ${fileTransportChecksum.slice(0, 8)}… / คำนวณใหม่: ${actual.slice(0, 8)}…) — ตารางอาจถูกแก้ภายหลัง ห้ามนำเข้า`,
      );
    }
    transportScheduleChecksum = fileTransportChecksum;
  } else if (transportSchedule) {
    transportScheduleChecksum = await computeChecksum(transportSchedule);
    notes.push("ระบบคำนวณ transportScheduleChecksum ของตารางค่าขนส่งให้ใหม่ (ป้องกันการตัดตารางออกจากไฟล์ภายหลัง)");
  }

  // machineryScheduleChecksum — pattern เดียวกัน ผูกตารางค่าดำเนินการ/ค่าเสื่อมราคา (ว 475)
  let machineryScheduleChecksum: string | undefined;
  if (fileMachineryChecksum && machinerySchedule) {
    const actual = await computeChecksum(machinerySchedule);
    if (actual !== fileMachineryChecksum) {
      throw new Error(
        `machineryScheduleChecksum ไม่ตรงกับตารางค่าดำเนินการ/ค่าเสื่อมราคา (ไฟล์: ${fileMachineryChecksum.slice(0, 8)}… / คำนวณใหม่: ${actual.slice(0, 8)}…) — ตารางอาจถูกแก้ภายหลัง ห้ามนำเข้า`,
      );
    }
    machineryScheduleChecksum = fileMachineryChecksum;
  } else if (machinerySchedule) {
    machineryScheduleChecksum = await computeChecksum(machinerySchedule);
    notes.push("ระบบคำนวณ machineryScheduleChecksum ของตารางค่าดำเนินการ/ค่าเสื่อมราคาให้ใหม่ (ป้องกันการตัดตารางออกจากไฟล์ภายหลัง)");
  }

  const draft = {
    factorF: factorF ?? null,
    factorFTables,
    wageSchedule,
    transportSchedule,
    machinerySchedule,
    labor: (data.labor as Ruleset["labor"]) ?? null,
    contingencyPct: (data.contingencyPct as number | undefined) ?? null,
    swcPct: (data.swcPct as number | undefined) ?? null,
    durableHandlingPct: (data.durableHandlingPct as number | undefined) ?? null,
  };
  const computed = await rulesetChecksum(draft);
  if (typeof data.checksum === "string" && data.checksum) {
    if (data.checksum !== computed) {
      throw new Error(
        `checksum ไม่ตรงกับเนื้อหาตาราง (ไฟล์: ${String(data.checksum).slice(0, 8)}… / คำนวณใหม่: ${computed.slice(0, 8)}…) — ไฟล์อาจถูกแก้หลังจากคำนวณ checksum หรือคำนวณด้วยรูปแบบ checksum ต่างกัน ห้ามนำเข้า`,
      );
    }
  } else {
    notes.push("ไฟล์ไม่มี checksum — ระบบคำนวณจากเนื้อหาให้ใหม่ (ควรตรวจตัวเลขกับเอกสารต้นทางก่อนใช้จริง)");
  }
  if (setNote) notes.push(setNote);
  if (wageNote) notes.push(wageNote);
  if (transportNote) notes.push(transportNote);
  if (machineryNote) notes.push(machineryNote);

  const rs: Ruleset = {
    id: String(data.id ?? "").trim() || globalThis.crypto?.randomUUID?.() || `rs-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`,
    name,
    sourceDoc,
    sourceUrl: data.sourceUrl ? String(data.sourceUrl) : undefined,
    effectiveFrom,
    checksum: computed,
    factorF,
    factorFTables,
    setChecksum,
    wageSchedule,
    wageScheduleChecksum,
    transportSchedule,
    transportScheduleChecksum,
    machinerySchedule,
    machineryScheduleChecksum,
    labor: draft.labor ?? undefined,
    contingencyPct: draft.contingencyPct ?? undefined,
    swcPct: draft.swcPct ?? undefined,
    durableHandlingPct: draft.durableHandlingPct ?? undefined,
    provenance,
    notices: Array.isArray(data.notices) ? (data.notices as unknown[]).map(String) : undefined,
    supersededBy: typeof data.supersededBy === "string" && data.supersededBy ? data.supersededBy : undefined,
    createdAt: new Date().toISOString(),
  };
  return { rs, note: notes.join(" · ") };
}
