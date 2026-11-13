// Ruleset registry (F2.4) — ที่เก็บ "ตัวเลขกฎหมาย" ที่เครื่องยนต์ราคากลาง (เฟส 3, lib/calc) จะใช้
//
// ⚠️ กฎเหล็ก (skill thai-govt-base-price-rules):
// - เพิ่ม ruleset ได้จาก "เอกสารทางการที่มีผลบังคับ" เท่านั้น (ราชกิจจานุเบกษา ฯลฯ) — บันทึก sourceDoc เสมอ
// - ห้าม hardcode ตัวเลขกฎหมายในโค้ด — ห้าม copy จากความจำหรือสรุปที่ไม่เป็นทางการ
// - ประกาศใหม่ทับของเดิม → ตั้ง supersededBy + เตือนผู้ใช้ที่ pin ruleset เก่า (โปรเจกต์เก็บ rulesetId)
// - checksum ผูกกับเนื้อหาตาราง — แก้ตารางภายหลัง = checksum เปลี่ยน = ตรวจพบ
//
// เฟส 2: โครงสร้าง + storage + checksum (เรจิสทรีเริ่มต้นว่างเปล่า — ไม่มีตัวเลขใด ๆ ในโค้ด)
// เฟส 3: เครื่องยนต์ lib/calc อ่านจากที่นี่เท่านั้น + หน้า import จากเอกสารทางการ

export type FactorFRow = {
  B: number; // ขอบล่างของช่วงต้นทุนโดยตรง (ล้านบาท)
  C: number; // ขอบบนของช่วงต้นทุนโดยตรง (ล้านบาท)
  D: number; // Factor F ที่ขอบล่าง
  E: number; // Factor F ที่ขอบบน
  // — ฟิลด์เพิ่มจากประกาศ ว 481 (ลง 26 มิ.ย. 2569) — ทั้งหมด optional เพื่อคู่เทียบประกาศฉบับเดิม
  open?: boolean; // true = ช่วงปลายเปิดตามแถว "> N" / "≥ N" ของประกาศ — ใช้ค่าคงที่ D (= E) เสมอ, C = B เป็นเพียงจุดสัมผัส
  F?: number; // "รวมในรูป Factor" (ไม่รวม VAT) ที่ขอบล่าง — หมายเหตุ 2: งานที่ไม่ต้องชำระ VAT ให้ใช้คอลัมน์นี้
  G?: number; // "รวมในรูป Factor" (ไม่รวม VAT) ที่ขอบบน
  D2?: number; // Factor F ฝนชุก 1 ที่ขอบล่าง (เฉพาะงานทาง/ชลประทานของ ว 481)
  E2?: number; // Factor F ฝนชุก 1 ที่ขอบบน
  D3?: number; // Factor F ฝนชุก 2 ที่ขอบล่าง
  E3?: number; // Factor F ฝนชุก 2 ที่ขอบบน
  anomalyNote?: string; // ป้ายเมื่อตัวประกาศพิมพ์ค่าเบี่ยงเบนจากแนว trend (เช่น ว 481 งานทาง a0-r5 tier 180→190) — เก็บค่าตามต้นฉบับและอธิบายไว้; validator จะยอมรับแถวที่มีป้ายนี้
};

export type WorkTypeCode = "building" | "road" | "bridge" | "irrigation"; // อาคาร / งานทาง / สะพาน+ท่อเหลี่ยม / ชลประทาน

// ป้ายภาษาไทยของประเภทงาน (ใช้ร่วมกันทุกหน้า UI — ห้ามแปลซ้ำกระจายหลายไฟล์)
export const WORK_TYPE_LABELS: Record<WorkTypeCode, string> = {
  building: "อาคาร",
  road: "งานทาง",
  bridge: "สะพาน + ท่อเหลี่ยม",
  irrigation: "ชลประทาน",
};

export type FactorFTable = {
  advancePct: number; // % เงินทดรองจ่าย (ค่าจ้างล่วงหน้า)
  retentionPct: number; // % เงินประกันผลงาน
  interestPct: number; // % ดอกเบี้ยต่อปี
  vatPct: number; // % VAT
  workType?: WorkTypeCode; // ประเภทงาน (ว 481 = 4 ประเภทงาน 12 ตาราง/ประเภท)
  rows: FactorFRow[]; // ต้องเรียงตาม B และช่วงต้องต่อเนื่อง — ตรวจด้วย validateFactorFTable
};

export type Ruleset = {
  id: string;
  name: string;
  sourceDoc: string; // เอกสารต้นทางทางการ เช่น "หลักเกณฑ์การคำนวณราคากลางงานก่อสร้าง พ.ศ. 2569 (กค 0433.2/ว 475)"
  sourceUrl?: string;
  effectiveFrom: string; // วันที่เริ่มมีผล (ISO date)
  checksum: string; // ลายนิ้วมือกันการแก้ไข: FNV-1a 2×32-bit (hex 16 ตัว) — ไม่ใช่ crypto-strong, คำนวณด้วย computeChecksum
  factorF?: FactorFTable; // ตาราง Factor F เดี่ยว (ใช้ได้กับประกาศที่ให้ตารางเดียว)
  factorFTables?: FactorFTable[]; // ชุดตารางหลายตาราง (เช่น ว 481: 4 ประเภทงาน × 12 คู่อัตรา) — เลือกด้วย selectFactorFTable
  wageSchedule?: WageSchedule; // บัญชีค่าแรงงาน/ดำเนินการ (กค 0433.2/ว 480) — รายการค่าแรงงานต่อหน่วย
  wageScheduleChecksum?: string; // checksum ของ wageSchedule (กันการตัดชุดออกจากไฟล์ภายหลัง — pattern เดียวกับ setChecksum)
  transportSchedule?: TransportSchedule; // ตารางค่าขนส่งวัสดุก่อสร้าง (กค 0433.2/ว 477) — 3 ประเภทารถ × 45 ช่วงน้ำมัน × ระยะ 1–200 กม.
  transportScheduleChecksum?: string; // checksum ของ transportSchedule (กันการตัดตารางออกจากไฟล์ภายหลัง)
  machinerySchedule?: MachineryRateSchedule; // ตารางค่าดำเนินการ+ค่าเสื่อมราคาเครื่องจักร (กค 0433.2/ว 475) — 20 ลำดับ × 45 ช่วงน้ำมัน
  machineryScheduleChecksum?: string; // checksum ของ machinerySchedule (กันการตัดตารางออกจากไฟล์ภายหลัง)
  setChecksum?: string; // checksum ของ factorFTables (array เปล่า ๆ ไม่รวมส่วนอื่น) — กันการตัดชุดตารางออกจากไฟล์ภายหลัง; ตรวจตอน import เมื่อมีฟิลด์นี้ (ไฟล์เก่าที่ไม่มี = ไม่ตรวจ)
  labor?: { minPct: number; maxPct: number }; // ช่วง % ค่าแรง เช่น 30–37 — จากเอกสารทางการเท่านั้น
  // ที่มาของชุดกฎ — ใช้เตือนผู้ใช้/เอกสารพิมพ์ว่าไฟล์ต้นทางยังไม่ยืนยันกับราชกิจจานุเบกษา
  // (ไม่ถูกรวมใน rulesetChecksum — เป็น metadata ไม่ใช่เนื้อหาตัวเลขกฎหมาย)
  provenance?: {
    sourceKind: "official" | "mirror-unverified";
    verifiedAgainstGazette?: boolean;
    retrievedFrom?: string;
  };
  contingencyPct?: number; // % เงินเผื่อจำเป็น — จากเอกสารทางการเท่านั้น (ไม่มีค่า default ในโค้ด)
  swcPct?: number; // % ค่าดำเนินงาน (งานก่อสร้าง) — จากเอกสารทางการเท่านั้น
  durableHandlingPct?: number; // % ค่าดำเนินงานครุภัณฑ์ (แยกจากฐาน Factor F) — จากเอกสารทางการเท่านั้น
  notices?: string[]; // หมายเหตุ/เงื่อนไขจากประกาศ
  supersededBy?: string; // ruleset id ที่มาแทนที่ (ถ้าถูกแทนแล้ว)
  createdAt: string;
};

// — ชุดบัญชีค่าแรงงาน (กค 0433.2/ว 480) — โครงสร้างถอดจากเอกสารจริง ผ่าน parser scripts/parse-w480.mjs
// ทุกแถวราคาเป็น integer บาท (ตัวประกาศพิมพ์เป็นบาทเต็ม — ราคา comma ถูก strip ตอนถอด)
export type WagePriceRow = {
  price: number; // บาท/หน่วย (integer)
  unit?: string; // หน่วย เช่น "ต้น", "เมตร", "ตร.ม."
  name?: string; // ชื่อของแถวราคา (เช่น 'เสาเข็ม ขนาด ศก. 4" x 4.00 ม.', "หรืออื่น ๆ ...")
  note?: string; // ข้อความคอลัมน์หมายเหตุของแถว (เช่น "จำนวน 100 - 200 ต้น")
};
export type WageVariant = {
  name: string; // ชื่อ variant จากแถว bullet เช่น 'Size dia 4"' — หรือชื่อหัวกลุ่มย่อย (sub-header)
  note?: string; // โน้ตคอลัมน์หมายเหตุของหัวกลุ่มย่อย (เช่น "ค่าแรง / 1 เมตร" ของ Linear Slot Diffuser)
  prices: WagePriceRow[];
  children?: WageVariant[]; // bullets ที่อยู่ใต้หัวกลุ่มย่อย (sub-header ไม่มีราคา → prices ว่าง)
};
export type WageEntry = {
  no: string; // ลำดับ canonical เช่น "1.1", "2.4.16.1" — ต่อเนื่องตามพ่อแม่เดียวกัน
  noPrinted?: string; // ตัวพิมพ์ที่ต่างจาก canonical เท่าที่ตัวประกาศพิมพ์ (เช่น "2.68" พิมพ์ผิดของ 2.6.8)
  level: 1 | 2 | 3 | 4; // ระดับจากจำนวน segment: "1"=1, "1.1"=2, "1.2.1"=3, "1.2.1.10"=4
  name: string;
  notes: string[]; // หมายเหตุ/**/หมายเหตุบล็อก/N) ... ที่ติดอยู่ใต้รายการนี้
  prices: WagePriceRow[]; // แถวราคา (tier จำนวนงาน) ตามลำดับพิมพ์
  variants?: WageVariant[];
  anomaly?: string; // คำอธิบายเมื่อตัวพิมพ์เบี่ยงเบน (เช่น "2.68" แห้งของ 2.6.8) — เก็บตามต้นฉบับ
};
export type WageSchedule = {
  entries: WageEntry[];
  notices: string[]; // หมายเหตุ 3 ข้อท้ายบัญชี (อยู่ใน checksum ด้วย)
};

// — ตารางค่าขนส่งวัสดุก่อสร้าง (กค 0433.2/ว 477) — โครงสร้างถอดจากเอกสารจริง ผ่าน parser scripts/parse-w477.mjs
// ⚠️ ทุกจำนวนเงินในชุดนี้เป็น "สตางค์" จำนวนเต็ม (ตัวประกาศพิมพ์บาททศนิยม 2 ตำแหน่ง → ×100 ตรงตัว ไม่ปัดเศษ)
//    ราคาน้ำมันก็เก็บเป็นสตางค์ (25.00 บาท/ลิตร = 2500) เพื่อกันเศษทศนิยมลอยตัว
export type TransportFuelBand = {
  fuelMinSatang: number; // ขอบล่างช่วงราคาน้ำมันดีเซล (สตางค์/ลิตร) เช่น 2500 = 25.00
  fuelMaxSatang: number; // ขอบบน เช่น 2599 = 25.99
  avgFuelSatang: number; // "อัตราน้ำมันเชื้อเพลิงเฉลี่ย" จากหมายเหตุท้ายตาราง (สตางค์/ลิตร)
  farMinKm: number; // ระยะที่เริ่มคิดอัตรา "กม.ละ" (จากหมายเหตุข้อ 1 เช่น 201)
  farMaxKm: number; // ระยะสูงสุดของอัตรา กม.ละ (เช่น 1000)
  farPerTonSatang: number; // อัตรา กม.ละ ต่อตัน (สตางค์) — คูณกับระยะทางตามหมายเหตุข้อ 1/2
  farPerM3Satang: number; // อัตรา กม.ละ ต่อลบ.ม. (สตางค์)
  perTonSatang: number[]; // ราคา/ตัน ตามระยะ เรียงจาก distanceStartKm (index 0 = ระยะเริ่มต้น)
  perM3Satang: number[]; // ราคา/ลบ.ม. ตามระยะ (index เดียวกัน)
  sourcePages: [number, number]; // เลขหน้าใน PDF ต้นฉบับ (หน้าแรกของช่วง, หน้าที่สอง)
};

export type TransportTruckSection = {
  truckType: string; // ป้ายจากเอกสาร เช่น "6 ล้อ", "10 ล้อ + รถลากพ่วง"
  lorryCount: number; // จำนวนล้อ (จากหัวตาราง)
  hasTrailer: boolean; // true = มีรถลากพ่วง (จากหัวตาราง)
  maxGrossTons: number; // น้ำหนักรวมสูงสุด (ตัน) ตามหัวตาราง "กรณีน้ำหนักรวมไม่เกิน … ตัน"
  titlePrinted: string; // หัวตารางตามที่พิมพ์ (เก็บไว้ตรวจทาน/แสดงที่มา)
  bands: TransportFuelBand[]; // ช่วงราคาน้ำมัน เรียงจากน้อยไปมาก
};

export type TransportSchedule = {
  distanceStartKm: number; // ระยะแรกของตาราง (ปกติ 1) — ใช้แปลง index → ระยะทาง
  sections: TransportTruckSection[];
  // เงื่อนไขการใช้ตารางตามหัวตารางทุกหน้า (ภูมิประเทศ / ผิวทาง / การจราจร) — เก็บตามที่พิมพ์
  // ⚠️ ต้องเตือนผู้ใช้เมื่อสภาพหน้างานไม่ตรง (เช่น ผิวทางไม่ลาดยาง) — ตารางนี้ใช้กับเงื่อนไขที่ระบุเท่านั้น
  conditions: string[];
  fuelPriceBasis: string; // ฐานราคาน้ำมันตามหัวตาราง เช่น "ราคาน้ำมันดีเซล ที่ อำเภอเมือง"
  notices: string[]; // หมายเหตุคงที่ของตาราง (การคูณระยะทาง / หัวข้อค่าเฉลี่ยน้ำมัน)
  unit: "satang"; // ป้ายหน่วยเงินของทั้งชุด — กันการอ่านเป็นบาทโดยไม่ตั้งใจ
};

// — ตารางค่าดำเนินการและค่าเสื่อมราคา (กค 0433.2/ว 475) — โครงสร้างถอดจากเอกสารจริง ผ่าน parser scripts/parse-w475.mjs
// ⚠️ ทุกจำนวนเงินในชุดนี้เป็น "สตางค์" จำนวนเต็ม (ตัวประกาศพิมพ์บาททศนิยม 2 ตำแหน่ง → ×100 ตรงตัว ไม่ปัดเศษ)
//    ราคาน้ำมันก็เก็บเป็นสตางค์ (25.00 บาท/ลิตร = 2500)
export type MachineryRateItem = {
  entryNo: number; // ลำดับในเอกสาร (1–20)
  entryName: string; // ชื่อลำดับ เช่น "งานดินคันทาง"
  label: string; // ชื่อบรรทัดตามที่พิมพ์ (บรรทัดลำดับเอง = entryName)
  unit: string | null; // หน่วยตามที่พิมพ์ ("ตร.ม." / "ลบ.ม. แน่น" / …) — null เมื่อต้นฉบับไม่พิมพ์หน่วย
  // five = มีราคา 5 ค่า · lump = ค่าก้อนเดียว (บาทเต็ม/ครั้ง) · none = บรรทัดหัวเรื่องที่ต้นฉบับไม่พิมพ์ราคา
  priced: "five" | "lump" | "none";
  occurrence: number; // ครั้งที่ของ (entryNo, label) ภายในลำดับ — ต้นฉบับพิมพ์ชื่อซ้ำได้ (เช่น "- ดันและตัก")
};

export type MachineryRateBand = {
  fuelMinSatang: number; // ขอบล่างช่วงราคาน้ำมันดีเซล (สตางค์/ลิตร) เช่น 2500 = 25.00
  fuelMaxSatang: number; // ขอบบน เช่น 2599 = 25.99
  // 5 อาร์เรย์ index ตรงกับ schedule.items — ช่องที่เป็น null = บรรทัดนั้นไม่มีราคาในคอลัมน์นั้น
  operationSatang: (number | null)[]; // ค่าดำเนินการ
  depNormalSatang: (number | null)[]; // ค่าเสื่อมราคา — สภาพปกติ
  depRainySatang: (number | null)[]; // ค่าเสื่อมราคา — สภาพฝนชุก
  totalNormalSatang: (number | null)[]; // รวมค่างาน — ปกติ (= operation + depNormal ตามที่พิมพ์)
  totalRainySatang: (number | null)[]; // รวมค่างาน — ฝนชุก (= operation + depRainy ตามที่พิมพ์)
  sourcePages: [number, number]; // เลขหน้าใน PDF ต้นฉบับ (หน้าแรกของช่วง, หน้าที่สอง)
};

export type MachineryRateSchedule = {
  titlePrinted: string; // หัวตารางตามที่พิมพ์
  fuelPriceBasis: string; // ฐานราคาน้ำมันตามหัวตาราง เช่น "อำเภอเมือง" (ราคาน้ำมันดีเซล ที่ …)
  items: MachineryRateItem[];
  bands: MachineryRateBand[]; // ช่วงราคาน้ำมัน เรียงจากน้อยไปมาก
  unit: "satang"; // ป้ายหน่วยเงินของทั้งชุด — กันการอ่านเป็นบาทโดยไม่ตั้งใจ
};

const KEY = "iserv-boq-rulesets-v1";

export function loadRulesets(): Ruleset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as Ruleset[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveRulesets(list: Ruleset[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list));
}

// checksum ของเนื้อหาตาราง (hex) — ผูกกับข้อมูล ไม่ผูกกับ id/วันเวลา
// ใช้ pure-JS hash (FNV-1a) ไม่พึ่ง Web Crypto / Node crypto — รันได้ทุกที่ (browser/server/edge)
function fnv1aHex(s: string): string {
  let h1 = 2166136261 >>> 0;
  let h2 = 14695981039970662767 >>> 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = ((h1 ^ c) * 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 1099511628211);
  }
  return ((h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0"));
}

// checksum ของเนื้อหาตาราง (hex) — ผูกกับข้อมูล ไม่ผูกกับ id/วันเวลา
export async function computeChecksum(data: unknown): Promise<string> {
  const canonical = stableStringify(data);
  return fnv1aHex(canonical);
}

// stable stringify — เรียง key เพื่อให้ checksum นิ่งข้ามเครื่อง/ข้ามเวลา
function stableStringify(data: unknown): string {
  if (data === null || typeof data !== "object") return JSON.stringify(data);
  if (Array.isArray(data)) return "[" + data.map((v) => stableStringify(v)).join(",") + "]";
  const keys = Object.keys(data as Record<string, unknown>).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify((data as Record<string, unknown>)[k])).join(",") + "}";
}

// ตรวจความถูกต้องเชิงโครงสร้างของตาราง Factor F (ก่อน import)
// คืนข้อความปัญหา (ภาษาไทย) หรือ null ถ้าผ่าน — ไม่ตรวจ "ค่าตัวเลขถูกตามกฎหมาย" (ผู้นำเข้าต้องอ้างเอกสาร)
export function validateFactorFTable(t: FactorFTable): string | null {
  if (!Array.isArray(t.rows) || t.rows.length === 0) return "ตาราง Factor F ต้องมีอย่างน้อย 1 แถว";
  const sorted = [...t.rows].sort((a, b) => a.B - b.B);
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    if (r.open) {
      // แถวปลายเปิด ("> N"/"≥ N" ของ ว 481): C = B จุดสัมผัส, ค่าคงที่ต้องเท่ากัน
      if (!(r.B === r.C)) return `แถวที่ ${i + 1}: แถว open ต้องกำหนด C เท่ากับ B (จุดสัมผัส)`;
      if (!(r.D === r.E)) return `แถวที่ ${i + 1}: แถว open ค่าต้องคงที่ (D เท่ากับ E)`;
      if (r.F !== undefined && r.G !== undefined && !(r.F === r.G))
        return `แถวที่ ${i + 1}: แถว open ค่า "รวมในรูป Factor" ต้องคงที่ (F เท่ากับ G)`;
      if (r.D2 !== undefined && r.E2 !== undefined && !(r.D2 === r.E2))
        return `แถวที่ ${i + 1}: แถว open ค่าฝนชุก 1 ต้องคงที่ (D2 เท่ากับ E2)`;
      if (r.D3 !== undefined && r.E3 !== undefined && !(r.D3 === r.E3))
        return `แถวที่ ${i + 1}: แถว open ค่าฝนชุก 2 ต้องคงที่ (D3 เท่ากับ E3)`;
    } else {
      if (!(r.C > r.B)) return `แถวที่ ${i + 1}: ขอบบน C ต้องมากกว่าขอบล่าง B`;
      // D>=E (และคอลัมน์คู่) เป็น invariant ตามแนว trend ของตารางประกาศ — แต่บางแถวในตัวประกาศจริง
      // มีค่าเบี่ยงเบนที่พิมพ์ตามลำดับถูกต้อง (เช่น ว 481) → ถ้า rider ป้าย anomalyNote ให้ผ่านเชิงโครงสร้าง (ยังเก็บช่วง/ต่อเนื่อง strict)
      if (r.anomalyNote === undefined) {
        if (!(r.D >= r.E)) return `แถวที่ ${i + 1}: D ควรมากกว่าหรือเท่ากับ E (F ลดลงเมื่อต้นทุนสูงขึ้น)`;
        if (r.F !== undefined && r.G !== undefined && !(r.F >= r.G))
          return `แถวที่ ${i + 1}: F ควรมากกว่าหรือเท่ากับ G ("รวมในรูป Factor" ลดลงเมื่อต้นทุนสูงขึ้น)`;
        if (r.D2 !== undefined && r.E2 !== undefined && !(r.D2 >= r.E2))
          return `แถวที่ ${i + 1}: D2 ควรมากกว่าหรือเท่ากับ E2 (ฝนชุก 1 ลดลงเมื่อต้นทุนสูงขึ้น)`;
        if (r.D3 !== undefined && r.E3 !== undefined && !(r.D3 >= r.E3))
          return `แถวที่ ${i + 1}: D3 ควรมากกว่าหรือเท่ากับ E3 (ฝนชุก 2 ลดลงเมื่อต้นทุนสูงขึ้น)`;
      }
    }
    if (i > 0) {
      const prev = sorted[i - 1];
      if (r.B < prev.C) return `แถวที่ ${i + 1}: ช่วง [${r.B}, ${r.C}] ทับซ้อนกับแถวก่อนหน้า`;
      if (r.B > prev.C) return `แถวที่ ${i + 1}: ช่วง [${r.B}, ${r.C}] มีช่องว่างจากแถวก่อนหน้า (ตารางต้องต่อเนื่อง)`;
    }
  }
  return null;
}

// เลือกตาราง Factor F จากชุด factorFTables ของ ruleset (เช่น ว 481)
// ตรงเงื่อนไข workType + advancePct + retentionPct (จากหัวตารางของประกาศ)
export function selectFactorFTable(
  tables: FactorFTable[] | undefined,
  cond: { workType: WorkTypeCode; advancePct: number; retentionPct: number },
): FactorFTable | null {
  if (!tables) return null;
  const hit = tables.find(
    (t) =>
      t.workType === cond.workType &&
      Math.abs(t.advancePct - cond.advancePct) < 1e-9 &&
      Math.abs(t.retentionPct - cond.retentionPct) < 1e-9,
  );
  return hit ?? null;
}

// หา Factor F ณ ค่างานต้นทุน x (ล้านบาท) จากตาราง — ตามหมายเหตุ 1 ของ ว 481:
// "กรณีค่างานอยู่ระหว่างช่วงของค่างานต้นทุนที่กำหนด ให้เทียบอัตราส่วนเพื่อหาค่า Factor F"
// = interpolate เชิงเส้นระหว่าง Factor ที่ขอบล่าง (D) กับที่ขอบบน (E) — รวมถึงคอลัมน์เพิ่มเติมถ้ามี
// คืนค่าเดี่ยวรายคอลัมน์; null ถ้า x นอกช่วงตาราง
export function factorFAt(
  t: FactorFTable,
  x: number,
): { noVat: number | null; factorF: number; rain1?: number; rain2?: number } | null {
  const sorted = [...t.rows].sort((a, b) => a.B - b.B);
  for (const r of sorted) {
    const inRange = r.open ? x >= r.B : x >= r.B && x <= r.C;
    if (!inRange) continue;
    if (r.open) {
      // ปลายเปิด → ค่าคงที่
      return {
        noVat: r.F ?? null,
        factorF: r.D,
        ...(r.D2 !== undefined ? { rain1: r.D2 } : {}),
        ...(r.D3 !== undefined ? { rain2: r.D3 } : {}),
      };
    }
    const ratio = r.C === r.B ? 1 : (x - r.B) / (r.C - r.B);
    const lerp = (a: number, b: number) => a + (b - a) * ratio;
    const v: { noVat: number | null; factorF: number; rain1?: number; rain2?: number } = {
      noVat: r.F !== undefined && r.G !== undefined ? lerp(r.F, r.G) : null,
      factorF: lerp(r.D, r.E),
    };
    if (r.D2 !== undefined && r.E2 !== undefined) v.rain1 = lerp(r.D2, r.E2);
    if (r.D3 !== undefined && r.E3 !== undefined) v.rain2 = lerp(r.D3, r.E3);
    return v;
  }
  return null;
}

// Ruleset ที่ถูกแทนที่แล้ว — โปรเจกต์ที่ pin อยู่ต้องเตือน
export function rulesetStatus(rs: Ruleset | undefined): "ok" | "superseded" | "missing" {
  if (!rs) return "missing";
  return rs.supersededBy ? "superseded" : "ok";
}

// checksum ของ "เนื้อหาตัวเลขกฎหมาย" ทั้งชุด — ใช้ตรวจ import/export ให้ตรงกัน และตรวจพบการแก้ไฟล์ภายหลัง
// (null = ไม่มีข้อมูลส่วนนั้น — canonical ทุกรูปแบบเดียวกันข้ามเครื่อง)
// factorFTables (ชุดตารางหลายตาราง เช่น ว 481) ใส่ใน checksum เฉพาะเมื่อมี เพื่อไม่ให้ checksum
// ของชุดกฎเดิม (ก่อน ว 481 — ไม่มีชุดตาราง) เปลี่ยน (backward-compat: export/import รอบเก่ายังตรงกัน)
export async function rulesetChecksum(
  rs: {
    factorF?: FactorFTable | null;
    factorFTables?: FactorFTable[] | null;
    wageSchedule?: WageSchedule | null;
    transportSchedule?: TransportSchedule | null;
    machinerySchedule?: MachineryRateSchedule | null;
    labor?: { minPct: number; maxPct: number } | null;
    contingencyPct?: number | null;
    swcPct?: number | null;
    durableHandlingPct?: number | null;
  },
): Promise<string> {
  const canonical: Record<string, unknown> = {
    factorF: rs.factorF ?? null,
    labor: rs.labor ?? null,
    contingencyPct: rs.contingencyPct ?? null,
    swcPct: rs.swcPct ?? null,
    durableHandlingPct: rs.durableHandlingPct ?? null,
  };
  if (rs.factorFTables !== undefined && rs.factorFTables !== null && rs.factorFTables.length > 0) {
    canonical.factorFTables = rs.factorFTables;
  }
  // บัญชีค่าแรงงาน (ว 480) — ใส่ใน checksum เมื่อมี เพื่อไม่ให้ checksum ของชุดกฎเดิม (ไม่มีบัญชีค่าแรงงาน) เปลี่ยน
  if (rs.wageSchedule !== undefined && rs.wageSchedule !== null && rs.wageSchedule.entries.length > 0) {
    canonical.wageSchedule = rs.wageSchedule;
  }
  // ตารางค่าขนส่ง (ว 477) — เงื่อนไขเดียวกับ wageSchedule: ใส่เมื่อมีเท่านั้น (ชุดกฎเดิม checksum ต้องไม่เปลี่ยน)
  if (
    rs.transportSchedule !== undefined &&
    rs.transportSchedule !== null &&
    rs.transportSchedule.sections.length > 0
  ) {
    canonical.transportSchedule = rs.transportSchedule;
  }
  // ตารางค่าดำเนินการ/ค่าเสื่อมราคาเครื่องจักร (ว 475) — เงื่อนไขเดียวกัน: ใส่เมื่อมีเท่านั้น
  if (rs.machinerySchedule !== undefined && rs.machinerySchedule !== null && rs.machinerySchedule.bands.length > 0) {
    canonical.machinerySchedule = rs.machinerySchedule;
  }
  return computeChecksum(canonical);
}

// — ตัวช่วยอ่านตารางค่าขนส่ง (ว 477) — pure เท่านั้น ไม่มี I/O —
// เลือกประเภทารถตามจำนวนล้อ + การมีรถลากพ่วง (ค่าจากหัวตาราง)
// grossTons (ไม่บังคับ): น้ำหนักรวมของงานจริง — ถ้าเกิน maxGrossTons ของประเภทรถนั้น คืน null
//   (ตารางครอบถึงน้ำหนักที่หัวตารางระบุเท่านั้น — ห้ามใช้ต่อเนื่องเกินขอบโดยไม่เตือน)
export function findTransportSection(
  schedule: TransportSchedule,
  q: { lorryCount: number; hasTrailer: boolean; grossTons?: number },
): TransportTruckSection | null {
  const sec =
    schedule.sections.find((s) => s.lorryCount === q.lorryCount && s.hasTrailer === q.hasTrailer) ?? null;
  if (!sec) return null;
  if (q.grossTons !== undefined) {
    // NaN/infinity ไม่ใช่คำตอบที่ใช้ได้ — คืน null (ไม่ปล่อยผ่านเพราะ NaN > x เป็น false)
    if (!Number.isFinite(q.grossTons)) return null;
    if (q.grossTons > sec.maxGrossTons) return null;
  }
  return sec;
}

// เลือกช่วงราคาน้ำมันที่ครอบราคาที่ระบุ (สตางค์/ลิตร) — ช่วงปิดทั้งสองด้านตามที่พิมพ์ (25.00–25.99)
export function findTransportBand(
  section: TransportTruckSection,
  fuelPriceSatang: number,
): TransportFuelBand | null {
  return (
    section.bands.find((b) => fuelPriceSatang >= b.fuelMinSatang && fuelPriceSatang <= b.fuelMaxSatang) ??
    null
  );
}

// ค่าขนส่งต่อหน่วย ณ ระยะทางหนึ่ง — คืน null เมื่อระยะทางอยู่นอกขอบเขตตาราง (> farMaxKm)
// ระยะในตาราง (distanceStartKm..distanceStartKm+len-1) = อ่านตรงจากตาราง
// ระยะ farMinKm..farMaxKm = ระยะทาง × อัตรา "กม.ละ" ตามหมายเหตุข้อ 1/2 ของตาราง ("การคิดค่าขนส่งใช้ระยะทางขนส่งคูณด้วยอัตราค่าขนส่งต่อตัน หรือต่อลบ.ม.")
// ⚠️ ห้ามปัดเศษระยะทางเงียบ ๆ: รับเฉพาะระยะที่เป็นจำนวนเต็ม กม. — ระยะทศนิยมคืน null
//    เพราะอัตราต่อหน่วยเป็นสตางค์ (integer) ผลคูณกับระยะทศนิยมจะไม่เป็นจำนวนเต็ม (ผิดกฎเงิน integer)
export type TransportCharge = {
  basis: "table" | "per-km";
  perTonSatang: number;
  perM3Satang: number;
  perTonRateSatang: number; // อัตราต่อหน่วย (ตาราง = ราคา ณ ระยะนั้น; กม.ละ = อัตราต่อ กม.)
  perM3RateSatang: number;
};

export function transportChargeAt(
  schedule: TransportSchedule,
  band: TransportFuelBand,
  distanceKm: number,
): TransportCharge | null {
  if (!Number.isFinite(distanceKm) || !Number.isInteger(distanceKm)) return null;
  const idx = distanceKm - schedule.distanceStartKm;
  if (idx >= 0 && idx < band.perTonSatang.length) {
    return {
      basis: "table",
      perTonSatang: band.perTonSatang[idx],
      perM3Satang: band.perM3Satang[idx],
      perTonRateSatang: band.perTonSatang[idx],
      perM3RateSatang: band.perM3Satang[idx],
    };
  }
  if (distanceKm >= band.farMinKm && distanceKm <= band.farMaxKm) {
    return {
      basis: "per-km",
      perTonSatang: distanceKm * band.farPerTonSatang,
      perM3Satang: distanceKm * band.farPerM3Satang,
      perTonRateSatang: band.farPerTonSatang,
      perM3RateSatang: band.farPerM3Satang,
    };
  }
  return null;
}

// แสดงสตางค์เป็นข้อความบาททศนิยม 2 ตำแหน่ง โดยไม่ผ่าน float (สำหรับข้อความหมายเหตุ)
function satangBahtText(satang: number): string {
  const whole = Math.trunc(satang / 100);
  const st = Math.abs(satang % 100);
  return `${whole}.${String(st).padStart(2, "0")}`;
}

// หมายเหตุของช่วงน้ำมันหนึ่ง พร้อมค่าที่ขึ้นกับช่วงนั้น — ใช้แสดงผล/พิมพ์
// ข้อความหลักมาจาก schedule.notices (ตัด "- " แล้ว) · เติมค่าเฉพาะข้อที่ต้นฉบับแนบค่าไว้:
//   ข้อ "ระยะทางเกินตารางคิดเป็น กม.ละ" → อัตราต่อตัน/ต่อลบ.ม. · ข้อ "อัตราน้ำมันเชื้อเพลิงเฉลี่ย" → บาท/ลิตร
// ⚠️ จับจาก "เนื้อข้อความ" ไม่ใช่ตำแหน่ง — ลำดับหมายเหตุอาจเปลี่ยนโดยไม่ผิดโครงสร้าง
export function transportBandNotices(schedule: TransportSchedule, band: TransportFuelBand): string[] {
  const out = [...schedule.notices];
  const farRate = `${satangBahtText(band.farPerTonSatang)} บาท/ตัน · ${satangBahtText(band.farPerM3Satang)} บาท/ลบ.ม.`;
  const avgFuel = `${satangBahtText(band.avgFuelSatang)} บาท/ลิตร`;
  for (let i = 0; i < out.length; i++) {
    const text = out[i];
    if (/201\s*กม/.test(text) && /1000\s*กม/.test(text)) out[i] = `${text} — ${farRate}`;
    else if (/เชื้อเพลิงเฉลี่ย/.test(text)) out[i] = `${text} — ${avgFuel}`;
  }
  return out;
}

// — ตัวช่วยอ่านตารางค่าดำเนินการ/ค่าเสื่อมราคา (ว 475) — pure เท่านั้น ไม่มี I/O —

// เลือกช่วงราคาน้ำมันที่ครอบราคาที่ระบุ (สตางค์/ลิตร) — ช่วงปิดทั้งสองด้านตามที่พิมพ์ (25.00–25.99)
// ⚠️ นอกราคาที่ตารางครอบ (25.00–69.99) คืน null — ห้ามประมาณ/extrapolate เอง
export function findMachineryBand(
  schedule: MachineryRateSchedule,
  fuelPriceSatang: number,
): MachineryRateBand | null {
  if (!Number.isFinite(fuelPriceSatang)) return null;
  return (
    schedule.bands.find((b) => fuelPriceSatang >= b.fuelMinSatang && fuelPriceSatang <= b.fuelMaxSatang) ?? null
  );
}

// หาบรรทัดรายการจาก (ลำดับ, ชื่อบรรทัด) — occurrence ใช้เมื่อต้นฉบับพิมพ์ชื่อซ้ำภายในลำดับเดียว
// (เช่น "- ดันและตัก" ในลำดับ 3 มี 2 ครั้ง) · ไม่ระบุ occurrence = ครั้งแรก · ไม่พบคืน null
export function findMachineryItem(
  schedule: MachineryRateSchedule,
  q: { entryNo: number; label: string; occurrence?: number },
): MachineryRateItem | null {
  const want = q.occurrence ?? 1;
  return (
    schedule.items.find((i) => i.entryNo === q.entryNo && i.label === q.label && i.occurrence === want) ?? null
  );
}

export type MachineryRate = {
  itemIndex: number;
  operationSatang: number | null; // ค่าดำเนินการ
  depNormalSatang: number | null; // ค่าเสื่อมราคา (ปกติ)
  depRainySatang: number | null; // ค่าเสื่อมราคา (ฝนชุก)
  totalNormalSatang: number | null; // รวมค่างาน (ปกติ) — ตามที่พิมพ์
  totalRainySatang: number | null; // รวมค่างาน (ฝนชุก) — ตามที่พิมพ์
};

// ค่าของบรรทัดรายการหนึ่ง ณ ช่วงน้ำมันหนึ่ง — คืน null เมื่อ item ไม่ได้อยู่ใน schedule
// ⚠️ บรรทัด "none" (หัวเรื่อง) คืน object ที่ทุกช่องเป็น null — ผู้เรียกต้องเช็คก่อนใช้คำนวณ
//    บรรทัด "lump" (ค่าติดตั้งเครื่องผสม) มีเฉพาะ operationSatang (บาทเต็ม × 100 ตามที่พิมพ์)
export function machineryRateAt(
  schedule: MachineryRateSchedule,
  band: MachineryRateBand,
  item: MachineryRateItem,
): MachineryRate | null {
  const itemIndex = schedule.items.indexOf(item);
  if (itemIndex < 0) return null;
  return {
    itemIndex,
    operationSatang: band.operationSatang[itemIndex] ?? null,
    depNormalSatang: band.depNormalSatang[itemIndex] ?? null,
    depRainySatang: band.depRainySatang[itemIndex] ?? null,
    totalNormalSatang: band.totalNormalSatang[itemIndex] ?? null,
    totalRainySatang: band.totalRainySatang[itemIndex] ?? null,
  };
}
