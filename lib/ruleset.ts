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
};

export type FactorFTable = {
  advancePct: number; // % เงินทดรองจ่าย
  retentionPct: number; // % เงินประกันผลงาน
  interestPct: number; // % ดอกเบี้ยต่อปี
  vatPct: number; // % VAT
  rows: FactorFRow[]; // ต้องเรียงตาม B และช่วงต้องต่อเนื่อง — ตรวจด้วย validateFactorFTable
};

export type Ruleset = {
  id: string;
  name: string;
  sourceDoc: string; // เอกสารต้นทางทางการ เช่น "หลักเกณฑ์การคำนวณราคากลางงานก่อสร้าง พ.ศ. 2569 (กค 0433.2/ว 475)"
  sourceUrl?: string;
  effectiveFrom: string; // วันที่เริ่มมีผล (ISO date)
  checksum: string; // SHA-256 (hex) ของเนื้อหาตาราง — คำนวณด้วย computeChecksum
  factorF?: FactorFTable;
  labor?: { minPct: number; maxPct: number }; // ช่วง % ค่าแรง เช่น 30–37 — จากเอกสารทางการเท่านั้น
  contingencyPct?: number; // % เงินเผื่อจำเป็น — จากเอกสารทางการเท่านั้น (ไม่มีค่า default ในโค้ด)
  swcPct?: number; // % ค่าดำเนินงาน (งานก่อสร้าง) — จากเอกสารทางการเท่านั้น
  durableHandlingPct?: number; // % ค่าดำเนินงานครุภัณฑ์ (แยกจากฐาน Factor F) — จากเอกสารทางการเท่านั้น
  notices?: string[]; // หมายเหตุ/เงื่อนไขจากประกาศ
  supersededBy?: string; // ruleset id ที่มาแทนที่ (ถ้าถูกแทนแล้ว)
  createdAt: string;
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

// checksum ของเนื้อหาตาราง (SHA-256 hex) — ผูกกับข้อมูล ไม่ผูกกับ id/วันเวลา
export async function computeChecksum(data: unknown): Promise<string> {
  const canonical = stableStringify(data);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
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
    if (!(r.C > r.B)) return `แถวที่ ${i + 1}: ขอบบน C ต้องมากกว่าขอบล่าง B`;
    if (!(r.D >= r.E)) return `แถวที่ ${i + 1}: D ควรมากกว่าหรือเท่ากับ E (F ลดลงเมื่อต้นทุนสูงขึ้น)`;
    if (i > 0) {
      const prev = sorted[i - 1];
      if (r.B < prev.C) return `แถวที่ ${i + 1}: ช่วง [${r.B}, ${r.C}] ทับซ้อนกับแถวก่อนหน้า`;
      if (r.B > prev.C) return `แถวที่ ${i + 1}: ช่วง [${r.B}, ${r.C}] มีช่องว่างจากแถวก่อนหน้า (ตารางต้องต่อเนื่อง)`;
    }
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
export async function rulesetChecksum(
  rs: {
    factorF?: FactorFTable | null;
    labor?: { minPct: number; maxPct: number } | null;
    contingencyPct?: number | null;
    swcPct?: number | null;
    durableHandlingPct?: number | null;
  },
): Promise<string> {
  return computeChecksum({
    factorF: rs.factorF ?? null,
    labor: rs.labor ?? null,
    contingencyPct: rs.contingencyPct ?? null,
    swcPct: rs.swcPct ?? null,
    durableHandlingPct: rs.durableHandlingPct ?? null,
  });
}
