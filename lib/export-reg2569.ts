// ส่งออก "ชุดเอกสารเผยแพร่ราคากลาง พ.ศ. 2569" เป็นไฟล์ xlsx หลายชีต
// (ข้อ 20 หลักเกณฑ์การคำนวณราคากลางงานก่อสร้าง พ.ศ. 2569 — เผยแพร่ทางเว็บไซต์ของหน่วยงาน)
//
// หลักการ (เหมือน lib/export.ts + lib/report2569.ts):
// - ยอดในชีต 1–9 มาจาก buildReg2569Report() ซึ่งคำนวณเป็น "สตางค์ integer" ทั้งหมด
//   ไฟล์นี้เป็น "เอาต์พุตแสดงผล" — ถ้าต้องรวมยอดเอง (เช่น total ต่อแถวครุภัณฑ์) ทำในหน่วยสตางค์ integer ก่อนแปลงเป็นบาท
//   และห้ามปัดเศษบาททศนิยม; ชีต BOQ/สรุปหมวดงานใช้ยอดจาก BOQ editor (ไม่ใช่ราคากลาง)
// - เซลล์เงินเป็น "บาท" (number 2 ตำแหน่ง) เพื่อให้ผู้ตรวจเปิดใน Excel แล้วบวก/ตรวจต่อได้
//   ห้ามเอาค่าจากไฟล์นี้ไปใช้เป็นแหล่งคำนวณของระบบ (ระบบใช้สตางค์ integer เท่านั้น)
// - ทุกชีตมี disclaimer "ไม่ใช่ราคามาตรฐานของกรมบัญชีกลาง" — ห้ามลบ
// - ชีต ปร.2(ก)/ปร.2 และ ปร.3/เหตุผลค่าใช้จ่ายพิเศษ เกิดเฉพาะเมื่อมีข้อมูลจริง (ตรงกับหน้าพิมพ์)
// - ชื่อชีตต้อง ≤ 31 ตัวอักษร และไม่มีอักขระต้องห้ามของ Excel ([]:*?/\) — ผ่าน sheetNameSafe()

import { bahtText } from "./bahttext";
import type { BoqProject, Committee } from "./boq";
import { WORK_TYPE_LABELS, type Ruleset } from "./ruleset";
import type { Reg2569Report } from "./report2569";
import {
  MONEY_FMT,
  QTY_FMT,
  buildBoqSheet,
  buildSectionSummarySheet,
  fmtCells,
  loadXlsx,
  type XlsxModule,
} from "./export";

// ป้ายภาษาไทยของประเภทงาน — จาก WORK_TYPE_LABELS เท่านั้น (ห้ามแปลกระจาย)
// รหัสที่ไม่รู้จัก → แสดงรหัสเดิม (อย่าเดา/แปลเอง)
function workTypeLabel(wt: string | undefined): string {
  if (!wt) return "—";
  return (WORK_TYPE_LABELS as Record<string, string | undefined>)[wt] ?? wt;
}

// — ชื่อชีต (คงที่ + มีลำดับนำหน้าให้เรียงตามชุดเอกสาร 9 ชิ้น) —
export const REG2569_SHEETS = {
  cover: "00 คำเตือนและที่มา",
  p1g: "1.ปร.1(ก)",
  p1: "2.ปร.1",
  p2g: "3.ปร.2(ก)",
  p2: "4.ปร.2",
  p3: "5.ปร.3",
  p3reason: "6.เหตุผลค่าใช้จ่ายพิเศษ",
  p4: "7.ปร.4",
  factorF: "8.รายละเอียด Factor F",
  evidence: "9.สืบราคาวัสดุ",
  boq: "BOQ แสดงรายการ",
  sections: "สรุปหมวดงาน",
} as const;

export const REG2569_DISCLAIMER = "จัดทำด้วยระบบ iserv BOQ — ไม่ใช่ราคามาตรฐานของกรมบัญชีกลาง";

const SHEET_NAME_MAX = 31;

// Excel: ชื่อชีตยาวได้ไม่เกิน 31 ตัวอักษร และห้ามมี []:*?/\ — ตัด/แทนก่อนใช้ทุกครั้ง
export function sheetNameSafe(name: string): string {
  const cleaned = name.replaceAll(/[\\/:*?[\]]/g, "-").trim();
  return (cleaned || "Sheet").slice(0, SHEET_NAME_MAX);
}

// รายชื่อชีตที่จะมีจริงในไฟล์ — ใช้ทั้งสร้างสารบัญในชีต 00 และตรวจในเทสต์
export function reg2569SheetNames(rep: Reg2569Report): string[] {
  const names: string[] = [REG2569_SHEETS.cover, REG2569_SHEETS.p1g, REG2569_SHEETS.p1];
  if (rep.p2) names.push(REG2569_SHEETS.p2g, REG2569_SHEETS.p2);
  if (rep.p3) names.push(REG2569_SHEETS.p3, REG2569_SHEETS.p3reason);
  names.push(REG2569_SHEETS.p4, REG2569_SHEETS.factorF, REG2569_SHEETS.evidence, REG2569_SHEETS.boq, REG2569_SHEETS.sections);
  return names.map(sheetNameSafe);
}

export type Reg2569ExportOptions = {
  committee?: Committee; // ไม่ระบุ = ใช้ project.committee
  area?: number; // ขนาด/เนื้อที่อาคาร (ตร.ม.) — ไม่ระบุ = project.buildingAreaSqm
  avgPerSqm?: number | null; // บาท/ตร.ม. — ไม่ระบุ = คำนวณจากค่าก่อสร้าง ÷ พื้นที่
  now?: Date; // วันที่พิมพ์/ส่งออก (deterministic ในเทสต์)
};

type Row = (string | number)[];

const TH_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function thaiDate(d: Date): string {
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

// วันบังคับใช้ของชุดกฎ (รูปแบบ "YYYY-MM-DD" ตาม Ruleset.effectiveFrom) → ข้อความวันที่ไทย
// ไม่เดา: ไม่มีค่า/รูปแบบไม่รู้จัก/ปีที่ JS ตีความเพี้ยน = ติดป้าย unverified ให้ตรวจก่อนใช้
function effectiveFromThai(effectiveFrom: string | undefined): string {
  if (!effectiveFrom) return "ไม่ระบุ (unverified)";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(effectiveFrom);
  // new Date(ปี, …) ตีความปี 0–99 เป็น 19xx — ปีสั้นกว่า 4 หลัก (นำหน้า 0) ถือว่าข้อมูลไม่น่าเชื่อถือ
  if (!m || Number(m[1]) < 1000) return `${effectiveFrom} (รูปแบบวันที่ไม่รู้จัก — ต้องตรวจ)`;
  return thaiDate(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

// สตางค์ → บาท (number 2 ตำแหน่ง) — แสดงผลเท่านั้น
function money(s: number | null | undefined): number | "" {
  if (s === null || s === undefined || !Number.isFinite(s)) return "";
  return Number((Math.round(s) / 100).toFixed(2));
}

// ข้อความเงิน (บาท 2 ตำแหน่ง) — ใช้ในข้อความบรรยายเท่านั้น
function bahtStr(s: number): string {
  return (Math.round(s) / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function price(n: number | null | undefined): number | "" {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  return Number(n.toFixed(2));
}

function qty(n: number | null | undefined): number | "" {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  return Number(n.toFixed(4));
}

function factorNum(f: number | null | undefined): number | "" {
  if (f === null || f === undefined || !Number.isFinite(f)) return "";
  return Number(f.toFixed(6));
}

// — หัวแบบฟอร์มราชการ (ชื่อโครงการ/สถานที่/หน่วยงาน/แบบเลขที่/วันที่คำนวณ) —
function headRows(project: BoqProject, committee: Committee | undefined, extra: string[] = []): Row[] {
  return [
    [project.name],
    [project.address || ""],
    [committee?.agency ? `หน่วยงาน: ${committee.agency}` : "หน่วยงาน: ………………………………………………"],
    [`แบบเลขที่ ${committee?.formNo || "……………………"}    ·    คำนวณราคากลาง เมื่อวันที่ ${committee?.calcDate || "……………………"}`],
    ...extra.map((x) => [x]),
    [],
  ];
}

function signatureRows(committee: Committee | undefined): Row[] {
  return [
    [],
    [
      "ลงชื่อ ………………………………………………… ประธานกรรมการกำหนดราคากลาง",
      "",
      "ลงชื่อ ………………………………………………… กรรมการกำหนดราคากลาง (คนที่ 1)",
      "",
      "ลงชื่อ ………………………………………………… กรรมการกำหนดราคากลาง (คนที่ 2)",
    ],
    [
      `( ${committee?.chairman?.trim() || "……………………………………………"} )`,
      "",
      `( ${committee?.member1?.trim() || "……………………………………………"} )`,
      "",
      `( ${committee?.member2?.trim() || "……………………………………………"} )`,
    ],
  ];
}

function footerRows(): Row[] {
  return [[], [REG2569_DISCLAIMER]];
}

function warningsRows(warnings: string[], header = true): Row[] {
  if (warnings.length === 0) return [];
  const out: Row[] = header ? [[`คำเตือนก่อนใช้ (${warnings.length} ข้อ)`]] : [];
  for (const w of warnings) out.push([w]);
  return out;
}

// เติมแถวท้ายชีตที่สร้างจาก lib/export.ts (BOQ/สรุปหมวดงาน) — ทุกชีตต้องมี disclaimer
function appendRows(XL: XlsxModule, ws: any, rows: Row[]): any {
  const range = XL.utils.decode_range(ws["!ref"] ?? "A1");
  let r = range.e.r + 2; // เว้น 1 แถวว่าง
  for (const row of rows) {
    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      if (v === "" || v === undefined) continue;
      ws[XL.utils.encode_cell({ r, c })] = { t: typeof v === "number" ? "n" : "s", v };
    }
    r++;
  }
  range.e.r = Math.max(range.e.r, r - 1);
  ws["!ref"] = XL.utils.encode_range(range);
  return ws;
}

// ————— ชีต 00: คำเตือนและที่มา (สารบัญ + สถานะชุดกฎ + disclaimer) —————
function buildCoverSheet(
  XL: XlsxModule,
  project: BoqProject,
  ruleset: Ruleset | null | undefined,
  rep: Reg2569Report,
  committee: Committee | undefined,
  printedAt: Date,
  names: string[],
): any {
  const prov = ruleset?.provenance;
  const provLabel = prov
    ? `${prov.sourceKind === "official" ? "official (ยืนยันกับต้นฉบับทางการ)" : "mirror-unverified (สำเนา — ยังไม่ยืนยันกับราชกิจจานุเบกษา)"}${
        prov.verifiedAgainstGazette ? " · verifiedAgainstGazette = true" : ""
      }`
    : "ไม่ระบุที่มา (unverified)";

  const aoa: Row[] = [
    ["ชุดเอกสารเผยแพร่ราคากลาง พ.ศ. 2569"],
    // วันบังคับใช้ดึงจากชุดกฎที่ pin — ห้าม hardcode (หลักเกณฑ์ฉบับเดียวกันอาจมีหลายชุดกฎ)
    [`ตามข้อ 20 หลักเกณฑ์การคำนวณราคากลางงานก่อสร้าง พ.ศ. 2569 (มีผลบังคับ ${effectiveFromThai(ruleset?.effectiveFrom)})`],
    [],
    ["ชื่อโครงการ", project.name],
    ["สถานที่", project.address || ""],
    ["หน่วยงานเจ้าของโครงการ", committee?.agency || "………………………………………………"],
    ["แบบเลขที่", committee?.formNo || "……………………"],
    ["คำนวณราคากลาง เมื่อวันที่", committee?.calcDate || "……………………"],
    ["วันที่ส่งออกไฟล์", thaiDate(printedAt)],
    [],
    ["ชุดกฎราคากลางที่ใช้คำนวณ", ruleset ? `${ruleset.name} (id ${ruleset.id})` : "ไม่มี — คำนวณแบบไม่ปรับ (F = 1)"],
    ["สถานะการ pin ชุดกฎ", project.rulesetId ? `pin แล้ว: ${project.rulesetId}` : "ยังไม่ pin ชุดกฎราคากลาง"],
    ["เอกสารต้นทาง", ruleset?.sourceDoc ?? "—"],
    ["มีผลตั้งแต่", ruleset?.effectiveFrom ?? "—"],
    ["checksum", ruleset?.checksum ?? "—"],
    ["ที่มา/provenance", provLabel],
    [],
    ["ตัวเลขสำคัญ (บาท)"],
    ["ราคากลาง", money(rep.summary.totalSat), bahtText(rep.summary.totalSat)],
    ["ค่าก่อสร้าง (ค่างานต้นทุน × Factor F)", money(rep.summary.constructionSat), ""],
    ["ค่าครุภัณฑ์จัดซื้อ (รวม VAT + ค่าติดตั้งที่สืบราคา)", money(rep.summary.equipmentSat), rep.p2 ? "" : "ไม่มีรายการครุภัณฑ์"],
    ["ค่าใช้จ่ายพิเศษตามข้อกำหนด", money(rep.summary.expenseSat), rep.p3 ? "" : "ไม่มี"],
    [],
    ["ชีตในไฟล์นี้"],
    ...names.map((n, i) => [i + 1, n] as Row),
    [],
  ];

  const warn = warningsRows(rep.warnings);
  if (warn.length > 0) aoa.push(...warn, []);

  if (ruleset?.notices && ruleset.notices.length > 0) {
    aoa.push(["หมายเหตุ/เงื่อนไขจากชุดกฎ"]);
    for (const n of ruleset.notices) aoa.push([n]);
    aoa.push([]);
  }

  if (prov?.sourceKind === "mirror-unverified") {
    aoa.push([
      "คำเตือนที่มา: ตาราง/ราคาในชุดกฎนี้สกัดจากสำเนา (mirror) และยังไม่ยืนยันกับราชกิจจานุเบกษา/เล่มประกาศจริง — ห้ามใช้ยื่นหน่วยงานก่อนยืนยันต้นฉบับ",
    ]);
    aoa.push([]);
  }

  aoa.push([REG2569_DISCLAIMER]);
  aoa.push([
    "หมายเหตุการอ่านไฟล์: เซลล์เงินเป็นตัวเลขบาท (2 ตำแหน่ง) เพื่อให้ตรวจ/คำนวณต่อใน Excel ได้ — ระบบคำนวณจริงเป็นสตางค์ integer ทั้งหมด; ช่องว่าง = ยังไม่มีข้อมูล/ไม่ทราบอัตรา (unverified)",
  ]);

  const ws = XL.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 46 }, { wch: 34 }, { wch: 74 }];
  return ws;
}

// ————— ชีต 1: แบบ ปร.1(ก) — สรุปค่าก่อสร้าง ค่างานต้นทุน —————
function buildP1gSheet(
  XL: XlsxModule,
  project: BoqProject,
  rep: Reg2569Report,
  committee: Committee | undefined,
  area: number | undefined,
  avgPerSqm: number | null,
): any {
  const fdTable = rep.factorFDetail.table;
  // กล่องเงื่อนไขการใช้ตาราง Factor F — 4 อัตราจากตารางที่เลือกเท่านั้น (เหมือนหน้าพิมพ์ ปร.1(ก))
  // ไม่มีตาราง = F = 1 + ป้าย unverified ห้ามเดาอัตรา
  const condRows: Row[] = fdTable
    ? [
        ["เงื่อนไขการใช้ตาราง Factor F (จากตารางที่เลือก)"],
        [
          "ค่าจ้างล่วงหน้า", `${fdTable.advancePct}%`,
          "เงินประกันผลงาน", `${fdTable.retentionPct}%`,
          "ดอกเบี้ยเงินกู้", `${fdTable.interestPct}%/ปี`,
          "ภาษีมูลค่าเพิ่ม", `${fdTable.vatPct}%`,
          "ประเภทงาน", workTypeLabel(fdTable.workType),
        ],
      ]
    : [
        [
          "ยังไม่มีตาราง Factor F ที่เลือกได้ — ยังไม่ปรับ (F = 1) — unverified: ต้องนำเข้าตารางจากเอกสารทางการก่อนใช้จริง",
        ],
      ];

  const aoa: Row[] = [
    ["แบบ ปร.1 (ก) — แบบสรุปค่าก่อสร้าง ค่างานต้นทุน"],
    ...headRows(project, committee, [`แบบ ปร.1 ที่แนบ จำนวน ${rep.p1Sheets.length} หน้า`]),
    ...condRows,
    [],
    ["ลำดับที่", "งานหรือกลุ่มงาน", "ค่างานต้นทุน (บาท)", "Factor F", "ค่าก่อสร้าง (บาท)", "หมายเหตุ"],
  ];
  rep.groups.forEach((g, i) => {
    aoa.push([i + 1, g.section, money(g.costSat), factorNum(g.factor), money(g.constructionSat), ""]);
  });
  if (rep.roundingAdjSat !== 0) {
    aoa.push(["", "ปรับปัดเศษ (ผลรวมรายกลุ่มกับการคำนวณทั้งโครงการ)", "", "", money(rep.roundingAdjSat), "ปัดเศษ half-up ที่ระดับโครงการ"]);
  }
  aoa.push([
    "",
    "รวมค่างานต้นทุน / รวมค่าก่อสร้าง",
    money(rep.groups.reduce((a, g) => a + g.costSat, 0)),
    "",
    money(rep.constructionTotalSat),
    "",
  ]);
  aoa.push([]);
  aoa.push([
    `ขนาดหรือเนื้อที่อาคาร จำนวน ${area != null && area > 0 ? area.toLocaleString("th-TH", { maximumFractionDigits: 2 }) : "………"} ตารางเมตร เฉลี่ย ${
      avgPerSqm !== null ? avgPerSqm.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "………"
    } บาทต่อตารางเมตร`,
  ]);
  aoa.push([`หมายเหตุ: แสดงแบบสรุปค่าก่อสร้าง รวม ${bahtStr(rep.constructionTotalSat)} บาทต่อ 1 หน่วย`]);
  aoa.push(["หมายเหตุ: ชีต 2.ปร.1 รวมทุกหมวดงานเพื่อตรวจใน Excel — พิมพ์แยกแผ่นต่อหมวดงาน (พร้อมหัวแบบ/ช่องลงนาม) ได้ที่หน้าชุดเอกสาร 9 ชิ้นของระบบ"]);
  aoa.push(...signatureRows(committee));
  aoa.push(...footerRows());

  const ws = XL.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 8 }, { wch: 46 }, { wch: 18 }, { wch: 12 }, { wch: 18 }, { wch: 30 }];
  fmtCells(XL, ws, "C", 1, MONEY_FMT);
  fmtCells(XL, ws, "E", 1, MONEY_FMT);
  fmtCells(XL, ws, "D", 1, "0.000000");
  return ws;
}

// ————— ชีต 2: แบบ ปร.1 — แสดงรายการ ปริมาณงาน และราคา (ทุกหมวดงานในชีตเดียว) —————
function buildP1Sheet(XL: XlsxModule, project: BoqProject, rep: Reg2569Report, committee: Committee | undefined): any {
  const aoa: Row[] = [
    ["แบบ ปร.1 — แบบแสดงรายการ ปริมาณงาน และราคา ค่างานต้นทุน"],
    ...headRows(project, committee),
  ];

  rep.p1Sheets.forEach((sh, si) => {
    aoa.push([`งานหรือกลุ่มงาน: ${sh.section}`]);
    aoa.push([
      "ลำดับที่", "รายการ", "จำนวน", "หน่วย",
      "ราคาวัสดุ/หน่วย (บาท)", "ค่าวัสดุ (บาท)",
      "ราคาแรงงาน/หน่วย (บาท)", "ค่าแรงงาน (บาท)",
      "รวมค่าวัสดุและค่าแรงงาน (บาท)", "หมายเหตุ",
    ]);
    for (const r of sh.rows) {
      aoa.push([
        r.no,
        r.name,
        qty(r.qty),
        r.unit,
        r.matUnit !== null ? price(r.matUnit) : "",
        r.matUnit !== null ? money(r.matSat) : "",
        r.labUnit !== null ? price(r.labUnit) : "",
        r.labUnit !== null ? money(r.labSat) : "",
        money(r.totalSat),
        r.note || "",
      ]);
    }
    aoa.push([
      "",
      "รวม",
      "",
      "",
      "",
      money(sh.rows.reduce((a, r) => a + r.matSat, 0)),
      "",
      money(sh.rows.reduce((a, r) => a + r.labSat, 0)),
      money(sh.sumSat),
      "",
    ]);
    aoa.push([`รวมชุดนี้ ${bahtStr(sh.sumSat)} บาท`]);
    if (si < rep.p1Sheets.length - 1) aoa.push([], []);
  });

  aoa.push([]);
  aoa.push(["ราคาต่อหน่วยของแต่ละรายการปัดเศษ half-up เป็นสตางค์ก่อนคูณด้วยปริมาณ (ตาม trace ของเครื่องยนต์คำนวณ)"]);
  aoa.push(...signatureRows(committee));
  aoa.push(...footerRows());

  const ws = XL.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 8 }, { wch: 44 }, { wch: 12 }, { wch: 10 },
    { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 26 },
  ];
  fmtCells(XL, ws, "C", 1, QTY_FMT);
  for (const col of ["E", "F", "G", "H", "I"]) fmtCells(XL, ws, col, 1, MONEY_FMT);
  return ws;
}

// ————— ชีต 3: แบบ ปร.2(ก) — สรุปค่าครุภัณฑ์จัดซื้อ —————
function buildP2gSheet(XL: XlsxModule, project: BoqProject, rep: Reg2569Report, committee: Committee | undefined): any {
  const p2 = rep.p2!;
  const vatNote = p2.vatPct === null ? "ยังไม่ทราบอัตรา VAT (unverified)" : `อัตรา VAT ${p2.vatPct}% จากตาราง Factor F`;
  const aoa: Row[] = [
    ["แบบ ปร.2 (ก) — แบบสรุปค่าครุภัณฑ์จัดซื้อ"],
    ...headRows(project, committee, [`อัตราภาษีมูลค่าเพิ่ม: ${vatNote}`]),
    [
      "ลำดับที่", "รายการ", "ค่าครุภัณฑ์ (บาท)", "ค่าภาษีมูลค่าเพิ่ม (บาท)", "จำนวนเงิน (ค่าครุภัณฑ์ + VAT) (บาท)",
      "ค่าติดตั้ง (บาท)", "ค่าภาษีมูลค่าเพิ่มของค่าติดตั้ง (บาท)", "จำนวนเงิน (ค่าติดตั้ง + VAT) (บาท)",
      "รวมค่าครุภัณฑ์จัดซื้อ (บาท)", "หมายเหตุ",
    ],
  ];
  p2.groups.forEach((g, i) => {
    const notes: string[] = [];
    if (g.installMissing) notes.push("ค่าติดตั้งยังไม่ระบุ (สืบราคาแยก)");
    if (g.installReasonMissing) notes.push("unverified: มีรายการไม่ครบเหตุผลความจำเป็นหรือรายละเอียดการสืบราคาค่าติดตั้ง");
    aoa.push([
      i + 1,
      g.section,
      money(g.equipSat),
      g.equipVatSat !== null ? money(g.equipVatSat) : "",
      money(g.equipSat + (g.equipVatSat ?? 0)),
      g.installSat !== 0 || g.installVatSat !== null ? money(g.installSat) : "",
      g.installVatSat !== null ? money(g.installVatSat) : "",
      g.installSat !== 0 || g.installVatSat !== null ? money(g.installSat + (g.installVatSat ?? 0)) : "",
      money(g.totalSat),
      notes.join(" · "),
    ]);
  });
  aoa.push([
    "",
    "รวม",
    money(p2.groups.reduce((a, g) => a + g.equipSat, 0)),
    p2.vatPct !== null ? money(p2.groups.reduce((a, g) => a + (g.equipVatSat ?? 0), 0)) : "",
    money(p2.groups.reduce((a, g) => a + g.equipSat + (g.equipVatSat ?? 0), 0)),
    money(p2.groups.reduce((a, g) => a + g.installSat, 0)),
    p2.vatPct !== null ? money(p2.groups.reduce((a, g) => a + (g.installVatSat ?? 0), 0)) : "",
    money(p2.groups.reduce((a, g) => a + g.installSat + (g.installVatSat ?? 0), 0)),
    money(p2.sumSat),
    "",
  ]);
  aoa.push([]);
  aoa.push([`รวมค่าครุภัณฑ์จัดซื้อทั้งโครงการ ${bahtStr(p2.sumSat)} บาท (${bahtText(p2.sumSat)})`]);
  aoa.push(["ราคาครุภัณฑ์เป็นราคาผู้ผลิตหรือผู้จำหน่าย (ยังไม่รวมค่าภาษีมูลค่าเพิ่ม) · ค่าติดตั้งต้องมาจากการสืบราคาแยก พร้อมเหตุผลความจำเป็นและรายละเอียดประกอบการสืบราคา (เล่ม 2 ข้อ 2.2)"]);
  aoa.push(...signatureRows(committee));
  aoa.push(...footerRows());

  const ws = XL.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 8 }, { wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
    { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 20 }, { wch: 34 },
  ];
  for (const col of ["C", "D", "E", "F", "G", "H", "I"]) fmtCells(XL, ws, col, 1, MONEY_FMT);
  return ws;
}

// ————— ชีต 4: แบบ ปร.2 — รายละเอียดค่าครุภัณฑ์จัดซื้อต่อรายการ —————
function buildP2Sheet(XL: XlsxModule, project: BoqProject, rep: Reg2569Report, committee: Committee | undefined): any {
  const p2 = rep.p2!;
  const vatNote = p2.vatPct === null ? "ยังไม่ทราบอัตรา VAT (unverified)" : `อัตรา VAT ${p2.vatPct}% จากตาราง Factor F`;
  const aoa: Row[] = [
    ["แบบ ปร.2 — แบบแสดงรายการ ปริมาณงาน และราคา ค่าครุภัณฑ์จัดซื้อ"],
    ...headRows(project, committee, [`อัตราภาษีมูลค่าเพิ่ม: ${vatNote}`]),
    [
      "ลำดับที่", "รายการ", "จำนวน", "หน่วย",
      "ราคาครุภัณฑ์/หน่วย (บาท)", "ค่าครุภัณฑ์ (บาท)", "ค่าภาษีมูลค่าเพิ่ม (บาท)",
      "ค่าติดตั้ง/หน่วย (บาท)", "ค่าติดตั้ง (บาท)", "ค่าภาษีมูลค่าเพิ่มของค่าติดตั้ง (บาท)",
      "รวมค่าครุภัณฑ์จัดซื้อ (บาท)",
      "เหตุผลความจำเป็นของค่าติดตั้ง", "รายละเอียดการสืบราคาค่าติดตั้ง", "หมายเหตุ",
    ],
  ];
  for (const r of p2.rows) {
    aoa.push([
      r.no,
      r.name,
      qty(r.qty),
      r.unit,
      price(r.equipUnit),
      money(r.equipSat),
      r.equipVatSat !== null ? money(r.equipVatSat) : "",
      r.installUnit !== null ? price(r.installUnit) : "",
      r.installUnit !== null ? money(r.installSat) : "",
      r.installVatSat !== null ? money(r.installVatSat) : "",
      money(r.totalSat),
      r.installReason,
      r.installSourcing,
      r.note,
    ]);
  }
  aoa.push([
    "",
    "รวม",
    "",
    "",
    "",
    money(p2.rows.reduce((a, r) => a + r.equipSat, 0)),
    p2.vatPct !== null ? money(p2.rows.reduce((a, r) => a + (r.equipVatSat ?? 0), 0)) : "",
    "",
    money(p2.rows.reduce((a, r) => a + r.installSat, 0)),
    p2.vatPct !== null ? money(p2.rows.reduce((a, r) => a + (r.installVatSat ?? 0), 0)) : "",
    money(p2.sumSat),
    "",
    "",
    "",
  ]);
  aoa.push([]);
  aoa.push(["หมายเหตุ: ราคาครุภัณฑ์ยังไม่รวมค่าภาษีมูลค่าเพิ่ม · รายการที่มีความจำเป็นต้องมีค่าติดตั้ง ต้องสืบราคาและแสดงเหตุผล/รายละเอียด (เล่ม 2 ข้อ 2.2)"]);
  aoa.push(...signatureRows(committee));
  aoa.push(...footerRows());

  const ws = XL.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 8 }, { wch: 38 }, { wch: 10 }, { wch: 10 },
    { wch: 18 }, { wch: 16 }, { wch: 16 },
    { wch: 16 }, { wch: 16 }, { wch: 20 },
    { wch: 20 }, { wch: 34 }, { wch: 34 }, { wch: 30 },
  ];
  fmtCells(XL, ws, "C", 1, QTY_FMT);
  for (const col of ["E", "F", "G", "H", "I", "J", "K"]) fmtCells(XL, ws, col, 1, MONEY_FMT);
  return ws;
}

// ————— ชีต 5: แบบ ปร.3 — ค่าใช้จ่ายพิเศษตามข้อกำหนด —————
function buildP3Sheet(XL: XlsxModule, project: BoqProject, rep: Reg2569Report, committee: Committee | undefined): any {
  const p3 = rep.p3!;
  const aoa: Row[] = [
    ["แบบ ปร.3 — ค่าใช้จ่ายพิเศษตามข้อกำหนด"],
    ...headRows(project, committee),
    ["ลำดับที่", "รายการ", "จำนวน", "หน่วย", "ค่าใช้จ่ายรวม (ค่าก่อสร้าง) (บาท)", "หมายเหตุ"],
  ];
  for (const r of p3.rows) aoa.push([r.no, r.name, qty(r.qty), r.unit, money(r.amountSat), r.note]);
  aoa.push(["", "รวมค่าใช้จ่ายพิเศษตามข้อกำหนดทุกรายการ", "", "", money(p3.sumSat), ""]);
  aoa.push([]);
  aoa.push([
    `รายการใดที่ต้องชำระค่าภาษีมูลค่าเพิ่ม ให้รวมค่าภาษีมูลค่าเพิ่มไว้ด้วย (ข้อ 9 เล่ม 2) — ${
      p3.vatPct !== null ? `อัตรา VAT ${p3.vatPct}% จากตาราง Factor F` : "อัตรา VAT ยังไม่ทราบ (unverified)"
    }`,
  ]);
  aoa.push(...signatureRows(committee));
  aoa.push(...footerRows());

  const ws = XL.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 8 }, { wch: 46 }, { wch: 10 }, { wch: 10 }, { wch: 24 }, { wch: 34 }];
  fmtCells(XL, ws, "C", 1, QTY_FMT);
  fmtCells(XL, ws, "E", 1, MONEY_FMT);
  return ws;
}

// ————— ชีต 6: แบบแสดงการคำนวณและเหตุผลความจำเป็น (ต่อรายการ) —————
function buildP3ReasonSheet(XL: XlsxModule, project: BoqProject, rep: Reg2569Report, committee: Committee | undefined): any {
  const p3 = rep.p3!;
  const aoa: Row[] = [
    ["แบบแสดงการคำนวณและเหตุผลความจำเป็น สำหรับค่าใช้จ่ายพิเศษตามข้อกำหนด"],
    ...headRows(project, committee),
  ];

  p3.reasons.forEach((rs, ri) => {
    aoa.push([`รายการ: ${rs.name}`]);
    aoa.push(["1. เหตุผลและความจำเป็นที่ต้องมีค่าใช้จ่ายพิเศษตามข้อกำหนด"]);
    aoa.push([rs.reason || "………………………………………………………………………………………………"]);
    if (rs.calcDetail.trim() !== "") {
      aoa.push(["รายละเอียดการคำนวณ (จากผู้จัดทำ):", rs.calcDetail]);
    }
    aoa.push([]);
    aoa.push(["2. รายละเอียดการคำนวณ", "", "", "หน่วย : บาท"]);
    aoa.push(["ที่", "รายการค่าใช้จ่าย", "จำนวน (บาท)", "หมายเหตุ"]);
    rs.lines.forEach((ln, li) => aoa.push([li + 1, ln.label, money(ln.sat), ""]));
    aoa.push(["", "รวมค่าใช้จ่าย", money(rs.sumSat), ""]);
    aoa.push([
      "",
      "ค่าภาษีมูลค่าเพิ่ม (สำหรับรายการที่มีค่าภาษีมูลค่าเพิ่ม)",
      rs.vatSat !== null ? money(rs.vatSat) : "………",
      rs.vatSat !== null ? (rs.vatSat > 0 ? "มีค่าภาษีมูลค่าเพิ่ม" : "ไม่มีค่าภาษีมูลค่าเพิ่ม") : "อัตรายังไม่ทราบ (unverified)",
    ]);
    aoa.push([
      "",
      "ค่าใช้จ่ายรวมค่าภาษีมูลค่าเพิ่ม (สำหรับรายการที่มีค่าภาษีมูลค่าเพิ่ม)",
      rs.vatSat !== null ? money(rs.totalSat) : `${bahtStr(rs.sumSat)} + ………`,
      "",
    ]);
    if (ri < p3.reasons.length - 1) aoa.push([], []);
  });

  aoa.push([]);
  aoa.push([
    "หมายเหตุ: แบบฟอร์มนี้ผู้มีหน้าที่คำนวณราคากลางปรับปรุง/ปรับใช้ได้ตามความเหมาะสมและข้อเท็จจริงของแต่ละรายการ · รายการใดต้องชำระค่าภาษีมูลค่าเพิ่ม ให้รวมค่าภาษีมูลค่าเพิ่มด้วย",
  ]);
  aoa.push(...signatureRows(committee));
  aoa.push(...footerRows());

  const ws = XL.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 8 }, { wch: 56 }, { wch: 18 }, { wch: 40 }];
  fmtCells(XL, ws, "C", 1, MONEY_FMT);
  return ws;
}

// ————— ชีต 7: แบบ ปร.4 — สรุปราคากลาง —————
function buildP4Sheet(
  XL: XlsxModule,
  project: BoqProject,
  rep: Reg2569Report,
  committee: Committee | undefined,
): any {
  const attach = 1 + (rep.p2 ? 1 : 0) + (rep.p3 ? 1 : 0);
  const aoa: Row[] = [
    ["แบบ ปร.4 — แบบสรุปราคากลางงานก่อสร้างอาคาร"],
    ...headRows(project, committee, [
      `แบบ ปร.1 (ก) ปร.2 (ก) และ ปร.3 (ถ้ามี) ที่แนบ จำนวน ${attach} ชุด${rep.p3 ? "" : " (ไม่มี ปร.3 — ไม่มีค่าใช้จ่ายพิเศษ)"}`,
    ]),
    ["ลำดับที่", "รายการ", "ค่าก่อสร้าง (บาท)", "หมายเหตุ"],
    [1, "ค่างานต้นทุน", money(rep.summary.constructionSat), ""],
  ];
  rep.groups.forEach((g) => aoa.push(["", `- ${g.section}`, money(g.constructionSat), ""]));
  if (rep.roundingAdjSat !== 0) aoa.push(["", "- ปรับปัดเศษ (จากแบบ ปร.1(ก))", money(rep.roundingAdjSat), ""]);
  aoa.push([
    2,
    "ค่าครุภัณฑ์จัดซื้อ",
    rep.p2 ? money(rep.p2.sumSat) : "ไม่มี",
    rep.p2
      ? rep.p2.vatPct !== null
        ? "รวม VAT + ค่าติดตั้งที่สืบราคา"
        : "รวมค่าติดตั้งที่สืบราคา — VAT ยังไม่ทราบอัตรา (unverified)"
      : "ไม่มีรายการครุภัณฑ์",
  ]);
  aoa.push([3, "ค่าใช้จ่ายพิเศษตามข้อกำหนด (ถ้ามี)", rep.p3 ? money(rep.p3.sumSat) : "ไม่มี", ""]);
  aoa.push([], ["", "สรุป", "", ""]);
  aoa.push(["", "รวมค่าก่อสร้างทั้งโครงการงานก่อสร้าง", money(rep.summary.totalSat), ""]);
  aoa.push(["", "ราคากลาง", money(rep.summary.totalSat), "ราคากลาง = ค่าก่อสร้าง + ค่าครุภัณฑ์จัดซื้อ + ค่าใช้จ่ายพิเศษ (ข้อ 10 เล่ม 2)"]);
  aoa.push(["", `ราคากลาง ( ${bahtText(rep.summary.totalSat)} ตัวอักษร )`, "", ""]);
  aoa.push([]);
  aoa.push(...signatureRows(committee));
  const warn = warningsRows(rep.warnings);
  if (warn.length > 0) aoa.push(...warn);
  aoa.push(...footerRows());

  const ws = XL.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 8 }, { wch: 52 }, { wch: 18 }, { wch: 56 }];
  fmtCells(XL, ws, "C", 1, MONEY_FMT);
  return ws;
}

// ————— ชีต 8: รายละเอียดการหาค่า Factor F —————
function buildFactorFSheet(
  XL: XlsxModule,
  project: BoqProject,
  rep: Reg2569Report,
  committee: Committee | undefined,
): any {
  const fd = rep.factorFDetail;
  const moneyRows: number[] = [];
  const aoa: Row[] = [
    ["รายละเอียดการหาค่า Factor F"],
    ["ตามข้อ 6 เล่ม 2 — นำค่างานต้นทุนทั้งโครงการไปเทียบหาค่า Factor F จากตาราง Factor F ที่เกี่ยวข้อง"],
    ...headRows(project, committee),
  ];

  function moneyRow(label: string, sat: number, tail: Row = []) {
    aoa.push([label, money(sat), ...tail]);
    moneyRows.push(aoa.length);
  }

  moneyRow("1. ค่างานต้นทุนทั้งโครงการ (A)", fd.A, [`${(fd.A / 1e8).toLocaleString("th-TH", { maximumFractionDigits: 6 })} ล้านบาท`]);
  aoa.push(["2. ตาราง Factor F ที่ใช้", fd.haveTable ? "มีตาราง (จากชุดกฎที่ pin)" : "ยังไม่มีตาราง — ยังไม่ปรับ (F = 1) — unverified"]);
  if (fd.table) {
    aoa.push(["ค่าจ้างล่วงหน้า %", fd.table.advancePct, "เงินประกันผลงาน %", fd.table.retentionPct, "ดอกเบี้ยเงินกู้ %", fd.table.interestPct, "VAT %", fd.table.vatPct, "ประเภทงาน", workTypeLabel(fd.table.workType)]);
  }
  if (fd.row) {
    aoa.push(["3. แถวตารางที่ใช้", fd.row.rangeLabel]);
    aoa.push([`ค่าที่ขอบล่าง (${fd.row.colLo})`, fd.row.D, `ค่าที่ขอบบน (${fd.row.colHi})`, fd.row.E]);
    aoa.push([
      "วิธีหาค่า",
      fd.row.open
        ? "ช่วงปลายเปิด — ใช้ค่าคงที่ตามประกาศ (ไม่ interpolate)"
        : fd.row.interpolated
          ? `Interpolate ในช่วง: F = ${fd.row.colLo} − (${fd.row.colLo} − ${fd.row.colHi}) × (A − B) / (C − B)`
          : fd.row.D === fd.row.E
            ? "ช่วงค่าคงที่ — ใช้ค่าตรง"
            : "A ตรงขอบตารางพอดี — ใช้ค่าตรง (ไม่ interpolate)",
    ]);
    aoa.push(["4. คอลัมน์ที่ใช้", fd.columnLabel]);
  }
  aoa.push(["5. Factor F ที่ใช้", fd.factor !== null ? factorNum(fd.factor) : "1.000000 (ยังไม่ปรับ — F = 1)"]);
  moneyRow("ผลการคำนวณ A × F", fd.afterFactor, ["ปัดเศษ half-up เป็นสตางค์"]);
  if (fd.notes.length > 0) {
    aoa.push([], ["บันทึกการคำนวณ (trace จากเครื่องยนต์):"]);
    for (const n of fd.notes) aoa.push([`- ${n}`]);
  }
  aoa.push([]);
  aoa.push(...signatureRows(committee));
  const warn = warningsRows(rep.warnings);
  if (warn.length > 0) aoa.push(...warn);
  aoa.push(...footerRows());

  const ws = XL.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 46 }, { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 22 }];
  for (const r of moneyRows) {
    const cell = ws[`B${r}`];
    if (cell && typeof cell.v === "number") cell.z = MONEY_FMT;
  }
  return ws;
}

// ————— ชีต 9: แบบบันทึกเหตุผลการสืบราคาวัสดุก่อสร้าง + ค่าติดตั้งครุภัณฑ์ —————
function buildEvidenceSheet(XL: XlsxModule, project: BoqProject, rep: Reg2569Report, committee: Committee | undefined): any {
  const aoa: Row[] = [
    ["แบบบันทึกแสดงเหตุผลและความจำเป็นหรือรายละเอียด ในการสืบและการกำหนดราคาวัสดุก่อสร้าง"],
    ...headRows(project, committee),
    ["ที่", "รายการ", "หน่วย", "ราคาที่กำหนด/หน่วย (บาท)", "ที่มาและหลักฐานของราคา", "เหตุผลกำกับ", "สถานะ"],
  ];

  for (const r of rep.priceEvidence) {
    const flags: string[] = [];
    if (r.unstated) flags.push("ยังไม่ระบุแหล่งที่มาราคา (unverified)");
    if (r.stale) flags.push(r.staleDetail || "ราคาเก่ากว่า 12 เดือน (unverified)");
    if (r.notYetPublished) flags.push("เดือนอ้างอิงยังไม่ปรากฏราคาส่วนกลางในระบบ สนค. ณ วันที่พิมพ์ — unverified");
    aoa.push([r.no, r.name, r.unit, price(r.unitPrice), r.origin, r.reason, flags.length > 0 ? flags.join(" · ") : "มีหลักฐานที่มา"]);
  }

  if (rep.installEvidence.length > 0) {
    aoa.push([], ["ภาคผนวก: การสืบราคาค่าติดตั้งครุภัณฑ์ (แยกจากราคาครุภัณฑ์ — เล่ม 2 ข้อ 2.2/ข้อ 8)"]);
    aoa.push(["ที่", "รายการ", "จำนวน", "หน่วย", "ค่าติดตั้ง/หน่วย (บาท)", "เหตุผลความจำเป็น", "รายละเอียดการสืบราคา", "สถานะ"]);
    for (const r of rep.installEvidence) {
      const flags: string[] = [];
      if (r.missingPrice) flags.push("ยังไม่ระบุค่าติดตั้ง (unverified)");
      if (r.reasonMissing) flags.push("ขาดเหตุผลความจำเป็นหรือรายละเอียดการสืบราคา (unverified)");
      aoa.push([
        r.no,
        r.name,
        qty(r.qty),
        r.unit,
        r.installUnit !== null ? price(r.installUnit) : "",
        r.reason,
        r.sourcing,
        flags.length > 0 ? flags.join(" · ") : "มีหลักฐานที่มา",
      ]);
    }
  }

  aoa.push([]);
  aoa.push(["หมายเหตุ: ราคาทุกรายการต้องมีหลักฐานการสืบราคาและเหตุผลการกำหนดราคา · ราคาที่เก่ากว่า 12 เดือน หรืออ้างเดือนที่ยังไม่ปรากฏราคา ต้องสืบราคาใหม่ก่อนใช้จริง"]);
  aoa.push(...signatureRows(committee));
  aoa.push(...footerRows());

  const ws = XL.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 8 }, { wch: 36 }, { wch: 10 }, { wch: 18 }, { wch: 60 }, { wch: 30 }, { wch: 40 }, { wch: 28 }];
  fmtCells(XL, ws, "C", 1, QTY_FMT);
  fmtCells(XL, ws, "D", 1, MONEY_FMT);
  fmtCells(XL, ws, "E", 1, MONEY_FMT);
  return ws;
}

// ————— ประกอบไฟล์: 12 ชีต (ลดตามข้อมูลจริง) —————
export async function toReg2569WorkbookArray(
  project: BoqProject,
  ruleset: Ruleset | null | undefined,
  rep: Reg2569Report,
  opts: Reg2569ExportOptions = {},
): Promise<Uint8Array> {
  // ชุดเอกสาร 9 ชิ้น/ชุดเผยแพร่ตามข้อ 20 เป็นของโหมดราชการเท่านั้น — กันการใช้คำ "ราคากลาง" กับใบเสนอราคาเอกชน
  if ((project.mode ?? "gov") === "private") {
    throw new Error(
      "ชุดเอกสารเผยแพร่ตามข้อ 20 ใช้กับโหมดราชการเท่านั้น — โปรเจกต์นี้เป็นโหมดเอกชน (ใบเสนอราคา) ซึ่งไม่ใช่ราคากลางตามหลักเกณฑ์",
    );
  }
  const XL = await loadXlsx();
  const committee = opts.committee ?? project.committee;
  const printedAt = opts.now ?? new Date();
  const area = opts.area ?? project.buildingAreaSqm;
  const avgPerSqm =
    opts.avgPerSqm !== undefined
      ? opts.avgPerSqm
      : area !== undefined && area > 0
        ? Math.round(rep.constructionTotalSat) / 100 / area
        : null;

  const wb = XL.utils.book_new();
  const add = (name: string, ws: any) => XL.utils.book_append_sheet(wb, ws, sheetNameSafe(name));

  add(REG2569_SHEETS.cover, buildCoverSheet(XL, project, ruleset, rep, committee, printedAt, reg2569SheetNames(rep)));
  add(REG2569_SHEETS.p1g, buildP1gSheet(XL, project, rep, committee, area, avgPerSqm));
  add(REG2569_SHEETS.p1, buildP1Sheet(XL, project, rep, committee));
  if (rep.p2) {
    add(REG2569_SHEETS.p2g, buildP2gSheet(XL, project, rep, committee));
    add(REG2569_SHEETS.p2, buildP2Sheet(XL, project, rep, committee));
  }
  if (rep.p3) {
    add(REG2569_SHEETS.p3, buildP3Sheet(XL, project, rep, committee));
    add(REG2569_SHEETS.p3reason, buildP3ReasonSheet(XL, project, rep, committee));
  }
  add(REG2569_SHEETS.p4, buildP4Sheet(XL, project, rep, committee));
  add(REG2569_SHEETS.factorF, buildFactorFSheet(XL, project, rep, committee));
  add(REG2569_SHEETS.evidence, buildEvidenceSheet(XL, project, rep, committee));
  add(REG2569_SHEETS.boq, appendRows(XL, buildBoqSheet(XL, project), [
    ["ยอดในชีตนี้ = ผลรวมราคาวัสดุ-แรงงานของรายการ (รวมรายการครุภัณฑ์) — ยังไม่ปรับ Factor F และไม่รวม VAT/ค่าติดตั้ง/ค่าใช้จ่ายพิเศษ"],
    ["ยอดที่ใช้ยื่นหน่วยงานคือชุดแบบฟอร์ม ปร.1–ปร.4 (ดูชีต 7.ปร.4) — ห้ามใช้ยอดรวมในชีตนี้เป็นราคากลาง"],
    [REG2569_DISCLAIMER],
  ]));
  add(REG2569_SHEETS.sections, appendRows(XL, buildSectionSummarySheet(XL, project), [
    ["ยอดในชีตนี้ = ผลรวมราคาวัสดุ-แรงงานต่อหมวดงาน (ยังไม่ปรับ Factor F ไม่รวม VAT/ค่าติดตั้ง/ค่าใช้จ่ายพิเศษ) — ห้ามใช้ยอดรวมในชีตนี้เป็นราคากลาง (ราคากลางดูชีต 7.ปร.4)"],
    [REG2569_DISCLAIMER],
  ]));

  const out = XL.write(wb, { bookType: "xlsx", type: "array" }) as unknown;
  return out instanceof Uint8Array ? out : new Uint8Array(out as ArrayBuffer);
}

// ชื่อไฟล์ดาวน์โหลด — ภาษาไทยได้ แต่ตัดอักขระต้องห้ามของ Windows
export function reg2569Filename(project: BoqProject, now: Date = new Date()): string {
  const name = project.name.replaceAll(/[\\/:*?"<>|]/g, "-").trim().slice(0, 60) || "BOQ";
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `BOQ-${name}-ชุดเผยแพร่-2569-${d}.xlsx`;
}
