import type { WorkTypeCode } from "./ruleset";

export type BoqType = "ปร.1" | "ปร.2" | "ปร.3" | "ปร.4";

// โหมดโปรเจกต์ — แยกให้ชัดตามกฎ "แยกโหมดราชการ/เอกชน"
// - gov (ค่าเริ่มต้น, โปรเจกต์เก่า): แบบฟอร์มราชการ ห้ามมีปัจจัย % อิสระ (กำไร/โอเวอร์เฮด/S.W.C./เงินเผื่อ)
// - private: ใบเสนอราคาเอกชน เปิดปัจจัย % ได้ แต่ต้องติดป้าย "ประมาณการ — ไม่ใช่ราคากลางตามหลักเกณฑ์" เสมอ
export type ProjectMode = "gov" | "private";

// เงื่อนไขการใช้ตาราง Factor F — คู่กับกล่อง "เงื่อนไขการใช้ตาราง Factor F" ในแบบ ปร.1(ก) (โหมดราชการ)
// ประกาศ ว 481 แยกตารางตาม ประเภทงาน × (ค่าจ้างล่วงหน้า % × เงินประกันผลงาน %) ที่กำหนดในสัญญา —
// เครื่องยนต์ (lib/calc) เลือกตารางด้วย selectFactorFTable จากค่าที่บันทึกที่นี่ ห้ามเดาค่าเอง
export type FactorFCond = {
  workType: WorkTypeCode; // ประเภทงาน: อาคาร / งานทาง / สะพาน+ท่อเหลี่ยม / ชลประทาน
  advancePct: number; // ค่าจ้างล่วงหน้าตามสัญญา (0/5/10/15)
  retentionPct: number; // เงินประกันผลงานตามสัญญา (0/5/10)
  noVat?: boolean; // งานเงินกู้/แหล่งทุนอื่นที่ไม่ต้องชำระ VAT → ใช้คอลัมน์ "รวมในรูป Factor" (หมายเหตุ 2 ของประกาศ ว 481)
  rain?: 1 | 2; // พื้นที่ฝนชุก → คอลัมน์ Factor F ฝนชุก 1/2 (เฉพาะงานทาง/ชลประทาน)
};

// ปัจจัยราคาระดับโปรเจกต์ (โหมดเอกชนเท่านั้น) — ผู้ใช้ตั้งเอง ไม่มีค่ากฎหมาย
export type ProjectFactors = {
  contingencyPct?: number; // เงินเผื่อจำเป็น (% ของต้นทุนรวม)
  profitPct?: number; // กำไร + โอเวอร์เฮด (% ของต้นทุน + เงินเผื่อ)
  swcPct?: number; // ค่าดำเนินงาน S.W.C. (% ของยอดรวมก่อน VAT)
  vatPct?: number; // VAT (% ของยอดรวม เช่น 7)
};

export type ProposalLine = {
  label: string;
  formula: string; // สูตรที่ใช้ แสดงให้ผู้ใช้ตรวจได้
  amount: number;
};

export type ProposalSummary = {
  base: number; // ราคาวัสดุ-แรงงานรวม
  lines: ProposalLine[];
  proposalTotal: number; // ราคาเสนอ (รวม VAT)
};

// สรุปราคาเสนอ — ลำดับการคิดตามหลักประมาณราคาเอกชน (ทุกบรรทัดแสดงสูตร)
// ต้นทุนรวม → +เงินเผื่อจำเป็น → +กำไร+โอเวอร์เฮด → +S.W.C. → +VAT
// หมายเหตุ: ยังใช้ float เหมือน itemTotal เดิม — ย้ายไป lib/calc (สตางค์ integer) ในเฟส 3
export function proposalSummary(items: BoqItem[], f: ProjectFactors | undefined): ProposalSummary {
  const base = items.reduce((sum, it) => sum + itemTotal(it), 0);
  const lines: ProposalLine[] = [];
  let acc = base;

  const contingencyPct = f?.contingencyPct ?? 0;
  if (contingencyPct > 0) {
    const amt = acc * (contingencyPct / 100);
    lines.push({ label: "เงินเผื่อจำเป็น", formula: `${contingencyPct}% × ${thb(acc)}`, amount: amt });
    acc += amt;
  }
  const profitPct = f?.profitPct ?? 0;
  if (profitPct > 0) {
    const amt = acc * (profitPct / 100);
    lines.push({ label: "กำไรและโอเวอร์เฮด", formula: `${profitPct}% × ${thb(acc)}`, amount: amt });
    acc += amt;
  }
  const swcPct = f?.swcPct ?? 0;
  if (swcPct > 0) {
    const amt = acc * (swcPct / 100);
    lines.push({ label: "ค่าดำเนินงาน (S.W.C.)", formula: `${swcPct}% × ${thb(acc)}`, amount: amt });
    acc += amt;
  }
  const vatPct = f?.vatPct ?? 0;
  if (vatPct > 0) {
    const amt = acc * (vatPct / 100);
    lines.push({ label: "ภาษีมูลค่าเพิ่ม (VAT)", formula: `${vatPct}% × ${thb(acc)}`, amount: amt });
    acc += amt;
  }
  return { base, lines, proposalTotal: acc };
}

// หลักฐานที่มาราคา (PriceEvidence) — เก็บเมื่อเลือกราคาจากคลังราคา
// ราคา สนค. (TPSO) — อ้างอิงเดือน/ปี/จังหวัด ตรวจสอบย้อนหลังได้
export type TpsoSource = {
  kind: "tpso";
  code: string; // รหัสสินค้าของ สนค. (commodityCode)
  prov: string; // รหัสจังหวัด/เขต (TPSO type) เช่น "10" = ส่วนกลาง
  provName: string; // ชื่อจังหวัด/เขต
  year: number; // ปี พ.ศ. ของราคา
  month: number | null; // เดือนอ้างอิงราคา (1–12)
  priceAtPick: number; // ราคา ณ ตอนเลือก (บาท/หน่วย)
  pickedAt: string; // วันเวลาที่เลือก (ISO)
};

// ราคาส่วนตัว (คลังราคาของฉัน) — ค่าแรง/อุปกรณ์/วัสดุท้องถิ่นที่ผู้ใช้ป้อนเอง
export type PrivateSource = {
  kind: "private";
  entryId: string; // รหัสรายการในคลังส่วนตัว (ตอนเลือก)
  category: string; // วัสดุ / ค่าแรง / อื่น ๆ
  note?: string; // เหตุผลกำกับที่มาราคา (แนะนำให้ใส่ทุกครั้ง)
  priceAgeRef: string; // วันที่อัปเดตราคาของรายการส่วนตัว ณ ตอนเลือก (ISO) — ใช้คิดอายุราคา
  priceAtPick: number; // ราคา ณ ตอนเลือก (บาท/หน่วย)
  pickedAt: string; // วันเวลาที่เลือก (ISO)
};

export type PriceSource = TpsoSource | PrivateSource;

export type BoqItem = {
  id: string;
  section: string; // หมวดงาน
  name: string; // รายการงาน
  unit: string; // หน่วย
  qty: number; // ปริมาณ
  price: number; // ราคาต่อหน่วย (บาท)
  source?: PriceSource; // ที่มาราคา (optional — โปรเจกต์เก่าที่ไม่มีฟิลด์นี้ยังใช้ได้ปกติ)
  part?: "construction" | "equipment"; // ส่วนของรายการ — ครุภัณฑ์แยกจากฐาน Factor F (กฎเหล็ก)
  matPrice?: number; // ราคาวัสดุ/หน่วย (แยกส่วน ก.) — ใส่คู่กับ laborPrice
  laborPrice?: number; // ราคาแรงงาน/หน่วย (แยกส่วน ข.)
  installPrice?: number; // ค่าติดตั้ง/หน่วย (optional — เฉพาะรายการครุภัณฑ์) — ตามเล่ม 2 ข้อ 2.2/ข้อ 8:
                         // ค่าติดตั้งมาจาก "การสืบราคา" แยกจากราคาครุภัณฑ์ (ราคาครุภัณฑ์ห้ามแฝงค่าติดตั้ง)
  installPriceReason?: string; // เหตุผลความจำเป็นที่ต้องมีค่าติดตั้ง (เล่ม 2 ข้อ 2.2 — พิมพ์ใน ปร.2/ปร.2(ก)/ชิ้น 9)
  installSourcingDetail?: string; // รายละเอียดประกอบการสืบราคาค่าติดตั้ง (เล่ม 2 ข้อ 2.2 — พิมพ์ใน ปร.2/ปร.2(ก)/ชิ้น 9)
  note?: string; // เหตุผลกำกับ เช่น ที่มาค่าแรงแบบ fallback — แสดงในเอกสารพิมพ์
};

// ข้อมูลการประมูล / สัญญาจ้าง — ใช้จัดทำ "แบบแสดงรายการ ปริมาณงาน และราคา (แนบท้ายสัญญา)"
// ที่ปรับลดราคาตามคำเสนอของผู้ได้รับคัดเลือก — ฟิลด์ optional + backward compatible
// (โปรเจกต์เก่าใน IDB/localStorage ที่ไม่มีช่องนี้ ยังเปิดและแก้ได้ปกติ)
export type ProjectAward = {
  winningPrice?: number; // ราคาตามคำเสนอของผู้ได้รับคัดเลือก (บาท) — จากผลการเปิดประมูล
  contractNoteDate?: string; // สัญญาเลขที่ / ลงวันที่
  contractor?: string; // ชื่อผู้รับจ้าง
  contractorSigner?: string; // ผู้ลงนามฝ่ายผู้รับจ้าง
  savedAt?: string; // เวลาบันทึกล่าสุด (ISO)
};

// ค่าใช้จ่ายพิเศษตามข้อกำหนด (แบบ ปร.3 + แบบแสดงการคำนวณและเหตุผลความจำเป็น) — เล่ม 2 ข้อ 2.3/ข้อ 9:
// รายการใดต้องชำระ VAT ให้รวม VAT ไว้ด้วย (vatIncluded = true) — แบบเหตุผลแยกแสดง "รวมค่าใช้จ่าย /
// ค่าภาษีมูลค่าเพิ่ม (เฉพาะรายการที่มี) / ค่าใช้จ่ายรวมค่าภาษีมูลค่าเพิ่ม"
export type SpecialExpense = {
  id: string;
  name: string; // รายการ
  qty: number; // จำนวน
  unit: string; // หน่วย
  amount: number; // ค่าใช้จ่าย (บาท — ยังไม่รวม VAT; ระบบเติม VAT ตาม vatIncluded)
  vatIncluded: boolean; // รายการนี้ต้องชำระค่าภาษีมูลค่าเพิ่มหรือไม่
  reason?: string; // 1. เหตุผลและความจำเป็นที่ต้องมีค่าใช้จ่ายพิเศษ
  calcDetail?: string; // 2. รายละเอียดการคำนวณ (ข้อความอิสระ)
};

// คณะกรรมการกำหนดราคากลาง — ช่องลงนามและหัวแบบฟอร์ม ปร.1(ก)/ปร.2(ก)/ปร.3/ปร.4 (ฟิลด์ optional)
export type Committee = {
  agency?: string; // หน่วยงานเจ้าของโครงการงานก่อสร้าง (แสดงหัวทุกแบบฟอร์ม)
  chairman?: string; // ประธานกรรมการกำหนดราคากลาง
  member1?: string; // กรรมการกำหนดราคากลาง (คนที่ 1)
  member2?: string; // กรรมการกำหนดราคากลาง (คนที่ 2)
  formNo?: string; // แบบเลขที่ (แสดงหัวแบบฟอร์ม "แบบเลขที่ …")
  calcDate?: string; // "คำนวณราคากลาง เมื่อวันที่ …" (ข้อความอิสระ เช่น "12 พฤศจิกายน 2569")
  savedAt?: string; // เวลาบันทึกล่าสุด (ISO)
};

export type BoqProject = {
  id: string;
  name: string;
  address: string;
  boqType: BoqType;
  createdAt: string;
  items: BoqItem[];
  province?: string; // จังหวัดอ้างอิงราคา (TPSO type) เช่น "40" — ใช้เป็นค่าเริ่มต้นใน picker
  budgetYear?: number; // ปีงบประมาณ พ.ศ. — ใช้เป็นค่าเริ่มต้นใน picker
  mode?: ProjectMode; // โหมดโปรเจกต์ — ไม่ระบุ = "gov" (โปรเจกต์เก่า)
  factors?: ProjectFactors; // ปัจจัยราคาเสนอ (โหมดเอกชนเท่านั้น)
  rulesetId?: string; // pin ชุดกฎราคากลางที่ใช้ (เตรียมเครื่องยนต์เฟส 3)
  factorFCond?: FactorFCond; // เงื่อนไขเลือกตาราง Factor F ตามสัญญา (ประกาศ ว 481 = 48 ตาราง; โปรเจกต์เก่า = undefined)
  award?: ProjectAward; // ข้อมูลการประมูล/สัญญา — ใช้ที่เอกสารแนบท้ายสัญญา (โปรเจกต์เก่า = undefined)
  specialExpenses?: SpecialExpense[]; // ค่าใช้จ่ายพิเศษตามข้อกำหนด (แบบ ปร.3) — ไม่มี = ไม่ต้องออก ปร.3
  committee?: Committee; // คณะกรรมการกำหนดราคากลาง + แบบเลขที่/วันที่คำนวณ — ใช้ชุดเอกสาร 9 ชิ้น (ระเบียบ 2569)
  buildingAreaSqm?: number; // ขนาดหรือเนื้อที่อาคาร (ตร.ม.) — แสดงท้าย ปร.1(ก) ("เฉลี่ย … บาทต่อตร.ม.")
};

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "id_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const BOQ_TYPES: BoqType[] = ["ปร.1", "ปร.2", "ปร.3", "ปร.4"];

export function thb(n: number): string {
  return n.toLocaleString("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 2,
  });
}

export function itemTotal(it: BoqItem): number {
  const q = isFinite(it.qty) ? it.qty : 0;
  const p = isFinite(it.price) ? it.price : 0;
  return q * p;
}

export function projectTotal(p: BoqProject): number {
  return p.items.reduce((sum, it) => sum + itemTotal(it), 0);
}

export function sectionTotals(p: BoqProject): { section: string; total: number }[] {
  const map = new Map<string, number>();
  for (const it of p.items) {
    map.set(it.section, (map.get(it.section) ?? 0) + itemTotal(it));
  }
  return [...map.entries()].map(([section, total]) => ({ section, total }));
}

// ตัวอย่าง BOQ (ข้อมูลสมมุติเพื่อทดลองระบบ ไม่ใช่ราคาอ้างอิงของหน่วยงานใด)
const SMALL_ITEMS: Omit<BoqItem, "id">[] = [
  { section: "งานการเบื้องต้น", name: "ค่าบริหารและควบคุมงาน รวมรักษาความปลอดภัย", unit: "งาน", qty: 1, price: 12000 },
  { section: "งานการเบื้องต้น", name: "ค่าตั้งเต็นท์เก็บวัสดุประจำหน้างาน", unit: "ตร.ม.", qty: 30, price: 350 },
  { section: "งานโครงสร้าง", name: "งานเสาเข็มคอนกรีตสำเร็จรูป ขนาด 25×25 ซม.", unit: "เมตร", qty: 96, price: 480 },
  { section: "งานโครงสร้าง", name: "งานคอนกรีตโครงสร้าง กำลังอัด 250 กก./ตร.ซม.", unit: "ลบ.ม.", qty: 42, price: 3400 },
  { section: "งานโครงสร้าง", name: "เหล็กเส้นกลมและเหล็กเส้นข้อแกว่ง ทุกขนาด", unit: "ตัน", qty: 3.5, price: 32000 },
  { section: "งานโครงสร้าง", name: "ไม้แบบเทคอนกรีตพื้นและเพดาน", unit: "ตร.ม.", qty: 180, price: 210 },
  { section: "งานก่ออิฐ", name: "ก่ออิฐมอญหนา 15 ซม. (ผนังบาง)", unit: "ลบ.ม.", qty: 41, price: 1650 },
  { section: "งานฉาบสี", name: "ฉาบปูนซีเมนต์ผนัง ผิวเรียบ", unit: "ตร.ม.", qty: 420, price: 295 },
  { section: "งานฉาบสี", name: "ทาสีอะคริลิกลวงน้ำ ผนังภายในและภายนอก", unit: "ตร.ม.", qty: 420, price: 160 },
  { section: "งานระบบไฟฟ้า", name: "ระบบแสงสว่างและรางราบจุดไฟฟ้า", unit: "จุด", qty: 64, price: 830 },
  { section: "งานระบบไฟฟ้า", name: "ตู้พาเนลหลักพร้อมเซอร์กิตเบรกเกอร์", unit: "ตู้", qty: 2, price: 14500 },
  { section: "งานระบบสุขภาพ", name: "ระบบประปาและท่อระบายน้ำ PVC", unit: "เมตร", qty: 58, price: 224 },
  { section: "งานระบบสุขภาพ", name: "ชุดสุขภัณธิ (ชักโครก อ่างล้างหน้า พร้อมท่อ)", unit: "ชุด", qty: 6, price: 14200 },
  { section: "งานหลังคา", name: "แผ่นหลังคาโลหะเคลือบสี", unit: "ตร.ม.", qty: 210, price: 460 },
];

const LARGE_ITEMS: Omit<BoqItem, "id">[] = [
  { section: "งานการเบื้องต้น", name: "ค่าบริหารงาน ควบคุมงาน และรักษาความปลอดภัยทุกหน้างาน", unit: "งาน", qty: 1, price: 320000 },
  { section: "งานการเบื้องต้น", name: "ค่าตั้งโรงงานประจำหน้างานถาวรและสำนักงานวิศวกรรม", unit: "ตร.ม.", qty: 260, price: 420 },
  { section: "งานเสาเข็ม", name: "เสาเข็มเจาะสำหรับพื้นที่ดินอ่อน ระยะลึก 24 เมตร", unit: "เมตร", qty: 1200, price: 850 },
  { section: "งานเสาเข็ม", name: "คอนกรีตเทลงกระบอกเสาเข็มเจาะและพื้นที่ฐานเสา", unit: "ลบ.ม.", qty: 120, price: 3600 },
  { section: "งานโครงสร้างคอนกรีต", name: "คอนกรีตกันน้ำบริเวณฐานรากและท่อระบายน้ำ", unit: "ลบ.ม.", qty: 420, price: 3400 },
  { section: "งานโครงสร้างคอนกรีต", name: "เหล็กเส้นกลม เหล็กเส้นข้อแกว่ง สำหรับเสา คา และพื้น", unit: "ตัน", qty: 52, price: 31500 },
  { section: "งานโครงสร้างคอนกรีต", name: "ไม้แบบเทคอนกรีตพื้นและเพดานทั้งหมด", unit: "ตร.ม.", qty: 2400, price: 260 },
  { section: "งานหลังคาและกันสาด", name: "แผงหลังคาโลหะเคลือบสีทั้งหมด", unit: "ตร.ม.", qty: 1800, price: 585 },
  { section: "งานหลังคาและกันสาด", name: "งานกันสาดโลหะ ยื่น 3 เมตร และใบแอกข้าง", unit: "ตร.ม.", qty: 760, price: 740 },
  { section: "งานก่ออิฐ", name: "ก่ออิฐมอญผนังบางและหนา ทุกส่วนของอาคาร", unit: "ลบ.ม.", qty: 380, price: 1700 },
  { section: "งานฉาบและสีอะคริลิก", name: "ฉาบปูนซีเมนต์ผนังหนาต่างระยะ (ผนังทั้งหมด)", unit: "ตร.ม.", qty: 4400, price: 295 },
  { section: "งานฉาบและสีอะครีลิก", name: "ทาสีอะครีลิกสูงประสิทธิภาพ ผนังภายในและภายนอก", unit: "ตร.ม.", qty: 4400, price: 168 },
  { section: "ระบบไฟฟ้า", name: "ระบบไฟฟ้าและแสงสว่างสำหรับสำนักงานและอาคาร", unit: "จุด", qty: 640, price: 850 },
  { section: "ระบบไฟฟ้า", name: "ตู้พาเนลหลักและเซอร์กิตโปรเตกชันทุกส่วน", unit: "ตู้", qty: 16, price: 14450 },
  { section: "ระบบไฟฟ้า", name: "รางราวสายไฟและสายแยกระบบ เดินตามผนัง", unit: "เมตร", qty: 4200, price: 78 },
  { section: "ระบบสุขาภิบาล", name: "ชุดสุขภัณฑ์สำหรับสำนักงานและห้องน้ำสาธารณะ", unit: "ชุด", qty: 48, price: 15400 },
  { section: "ระบบสุขาภิบาล", name: "ระบบดับเพลิงอัตโนมัติพร้อมระบบท่อ/", unit: "เมตร", qty: 1800, price: 620 },
  { section: "งานผิวอาคาร", name: "ผนังแผงเบา (ไวนิลไต่สาย) ทั้งหมด", unit: "ตร.ม.", qty: 2400, price: 1230 },
  { section: "งานผิวอาคาร", name: "หน้าต่างอลูมิเนียมบานใหญ่และกรอบทางด้านหน้า", unit: "ตร.ม.", qty: 800, price: 5400 },
  { section: "งานพื้น", name: "พื้นลามิเนตสำหรับพื้นที่สำนักงาน", unit: "ตร.ม.", qty: 3200, price: 460 },
  { section: "งานพื้น", name: "พื้นคอนกรีตกลางแจ้งและทางเข้าโรงงาน", unit: "ตร.ม.", qty: 1500, price: 560 },
  { section: "งานบันไดและเทียน", name: "บันไดคอนกรีตทุกชั้น พร้อมผิวที่ทางออกทั้งหมด", unit: "ตร.ม.", qty: 340, price: 980 },
  { section: "งานบันไดและเทียน", name: "เหล็กสำหรับราวจับบันไดทั้งหมด", unit: "เมตร", qty: 220, price: 940 },
  { section: "งานเกราะและประตู", name: "ประตูและกรอบเหล็กสำหรับสำนักงานทุกห้อง", unit: "ชุด", qty: 80, price: 12500 },
];

const mapItems = (rows: Omit<BoqItem, "id">[]): BoqItem[] =>
  rows.map((r) => ({ ...r, id: newId() }));

export type SampleSet = { key: "small" | "large"; label: string; items: BoqItem[] };

export const SAMPLES: SampleSet[] = [
  {
    key: "small",
    label: "BOQ ขนาดเล็ก — อาคารสำนักงานชั้นเดียว (14 รายการ)",
    items: mapItems(SMALL_ITEMS),
  },
  {
    key: "large",
    label: "BOQ ขนาดใหญ่ — ศูนย์ราชการหลายอาคาร (ตัวอย่าง)",
    items: mapItems(LARGE_ITEMS),
  },
];

const THAI_MONTHS = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export function sourceLabel(it: BoqItem): string {
  const s = it.source;
  if (!s) return "ป้อนเอง / ไม่ระบุ";
  if (s.kind === "tpso") {
    return `ราคา สนค. ${s.provName} ปี ${s.year}${s.month ? " เดือน " + THAI_MONTHS[s.month] : ""} (รหัส ${s.code})`;
  }
  return `คลังราคาของฉัน (${s.category})${s.note ? " — " + s.note : ""}`;
}

export function sourcePickedAt(it: BoqItem): string {
  const s = it.source;
  if (!s) return "";
  const d = new Date(s.pickedAt);
  return isNaN(d.getTime()) ? s.pickedAt : d.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
}

export function partLabel(it: BoqItem): string {
  return it.part === "equipment" ? "ครุภัณฑ์" : "งานก่อสร้าง";
}
