// ค่าเครื่องจักรตามตาราง กค 0433.2/ว 475 — pure function (ไม่มี I/O)
//
// ตาราง ว 475 ให้ 5 ค่าต่อบรรทัด ณ ช่วงราคาน้ำมันดีเซลหนึ่ง:
//   ค่าดำเนินการ + ค่าเสื่อมราคา (ปกติ) = รวมค่างาน (ปกติ)
//   ค่าดำเนินการ + ค่าเสื่อมราคา (ฝนชุก) = รวมค่างาน (ฝนชุก)
// ตัวเลขทั้งชุดเป็น "สตางค์" จำนวนเต็มอยู่แล้ว (parser แปลงจากบาททศนิยม 2 ตำแหน่ง)
//
// กฎเหล็กที่บังคับในไฟล์นี้:
// - ห้าม extrapolate: ราคาน้ำมันนอกช่วงตาราง → error ไม่คืนค่าประมาณ
// - บรรทัดหัวข้อ (priced = "none") ไม่มีราคา → error (ไม่เดาว่าเป็น 0)
// - ค่าก้อนเดียว (priced = "lump" เช่น ค่าติดตั้งเครื่องผสม) คิดเป็น "ครั้ง" ไม่ใช่ต่อหน่วยงาน
// - รวมค่างานใช้ค่าที่พิมพ์ในตาราง และตรวจว่า = ค่าดำเนินการ + ค่าเสื่อมราคา (ข้อมูลเพี้ยน → error)
// - ปริมาณเป็นเศษส่วนได้ ไม่เกิน 4 ตำแหน่ง — คูณด้วย integer scaling (×10000) ไม่ให้ float เพี้ยน
//   และปฏิเสธเมื่อผลลัพธ์เกิน Number.MAX_SAFE_INTEGER (BAD_QUANTITY)
// - ผลลัพธ์เป็น "ต้นทุนค่าเครื่องจักร" ตามตาราง ยังไม่รวม Factor F / กำไร / VAT
// - วิธีปัดเศษ half-up ยังเป็นข้อสมมติที่ยังไม่ยืนยันกับต้นฉบับ (PRD ข้อสมมติ 2) — ระบุใน notes ทุกครั้ง

import type { MachineryRateBand, MachineryRateItem, MachineryRateSchedule } from "../ruleset";
import { findMachineryBand, findMachineryItem, machineryRateAt, type MachineryRate } from "../ruleset";
import { formatSatang, type Satang } from "./money";

export type MachineryCostQuery = {
  entryNo: number;
  label: string;
  occurrence?: number; // ครั้งที่ของชื่อซ้ำในลำดับเดียวกัน (ไม่ระบุ = 1)
  fuelPriceSatang: number; // ราคาน้ำมันดีเซล สตางค์/ลิตร (30.50 บาท = 3050)
  rainy?: boolean; // true = ใช้คอลัมน์ฝนชุก
  quantity?: number; // ปริมาณงาน (ตามหน่วยของบรรทัด, ทศนิยม ≤4 ตำแหน่ง) — ไม่ระบุ = คิดเฉพาะราคา/หน่วย
  // ที่มาของชุดกฎ (ไว้แสดง trace) — ไม่ส่งก็ได้; ค่าที่ส่งจะถูกใส่ใน notes ตามจริง
  provenance?: { rulesetId?: string; rulesetChecksum?: string };
};

export type MachineryCostErrorCode =
  | "ITEM_NOT_FOUND"
  | "ITEM_NO_PRICE"
  | "FUEL_OUT_OF_RANGE"
  | "DATA_INCONSISTENT"
  | "BAD_QUANTITY";

export type MachineryCostOk = {
  ok: true;
  item: MachineryRateItem;
  band: MachineryRateBand;
  rate: MachineryRate;
  rainy: boolean;
  isLump: boolean;
  // five = รวมค่างาน/หน่วยตามคอลัมน์ที่เลือก · lump = จำนวนเงิน "ต่อครั้ง" (ไม่ใช่ต่อหน่วยงาน)
  perUnitSatang: Satang;
  amountSatang: Satang | null; // null = ไม่ได้ระบุปริมาณ
  unit: string | null;
  notes: string[];
};

export type MachineryCostErr = { ok: false; code: MachineryCostErrorCode; error: string };
export type MachineryCostResult = MachineryCostOk | MachineryCostErr;

const err = (code: MachineryCostErrorCode, error: string): MachineryCostErr => ({ ok: false, code, error });

const fmtFuel = (satang: number): string => (satang / 100).toFixed(2);

// ปริมาณรองรับทศนิยมไม่เกิน 4 ตำแหน่ง → คูณ 10000 เป็นจำนวนเต็มเพื่อคูณแบบเลขเต็ม
const QTY_SCALE = 10_000;
const QTY_EPS = 1e-6;

export function machineryCost(schedule: MachineryRateSchedule, q: MachineryCostQuery): MachineryCostResult {
  const item = findMachineryItem(schedule, { entryNo: q.entryNo, label: q.label, occurrence: q.occurrence });
  if (!item) {
    const occ = q.occurrence !== undefined && q.occurrence > 1 ? ` (ครั้งที่ ${q.occurrence})` : "";
    return err("ITEM_NOT_FOUND", `ไม่พบรายการ ลำดับ ${q.entryNo} · "${q.label}"${occ} ในตาราง`);
  }
  if (item.priced === "none") {
    return err(
      "ITEM_NO_PRICE",
      `"${item.label}" เป็นบรรทัดหัวข้อที่ต้นฉบับไม่พิมพ์ราคา — เลือกบรรทัดย่อยที่มีราคา`,
    );
  }

  const band = findMachineryBand(schedule, q.fuelPriceSatang);
  if (!band) {
    const lo = schedule.bands[0]?.fuelMinSatang ?? 0;
    const hi = schedule.bands[schedule.bands.length - 1]?.fuelMaxSatang ?? 0;
    return err(
      "FUEL_OUT_OF_RANGE",
      `ราคาน้ำมันดีเซล ${fmtFuel(q.fuelPriceSatang)} บาท/ลิตร อยู่นอกช่วงของตาราง (${fmtFuel(lo)}–${fmtFuel(hi)}) — ไม่ประมาณค่าออกนอกตาราง`,
    );
  }

  const rate = machineryRateAt(schedule, band, item);
  if (!rate) {
    return err(
      "DATA_INCONSISTENT",
      `ข้อมูลตารางไม่สอดคล้อง: ไม่พบค่าของ "${item.label}" ในช่วงน้ำมัน ${fmtFuel(band.fuelMinSatang)}–${fmtFuel(band.fuelMaxSatang)} — ไฟล์อาจถูกแก้ ให้นำเข้าชุดตารางใหม่`,
    );
  }

  const provenanceNotes = sourceNotes(schedule, band, q.provenance);
  const isLump = item.priced === "lump";
  const rainy = q.rainy === true;

  if (isLump) {
    // ค่าก้อนเดียว: มีเฉพาะค่าดำเนินการ — คิดเป็นครั้ง
    if (rate.operationSatang === null) {
      return err("DATA_INCONSISTENT", `ข้อมูลตารางไม่สอดคล้อง: "${item.label}" มีสถานะค่าก้อนเดียวแต่ไม่มีจำนวนเงิน`);
    }
    const qtyErr = lumpCountError(q.quantity);
    if (qtyErr) return err("BAD_QUANTITY", qtyErr);
    const perUnitSatang = rate.operationSatang;
    let amountSatang: Satang | null = null;
    if (q.quantity !== undefined) {
      const amount = perUnitSatang * q.quantity;
      if (!Number.isSafeInteger(amount)) return err("BAD_QUANTITY", safeAmountError(q.quantity));
      amountSatang = amount;
    }
    return {
      ok: true,
      item,
      band,
      rate,
      rainy,
      isLump,
      perUnitSatang,
      amountSatang,
      unit: item.unit,
      notes: [
        `ค่าก้อนเดียว ${formatSatang(perUnitSatang)} บาท/ครั้ง — ต้นฉบับคิดเป็นครั้ง ไม่ใช่ราคาต่อหน่วยงาน`,
        ...(rainy ? ["ค่าก้อนเดียวไม่มีคอลัมน์แยกสภาพฝนชุกในตาราง — ใช้จำนวนเงินเดียวกันทั้งสภาพปกติและฝนชุก"] : []),
        `ช่วงราคาน้ำมันดีเซล ${fmtFuel(band.fuelMinSatang)}–${fmtFuel(band.fuelMaxSatang)} บาท/ลิตร (ฐาน ${schedule.fuelPriceBasis})`,
        ...provenanceNotes,
        ...(amountSatang === null
          ? []
          : [`จำนวน ${q.quantity} ครั้ง × ${formatSatang(perUnitSatang)} = ${formatSatang(amountSatang)} บาท`]),
        "ค่านี้เป็นต้นทุนค่าเครื่องจักรตามตาราง ยังไม่รวม Factor F กำไร หรือ VAT",
      ],
    };
  }

  // บรรทัดราคา 5 ค่า: เลือกคอลัมน์ตามสภาพงาน แล้วตรวจว่าตัวเลขในตารางสอดคล้องกัน
  const op = rate.operationSatang;
  const dep = rainy ? rate.depRainySatang : rate.depNormalSatang;
  const total = rainy ? rate.totalRainySatang : rate.totalNormalSatang;
  if (op === null || dep === null || total === null) {
    return err(
      "DATA_INCONSISTENT",
      `ข้อมูลตารางไม่สอดคล้อง: "${item.label}" (${rainy ? "ฝนชุก" : "ปกติ"}) มีช่องราคาว่าง — ไฟล์อาจถูกแก้ ให้นำเข้าชุดตารางใหม่`,
    );
  }
  if (op + dep !== total) {
    return err(
      "DATA_INCONSISTENT",
      `ข้อมูลตารางไม่สอดคล้อง: ค่าดำเนินการ ${formatSatang(op)} + ค่าเสื่อมราคา ${formatSatang(dep)} ≠ รวมค่างาน ${formatSatang(total)} ("${item.label}" · ${rainy ? "ฝนชุก" : "ปกติ"}) — ไฟล์อาจถูกแก้ ให้นำเข้าชุดตารางใหม่`,
    );
  }

  const scaled = scaledQuantity(q.quantity);
  if (!scaled.ok) return err("BAD_QUANTITY", scaled.error);

  const perUnitSatang = total;
  // คูณแบบ integer scaling: (สตางค์/หน่วย × ปริมาณ×10000) แล้วหาร 10000 ปัด half-up ครั้งเดียว
  let amountSatang: Satang | null = null;
  if (scaled.scaled !== null) {
    const numerator = perUnitSatang * scaled.scaled; // สตางค์ × 10000
    // ตรวจทั้งก่อนและหลังบวกครึ่งสเกล (กันการปัดที่ขอบ safe integer)
    if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(numerator + QTY_SCALE / 2)) {
      return err("BAD_QUANTITY", safeAmountError(q.quantity));
    }
    amountSatang = Math.floor((numerator + QTY_SCALE / 2) / QTY_SCALE);
  }

  return {
    ok: true,
    item,
    band,
    rate,
    rainy,
    isLump,
    perUnitSatang,
    amountSatang,
    unit: item.unit,
    notes: [
      `ค่าดำเนินการ ${formatSatang(op)} + ค่าเสื่อมราคา (${rainy ? "ฝนชุก" : "ปกติ"}) ${formatSatang(dep)} = ${formatSatang(total)} บาท/${item.unit ?? "หน่วย"}`,
      "รวมค่างานใช้ค่าที่พิมพ์ในตาราง (ตรวจแล้วตรงกับค่าดำเนินการ + ค่าเสื่อมราคา)",
      `ช่วงราคาน้ำมันดีเซล ${fmtFuel(band.fuelMinSatang)}–${fmtFuel(band.fuelMaxSatang)} บาท/ลิตร (ฐาน ${schedule.fuelPriceBasis})`,
      ...provenanceNotes,
      ...(amountSatang === null
        ? []
        : [
            `ปริมาณ ${q.quantity} ${item.unit ?? "หน่วย"} × ${formatSatang(perUnitSatang)} = ${formatSatang(amountSatang)} บาท`,
            ...(amountSatang === 0
              ? ["ยอดรวมปัดลงต่ำกว่า 0.01 บาท (แสดง 0.00) ตามกติกาปัดเศษเป็นสตางค์ — ไม่ใช่ระบบขัดข้อง"]
              : []),
            "วิธีปัดเศษ half-up ยังไม่ยืนยันกับต้นฉบับ (ข้อสมมติ 2 ของ PRD) — ตรวจกับคู่มือ/เล่มประกาศก่อนใช้ในเอกสารส่งหน่วยงาน",
          ]),
      "ค่านี้เป็นต้นทุนค่าเครื่องจักรตามตาราง ยังไม่รวม Factor F กำไร หรือ VAT",
    ],
  };
}

// ที่มาของตัวเลข: หัวตารางที่พิมพ์ + เลขหน้าต้นฉบับ + ชุดกฎที่ใช้ (ถ้าผู้เรียกส่งมา)
function sourceNotes(
  schedule: MachineryRateSchedule,
  band: MachineryRateBand,
  prov: MachineryCostQuery["provenance"],
): string[] {
  const notes = [
    `แหล่งตัวเลข: ${schedule.titlePrinted} — หน้าต้นฉบับ ${band.sourcePages[0]}–${band.sourcePages[1]}`,
  ];
  if (prov?.rulesetId) {
    notes.push(`ชุดกฎ: ${prov.rulesetId}${prov.rulesetChecksum ? ` · checksum ${prov.rulesetChecksum}` : ""}`);
  }
  return notes;
}

// ปริมาณ: รับทศนิยมไม่เกิน 4 ตำแหน่ง แล้วคูณ 10,000 เป็นจำนวนเต็ม (ไม่ให้ float เพี้ยนตอนคูณ)
function scaledQuantity(qty: number | undefined): { ok: true; scaled: number | null } | { ok: false; error: string } {
  if (qty === undefined) return { ok: true, scaled: null };
  if (!Number.isFinite(qty)) return { ok: false, error: `ปริมาณต้องเป็นตัวเลข (ได้ ${String(qty)})` };
  if (qty <= 0) return { ok: false, error: `ปริมาณต้องมากกว่า 0 (ได้ ${qty})` };
  const raw = qty * QTY_SCALE;
  const scaled = Math.round(raw);
  // tolerance ตาม ulp ของ double (ขั้นต่ำ 1e-6) — ค่าสัมบูรณ์ 1e-6 ไม่พอเมื่อ raw ใหญ่มาก
  const tol = Math.max(QTY_EPS, Number.EPSILON * Math.max(1, Math.abs(raw)) * 8);
  if (Math.abs(raw - scaled) > tol) {
    return { ok: false, error: `ปริมาณรองรับทศนิยมไม่เกิน 4 ตำแหน่ง (ได้ ${qty}) — แปลงหน่วยให้เล็กลงก่อน` };
  }
  if (!Number.isSafeInteger(scaled)) {
    return { ok: false, error: `ปริมาณมากเกินขอบเขตที่คำนวณได้อย่างแม่นยำ (ได้ ${qty}) — เกิน Number.MAX_SAFE_INTEGER` };
  }
  return { ok: true, scaled };
}

const safeAmountError = (qty: number | undefined): string =>
  `ปริมาณ ${qty} มากเกินขอบเขตที่คำนวณได้อย่างแม่นยำ (สตางค์เกิน Number.MAX_SAFE_INTEGER) — ลดปริมาณหรือแยกเป็นหลายรายการ`;

function lumpCountError(qty: number | undefined): string | null {
  if (qty === undefined) return null;
  if (!Number.isFinite(qty)) return `จำนวนครั้งต้องเป็นตัวเลข (ได้ ${String(qty)})`;
  if (!Number.isInteger(qty)) return `จำนวนครั้งต้องเป็นจำนวนเต็ม ≥ 1 (ได้ ${qty}) — ค่าก้อนเดียวคิดเป็นครั้ง`;
  if (qty < 1) return `จำนวนครั้งต้องเป็นจำนวนเต็ม ≥ 1 (ได้ ${qty})`;
  return null;
}
