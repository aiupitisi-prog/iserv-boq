export type BoqType = "ปร.1" | "ปร.2" | "ปร.3" | "ปร.4";

// หลักฐานที่มาราคา (PriceEvidence) — เก็บเมื่อเลือกราคาจากคลังราคา สนค. (TPSO)
export type PriceSource = {
  kind: "tpso";
  code: string; // รหัสสินค้าของ สนค. (commodityCode)
  prov: string; // รหัสจังหวัด/เขต (TPSO type) เช่น "10" = ส่วนกลาง
  provName: string; // ชื่อจังหวัด/เขต
  year: number; // ปี พ.ศ. ของราคา
  month: number | null; // เดือนอ้างอิงราคา (1–12)
  priceAtPick: number; // ราคา ณ ตอนเลือก (บาท/หน่วย)
  pickedAt: string; // วันเวลาที่เลือก (ISO)
};

export type BoqItem = {
  id: string;
  section: string; // หมวดงาน
  name: string; // รายการงาน
  unit: string; // หน่วย
  qty: number; // ปริมาณ
  price: number; // ราคาต่อหน่วย (บาท)
  source?: PriceSource; // ที่มาราคา (optional — โปรเจกต์เก่าที่ไม่มีฟิลด์นี้ยังใช้ได้ปกติ)
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
