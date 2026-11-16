// ค่าขนส่งวัสดุก่อสร้างตามตาราง กค 0433.2/ว 477 — pure function (ไม่มี I/O)
//
// ตาราง ว 477 ให้ราคาขนส่งต่อตัน/ต่อลบ.ม. ตามระยะทาง 1–200 กม. และช่วงราคาน้ำมันดีเซล
// ระยะ 201–1000 กม. คิดเป็น "กม.ละ" ต่อตัน/ต่อลบ.ม. ตามหมายเหตุข้อ 1/2 ของตาราง
//
// กฎเหล็กที่บังคับในไฟล์นี้:
// - ตารางใช้ได้เฉพาะเมื่อสภาพงานตรงเงื่อนไขที่หัวตารางระบุ (ภูมิประเทศ/ผิวทาง/การจราจร)
//   → ผู้เรียกต้องส่ง conditionsAccepted = true อย่างชัดเจน; ไม่ส่ง = error (ไม่เดาว่าตรง)
// - ห้าม extrapolate: ราคาน้ำมันนอกช่วงตาราง หรือระยะทางเกิน farMaxKm → error
// - ระยะทางต้องเป็นจำนวนเต็ม กม. (ห้ามปัดเศษระยะเงียบ ๆ)
// - เงินเป็นสตางค์ integer — ปริมาณคูณแบบ integer scaling (×10000) + ตรวจ safe integer
// - ผลลัพธ์เป็น "ค่าขนส่ง" ตามตาราง ยังไม่รวม Factor F / กำไร / VAT
// - วิธีปัดเศษ half-up ยังเป็นข้อสมมติที่ยังไม่ยืนยันกับต้นฉบับ (PRD ข้อสมมติ 2) — ระบุใน notes

import type {
  TransportCharge,
  TransportFuelBand,
  TransportSchedule,
  TransportTruckSection,
} from "../ruleset";
import { transportBandNotices, transportChargeAt } from "../ruleset";
import { formatSatang, type Satang } from "./money";
import { amountFromScaled, scaledQuantity } from "./quantity";

export type TransportCargo = "ton" | "m3";

export type TransportCostQuery = {
  lorryCount: number; // จำนวนล้อตามหัวตาราง (6 / 10)
  hasTrailer: boolean; // true = รถลากพ่วง
  grossTons?: number; // น้ำหนักรวม (ตัน) — ใช้ตรวจเพดานของประเภทารถ
  fuelPriceSatang: number; // ราคาน้ำมันดีเซล สตางค์/ลิตร
  distanceKm: number; // ระยะทางขนส่ง (กม.) — จำนวนเต็มเท่านั้น
  cargo: TransportCargo; // ton = ต่อตัน · m3 = ต่อลบ.ม.
  quantity?: number; // ปริมาณ (ตัน/ลบ.ม., ทศนิยม ≤4 ตำแหน่ง) — ไม่ระบุ = คิดเฉพาะอัตราต่อหน่วย
  conditionsAccepted: boolean; // ผู้ใช้ยืนยันว่าสภาพงานตรงเงื่อนไขหัวตาราง
  provenance?: { rulesetId?: string; rulesetChecksum?: string };
};

export type TransportCostErrorCode =
  | "SECTION_NOT_FOUND"
  | "GROSS_OVER_LIMIT"
  | "FUEL_OUT_OF_RANGE"
  | "DISTANCE_OUT_OF_RANGE"
  | "BAD_DISTANCE"
  | "CONDITIONS_NOT_CONFIRMED"
  | "BAD_QUANTITY"
  | "DATA_INCONSISTENT";

export type TransportCostOk = {
  ok: true;
  section: TransportTruckSection;
  band: TransportFuelBand;
  charge: TransportCharge;
  cargo: TransportCargo;
  basis: TransportCharge["basis"];
  perUnitSatang: Satang; // ค่าขนส่งต่อตัน/ต่อลบ.ม. ณ ระยะที่ระบุ
  amountSatang: Satang | null; // null = ไม่ได้ระบุปริมาณ
  notes: string[];
};

export type TransportCostErr = { ok: false; code: TransportCostErrorCode; error: string };
export type TransportCostResult = TransportCostOk | TransportCostErr;

const err = (code: TransportCostErrorCode, error: string): TransportCostErr => ({ ok: false, code, error });

const fmtFuel = (satang: number): string => (satang / 100).toFixed(2);

export function transportCost(schedule: TransportSchedule, q: TransportCostQuery): TransportCostResult {
  const section =
    schedule.sections.find((s) => s.lorryCount === q.lorryCount && s.hasTrailer === q.hasTrailer) ?? null;
  if (!section) {
    return err(
      "SECTION_NOT_FOUND",
      `ไม่พบประเภทารถ ${q.lorryCount} ล้อ${q.hasTrailer ? " + รถลากพ่วง" : ""} ในตาราง`,
    );
  }

  if (q.grossTons !== undefined) {
    if (!Number.isFinite(q.grossTons) || q.grossTons <= 0) {
      return err("BAD_QUANTITY", `น้ำหนักรวมต้องเป็นตัวเลขมากกว่า 0 (ได้ ${String(q.grossTons)})`);
    }
    if (q.grossTons > section.maxGrossTons) {
      return err(
        "GROSS_OVER_LIMIT",
        `น้ำหนักรวม ${q.grossTons} ตัน เกินเพดานของรถ ${section.truckType} (ไม่เกิน ${section.maxGrossTons} ตัน) — ใช้ประเภทรถที่รองรับ`,
      );
    }
  }

  if (q.conditionsAccepted !== true) {
    return err(
      "CONDITIONS_NOT_CONFIRMED",
      `ตาราง ว 477 ใช้ได้เฉพาะเมื่อสภาพงานตรงเงื่อนไข: ${schedule.conditions.join(" · ")} — ต้องยืนยันเงื่อนไขก่อนคำนวณ`,
    );
  }

  if (!Number.isFinite(q.fuelPriceSatang)) {
    return err(
      "FUEL_OUT_OF_RANGE",
      `ราคาน้ำมันดีเซลต้องเป็นตัวเลข (ได้ ${String(q.fuelPriceSatang)}) — ไม่ประมาณค่าออกนอกตาราง`,
    );
  }

  const band =
    section.bands.find((b) => q.fuelPriceSatang >= b.fuelMinSatang && q.fuelPriceSatang <= b.fuelMaxSatang) ?? null;
  if (!band) {
    const lo = section.bands[0]?.fuelMinSatang ?? 0;
    const hi = section.bands[section.bands.length - 1]?.fuelMaxSatang ?? 0;
    return err(
      "FUEL_OUT_OF_RANGE",
      `ราคาน้ำมันดีเซล ${fmtFuel(q.fuelPriceSatang)} บาท/ลิตร อยู่นอกช่วงของตาราง (${fmtFuel(lo)}–${fmtFuel(hi)}) — ไม่ประมาณค่าออกนอกตาราง`,
    );
  }

  if (!Number.isFinite(q.distanceKm) || !Number.isInteger(q.distanceKm)) {
    return err(
      "BAD_DISTANCE",
      `ระยะทางต้องเป็นจำนวนเต็ม กม. (ได้ ${String(q.distanceKm)}) — ระบบไม่ปัดเศษระยะทางให้`,
    );
  }
  if (q.distanceKm < schedule.distanceStartKm) {
    return err(
      "DISTANCE_OUT_OF_RANGE",
      `ระยะทาง ${q.distanceKm} กม. น้อยกว่าเริ่มต้นของตาราง (${schedule.distanceStartKm} กม.)`,
    );
  }

  const charge = transportChargeAt(schedule, band, q.distanceKm);
  if (!charge) {
    const last = band.farMaxKm;
    return err(
      "DISTANCE_OUT_OF_RANGE",
      `ระยะทาง ${q.distanceKm} กม. อยู่นอกขอบเขตตาราง (สูงสุด ${last} กม.) — ไม่ประมาณค่าออกนอกตาราง`,
    );
  }

  const unitLabel = q.cargo === "ton" ? "ตัน" : "ลบ.ม.";
  const perUnitSatang = q.cargo === "ton" ? charge.perTonSatang : charge.perM3Satang;
  if (!Number.isSafeInteger(perUnitSatang) || perUnitSatang <= 0) {
    return err(
      "DATA_INCONSISTENT",
      `ข้อมูลตารางไม่สอดคล้อง: ค่าขนส่งต่อ${unitLabel} ที่ระยะ ${q.distanceKm} กม. ไม่ใช่จำนวนเต็มบวก — ไฟล์อาจถูกแก้ ให้นำเข้าชุดตารางใหม่`,
    );
  }

  const scaled = scaledQuantity(q.quantity);
  if (!scaled.ok) return err("BAD_QUANTITY", scaled.error);
  const amount = amountFromScaled(perUnitSatang, scaled.scaled, q.quantity);
  if (!amount.ok) return err("BAD_QUANTITY", amount.error);

  const srcNotes = [
    `แหล่งตัวเลข: ${section.titlePrinted} — หน้าต้นฉบับ ${band.sourcePages[0]}–${band.sourcePages[1]}`,
    ...(q.provenance?.rulesetId
      ? [
          `ชุดกฎ: ${q.provenance.rulesetId}${q.provenance.rulesetChecksum ? ` · checksum ${q.provenance.rulesetChecksum}` : ""}`,
        ]
      : []),
  ];

  const distanceNote =
    charge.basis === "table"
      ? `ระยะทาง ${q.distanceKm} กม. — อ่านราคาจากตารางโดยตรง`
      : `ระยะทาง ${q.distanceKm} กม. — คิด กม.ละ ${formatSatang(q.cargo === "ton" ? charge.perTonRateSatang : charge.perM3RateSatang)} บาท/${unitLabel} (ช่วง ${band.farMinKm}–${band.farMaxKm} กม.)`;

  return {
    ok: true,
    section,
    band,
    charge,
    cargo: q.cargo,
    basis: charge.basis,
    perUnitSatang,
    amountSatang: amount.amountSatang,
    notes: [
      `เงื่อนไขการใช้ตาราง: ${schedule.conditions.join(" · ")} — ผู้ใช้ยืนยันแล้วว่าสภาพงานตรงเงื่อนไข`,
      distanceNote,
      `อัตราค่าขนส่ง ${formatSatang(perUnitSatang)} บาท/${unitLabel}`,
      `ช่วงราคาน้ำมันดีเซล ${fmtFuel(band.fuelMinSatang)}–${fmtFuel(band.fuelMaxSatang)} บาท/ลิตร (เฉลี่ย ${formatSatang(band.avgFuelSatang)} บาท/ลิตร · ฐาน ${schedule.fuelPriceBasis})`,
      ...transportBandNotices(schedule, band),
      ...srcNotes,
      ...(amount.amountSatang === null
        ? []
        : [
            `ปริมาณ ${q.quantity} ${unitLabel} × ${formatSatang(perUnitSatang)} = ${formatSatang(amount.amountSatang)} บาท`,
            ...(amount.amountSatang === 0
              ? ["ยอดรวมปัดลงต่ำกว่า 0.01 บาท (แสดง 0.00) ตามกติกาปัดเศษเป็นสตางค์ — ไม่ใช่ระบบขัดข้อง"]
              : []),
            "วิธีปัดเศษ half-up ยังไม่ยืนยันกับต้นฉบับ (ข้อสมมติ 2 ของ PRD) — ตรวจกับคู่มือ/เล่มประกาศก่อนใช้ในเอกสารส่งหน่วยงาน",
          ]),
      "ค่านี้เป็นค่าขนส่งตามตาราง ยังไม่รวม Factor F กำไร หรือ VAT",
    ],
  };
}
