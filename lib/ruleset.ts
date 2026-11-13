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
  return computeChecksum(canonical);
}
