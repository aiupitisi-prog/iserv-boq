// ค่าแรงงาน/ค่าดำเนินการตามบัญชี กค 0433.2/ว 480 — pure function (ไม่มี I/O)
//
// บัญชี ว 480 พิมพ์ราคาเป็น "บาทเต็ม" ต่อหน่วย (ไม่ใช่ทศนิยม) → แปลงเป็นสตางค์ ×100 ตรงตัว
// โครงสร้างข้อมูลมี 2 มิติที่ต้องเลือกเอง:
//   1) entry → variant/children (ขนาด/ชนิด/ตัวเลือก)
//   2) prices ภายใน entry/variant → แถวราคาตามขนาดหรือช่วงจำนวนงาน (note)
//
// กฎเหล็กของไฟล์นี้:
// - "ห้ามเดา": ไม่เลือก variant/แถวราคาให้ผู้ใช้เอง เพราะช่วงจำนวนงานในต้นฉบับทับกันที่ขอบ
//   (เช่น "50 - 100" กับ "ตั้งแต่ 25 ต้น และไม่เกิน 50") และบางแถวต้นฉบับไม่ได้พิมพ์ชื่อแยก
//   ผู้เรียกต้องส่ง variantPath + priceIndex ที่ผู้ใช้เลือกมาเท่านั้น
// - ถ้าแถวที่เลือกมีคำอธิบายซ้ำกับแถวอื่นในรายการเดียวกัน → คืนผลพร้อมเตือน (ambiguous)
//   ไม่ถือว่าแถวนั้นถูกต้องโดยปริยาย
// - เงินเป็นสตางค์ integer; ปริมาณเป็นเศษส่วน ≤4 ตำแหน่ง → integer scaling แล้วปัด half-up ครั้งเดียว
// - ราคาที่ไม่ใช่จำนวนเต็มบวก/ไม่มีหน่วย = ข้อมูลเพี้ยน → error (ไม่เดาเป็น 0)
// - ผลลัพธ์เป็น "ต้นทุนค่าแรงงาน/ค่าดำเนินการ" ตามบัญชี ยังไม่รวมค่าวัสดุ Factor F กำไร หรือ VAT
// - วิธีปัดเศษ half-up ยังเป็นข้อสมมติ 2 ของ PRD — ระบุใน notes ทุกครั้งเมื่อคิดยอดรวม

import type { WageEntry, WagePriceRow, WageSchedule, WageVariant } from "../ruleset";
import { formatSatang, type Satang } from "./money";
import { amountFromScaled, scaledQuantity } from "./quantity";

export type WageRateOption = {
  key: string; // entryNo|path|priceIndex — ใช้อ้างอิงแถวราคาแบบ exact
  ordinal: number; // ลำดับ 1-based ภายใน entry (ใช้แสดงผล)
  entryNo: string;
  entryName: string;
  variantPath: number[]; // [] = แถวราคาใต้ entry โดยตรง
  variantNames: string[]; // ชื่อ variant ตาม path (ใช้แสดงผล)
  priceIndex: number; // index ใน prices ของ entry/variant ปลายทาง
  priceBaht: number; // ราคาตามที่พิมพ์ (บาทเต็ม/หน่วย)
  unit: string;
  name?: string; // ชื่อแถวราคา (ถ้าพิมพ์)
  note?: string; // หมายเหตุ/เงื่อนไขจำนวนของแถว (ถ้าพิมพ์)
  groupName?: string; // ชื่อกลุ่มราคาที่แถวนี้สังกัด (เช่น ขนาดเสาเข็ม)
  variantNote?: string; // หมายเหตุของหัวกลุ่มย่อย/variant (ตามที่พิมพ์ — เช่น "ค่าแรง / 1 เมตร")
  label: string; // ข้อความสำหรับแสดงผล — อาจซ้ำกันได้ ต้องดู ordinal/price ประกอบ
  ambiguous: boolean; // true = คำอธิบายซ้ำกับแถวอื่นใน entry เดียวกัน (ต้นฉบับแยกไม่ได้)
};

export type WageCostQuery = {
  entryNo: string;
  variantPath?: number[];
  priceIndex: number;
  quantity?: number; // ปริมาณตามหน่วยของแถวราคา (ทศนิยม ≤4 ตำแหน่ง) — ไม่ระบุ = คิดเฉพาะราคา/หน่วย
  // ที่มาของชุดกฎ (ไว้แสดง trace) — ไม่ส่งก็ได้; ค่าที่ส่งจะถูกใส่ใน notes ตามจริง
  provenance?: {
    rulesetId?: string;
    rulesetChecksum?: string;
    sourceDoc?: string;
    sourceKind?: "official" | "mirror-unverified";
    verifiedAgainstGazette?: boolean;
  };
};

export type WageCostErrorCode =
  | "ENTRY_NOT_FOUND"
  | "RATE_NOT_FOUND"
  | "DATA_INCONSISTENT"
  | "BAD_QUANTITY";

export type WageCostOk = {
  ok: true;
  entry: WageEntry;
  rate: WageRateOption;
  perUnitSatang: Satang;
  amountSatang: Satang | null; // null = ไม่ได้ระบุปริมาณ
  unit: string;
  notes: string[];
};

export type WageCostErr = { ok: false; code: WageCostErrorCode; error: string };
export type WageCostResult = WageCostOk | WageCostErr;

const err = (code: WageCostErrorCode, error: string): WageCostErr => ({ ok: false, code, error });

const clean = (s: string | undefined): string => (s ?? "").trim();

// ประกอบข้อความโดยไม่ใส่ส่วนที่ซ้ำกับส่วนก่อนหน้า (variant/group/name อาจเป็นชื่อเดียวกัน)
function joinParts(parts: Array<string | undefined>): string {
  const out: string[] = [];
  for (const raw of parts) {
    const p = clean(raw);
    if (p && !out.includes(p)) out.push(p);
  }
  return out.join(" · ");
}

// สร้าง descriptor สำหรับตรวจว่าแถวราคาแยกจากกันได้หรือไม่ (ไม่รวมราคา/หน่วย)
function descriptor(entry: WageEntry, path: number[], names: string[], groupName: string, p: WagePriceRow): string {
  return [entry.no, path.join("."), ...names, groupName, clean(p.name), clean(p.note), clean(p.unit)].join("|");
}

function makeOption(
  entry: WageEntry,
  path: number[],
  names: string[],
  groupName: string,
  variantNote: string,
  priceIndex: number,
  p: WagePriceRow,
  descriptorValue: string,
): Omit<WageRateOption, "ordinal" | "ambiguous"> & { descriptor: string } {
  const priceBaht = p.price;
  const unit = clean(p.unit);
  const label = joinParts([
    ...names,
    variantNote ? `หมายเหตุหัวกลุ่ม: ${variantNote}` : "",
    groupName,
    p.name,
    clean(p.note) ? `หมายเหตุ: ${clean(p.note)}` : "",
    `${priceBaht} บาท/${unit || "หน่วย"}`,
  ]);
  return {
    key: `${entry.no}|${path.join(".")}|${priceIndex}`,
    entryNo: entry.no,
    entryName: entry.name,
    variantPath: path,
    variantNames: names,
    priceIndex,
    priceBaht,
    unit,
    name: p.name,
    note: p.note,
    groupName: groupName || undefined,
    variantNote: variantNote || undefined,
    label,
    descriptor: descriptorValue,
  };
}

// แปลง entry หนึ่งรายการเป็นแถวราคาที่เลือกได้ทั้งหมด (depth-first ตามลำดับพิมพ์)
// ไม่ตัดสินใจเลือกให้ — ผู้เรียกนำไปแสดงให้ผู้ใช้เลือก
export function listWageRates(entry: WageEntry): WageRateOption[] {
  const raw: Array<Omit<WageRateOption, "ordinal" | "ambiguous"> & { descriptor: string }> = [];

  // แถวราคาใต้ entry โดยตรง — name ที่พิมพ์หมายถึงกลุ่มใหม่; แถวถัดไปที่ไม่มี name อยู่ในกลุ่มเดิม
  let group = "";
  for (let i = 0; i < entry.prices.length; i++) {
    const p = entry.prices[i];
    if (clean(p.name)) group = clean(p.name);
    const d = descriptor(entry, [], [], group, p);
    raw.push(makeOption(entry, [], [], group, "", i, p, d));
  }

  // variant/children — เก็บ path และชื่อตามลำดับ เพื่อให้เลือกแถวได้ตรงตัว
  const walk = (variants: WageEntry["variants"], path: number[], names: string[], notes: string[]) => {
    if (!variants) return;
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      const nextPath = [...path, i];
      const nextNames = [...names, clean(v.name)];
      const nextNotes = clean(v.note) ? [...notes, clean(v.note)] : notes;
      const variantNote = nextNotes.join(" · ");
      let g = "";
      for (let j = 0; j < v.prices.length; j++) {
        const p = v.prices[j];
        if (clean(p.name)) g = clean(p.name);
        const d = descriptor(entry, nextPath, nextNames, g, p);
        raw.push(makeOption(entry, nextPath, nextNames, g, variantNote, j, p, d));
      }
      if (v.children && v.children.length > 0) walk(v.children, nextPath, nextNames, nextNotes);
    }
  };
  walk(entry.variants, [], [], []);

  // นับ descriptor ซ้ำภายใน entry — ใช้เตือนว่าแถวราคาแยกจากกันไม่ได้
  const counts = new Map<string, number>();
  for (const r of raw) counts.set(r.descriptor, (counts.get(r.descriptor) ?? 0) + 1);
  return raw.map((r, i) => {
    const { descriptor: _d, ...rest } = r;
    return { ...rest, ordinal: i + 1, ambiguous: (counts.get(_d) ?? 0) > 1 };
  });
}

// นับแถวราคาทั้งหมดในชุด (ใช้แสดงสรุปโดยไม่ต้องสร้าง array)
export function countWageRates(schedule: WageSchedule): number {
  let n = 0;
  const walk = (variants: WageEntry["variants"]) => {
    if (!variants) return;
    for (const v of variants) {
      n += v.prices.length;
      if (v.children) walk(v.children);
    }
  };
  for (const e of schedule.entries) {
    n += e.prices.length;
    walk(e.variants);
  }
  return n;
}

function findEntry(schedule: WageSchedule, no: string): WageEntry | undefined {
  return schedule.entries.find((e) => e.no === no);
}

function resolvePriceRow(
  entry: WageEntry,
  path: number[],
  priceIndex: number,
): { prices: WagePriceRow[]; variantNames: string[]; variantNotes: string[]; groupName: string } | null {
  if (!Number.isInteger(priceIndex) || priceIndex < 0) return null;
  if (path.length === 0) {
    // group ของแถวที่เลือก = name ล่าสุดก่อน index นั้น
    let group = "";
    for (let i = 0; i <= priceIndex && i < entry.prices.length; i++) {
      if (clean(entry.prices[i].name)) group = clean(entry.prices[i].name);
    }
    return { prices: entry.prices, variantNames: [], variantNotes: [], groupName: group };
  }
  let variants = entry.variants;
  let current: WageVariant | undefined;
  const names: string[] = [];
  const notes: string[] = [];
  for (const idx of path) {
    if (!Number.isInteger(idx) || !variants || idx < 0 || idx >= variants.length) return null;
    current = variants[idx];
    names.push(clean(current.name));
    if (clean(current.note)) notes.push(clean(current.note));
    variants = current.children;
  }
  if (!current) return null;
  let group = "";
  for (let i = 0; i <= priceIndex && i < current.prices.length; i++) {
    if (clean(current.prices[i].name)) group = clean(current.prices[i].name);
  }
  return { prices: current.prices, variantNames: names, variantNotes: notes, groupName: group };
}

export function wageCost(schedule: WageSchedule, q: WageCostQuery): WageCostResult {
  const entry = findEntry(schedule, q.entryNo.trim());
  if (!entry) {
    return err("ENTRY_NOT_FOUND", `ไม่พบรายการ "${q.entryNo}" ในบัญชีค่าแรงงาน — ตรวจเลขลำดับจากต้นฉบับ`);
  }

  const path = q.variantPath ?? [];
  const resolved = resolvePriceRow(entry, path, q.priceIndex);
  if (!resolved) {
    return err(
      "RATE_NOT_FOUND",
      `ไม่พบ variant ตาม path [${path.join(", ")}] ในรายการ ${entry.no} — เลือกแถวราคาใหม่`,
    );
  }
  const row = resolved.prices[q.priceIndex];
  if (!row) {
    return err(
      "RATE_NOT_FOUND",
      `ไม่พบแถวราคาลำดับ ${q.priceIndex + 1} ในรายการ ${entry.no} — รายการนี้มี ${resolved.prices.length} แถวราคา`,
    );
  }

  const unit = clean(row.unit);
  if (!unit) {
    return err("DATA_INCONSISTENT", `แถวราคาที่เลือกไม่มีหน่วย (${entry.no} แถว ${q.priceIndex + 1}) — ข้อมูลเพี้ยน ให้นำเข้าชุดใหม่`);
  }
  if (!Number.isSafeInteger(row.price) || row.price <= 0) {
    return err(
      "DATA_INCONSISTENT",
      `ราคาในแถวที่เลือกไม่ใช่จำนวนเต็มบวก (${String(row.price)} บาท/${unit}) — ข้อมูลเพี้ยน ให้นำเข้าชุดใหม่`,
    );
  }

  const perUnitSatang = row.price * 100;
  if (!Number.isSafeInteger(perUnitSatang)) {
    return err("DATA_INCONSISTENT", `ราคา ${row.price} บาท/${unit} เกินขอบเขตสตางค์ที่คำนวณได้`);
  }

  const scaled = scaledQuantity(q.quantity);
  if (!scaled.ok) return err("BAD_QUANTITY", scaled.error);
  const amount = amountFromScaled(perUnitSatang, scaled.scaled, q.quantity);
  if (!amount.ok) return err("BAD_QUANTITY", amount.error);

  // สร้าง rate option จากตัวเลือกจริง (ไม่ใช้ listWageRates ทั้ง entry เพื่อไม่ให้ ordinal ผิดเมื่อ path/index ไม่ตรง)
  const options = listWageRates(entry);
  const key = `${entry.no}|${path.join(".")}|${q.priceIndex}`;
  const rate = options.find((o) => o.key === key);
  if (!rate) {
    return err(
      "DATA_INCONSISTENT",
      `แถวราคาที่เลือก (${key}) ไม่ปรากฏในการแปลงรายการ ${entry.no} — ข้อมูลชุดกฎไม่สอดคล้องกัน ให้นำเข้าชุดใหม่`,
    );
  }

  const notes: string[] = [
    `รายการ: ${entry.no} ${entry.name}`,
    // เงื่อนไข/หมายเหตุของรายการจากต้นฉบับ ต้องติดไปกับผลลัพธ์ (ไม่ใช่ซ่อนในหน้ารายละเอียด)
    ...entry.notes.map((n) => `หมายเหตุรายการ (ตามที่พิมพ์): ${n}`),
    ...(rate.variantNames.length > 0 ? [`ตัวเลือก: ${rate.variantNames.join(" › ")}`] : []),
    ...(rate.variantNote ? [`หมายเหตุหัวกลุ่ม (ตามที่พิมพ์): ${rate.variantNote}`] : []),
    ...(rate.groupName ? [`กลุ่มราคา/ขนาด: ${rate.groupName}`] : []),
    ...(clean(rate.name) && clean(rate.name) !== clean(rate.groupName) ? [`ชื่อแถวราคา: ${rate.name}`] : []),
    ...(clean(rate.note) ? [`หมายเหตุในแถวราคา (ตามที่พิมพ์): ${rate.note}`] : []),
    `อัตราตามบัญชี: ${formatSatang(perUnitSatang)} บาท/${unit}`,
    "ระบบไม่เลือก variant/ช่วงจำนวนงานให้ — ผู้ใช้ต้องเลือกแถวราคาให้ตรงกับขนาด/ปริมาณงานจริงตามต้นฉบับ และระบบไม่ตรวจว่าปริมาณที่กรอกตรงกับเงื่อนไขจำนวนในแถว (ข้อความเงื่อนไขเป็นข้อความอิสระจากต้นฉบับ)",
  ];
  if (rate.ambiguous) {
    notes.push(
      "⚠ แถวราคาที่เลือกมีคำอธิบายซ้ำกับแถวอื่นในรายการเดียวกัน — ต้นฉบับอาจมีรายละเอียดที่แยกไม่ได้จากข้อมูลนี้ ต้องตรวจต้นฉบับก่อนใช้",
    );
  }
  if (q.provenance?.rulesetId) {
    notes.push(
      `ชุดกฎ: ${q.provenance.rulesetId}${q.provenance.rulesetChecksum ? ` · checksum ${q.provenance.rulesetChecksum}` : ""}`,
    );
  }
  if (q.provenance?.sourceDoc) notes.push(`แหล่งตัวเลข: ${q.provenance.sourceDoc}`);
  if (q.provenance?.sourceKind === "mirror-unverified" || q.provenance?.verifiedAgainstGazette === false) {
    notes.push("⚠ ตัวเลขชุดนี้ยังไม่ยืนยันกับราชกิจจานุเบกษา/เล่มจริง — ตรวจต้นฉบับก่อนใช้ในเอกสารส่งหน่วยงาน");
  } else if (!q.provenance || q.provenance.sourceKind !== "official" || q.provenance.verifiedAgainstGazette !== true) {
    // fail-safe: ไม่มี provenance หรือยืนยันไม่ครบ ถือว่ายังไม่ยืนยัน (ห้ามเดาว่าทางการ)
    notes.push("⚠ ไม่มีข้อมูลยืนยันที่มาของชุดกฎ (provenance) ครบถ้วน — ถือว่ายังไม่ยืนยันกับราชกิจจานุเบกษา ตรวจต้นฉบับก่อนใช้");
  }

  const amountSatang = amount.amountSatang;
  if (amountSatang !== null) {
    notes.push(
      `ปริมาณ ${q.quantity} ${unit} × ${formatSatang(perUnitSatang)} = ${formatSatang(amountSatang)} บาท`,
    );
    if (amountSatang === 0) {
      notes.push("ยอดรวมปัดลงต่ำกว่า 0.01 บาท (แสดง 0.00) ตามกติกาปัดเศษเป็นสตางค์ — ไม่ใช่ระบบขัดข้อง");
    }
    notes.push(
      "วิธีปัดเศษ half-up ยังไม่ยืนยันกับต้นฉบับ (ข้อสมมติ 2 ของ PRD) — ตรวจกับคู่มือ/เล่มประกาศก่อนใช้ในเอกสารส่งหน่วยงาน",
    );
  }
  notes.push("ค่านี้เป็นต้นทุนค่าแรงงาน/ค่าดำเนินการตามบัญชี ยังไม่รวมค่าวัสดุ Factor F กำไร หรือ VAT");

  return {
    ok: true,
    entry,
    rate,
    perUnitSatang,
    amountSatang,
    unit,
    notes,
  };
}
