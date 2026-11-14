// เทสต์ชุดส่งออก "ชุดเอกสารเผยแพร่ราคากลาง พ.ศ. 2569" (xlsx หลายชีต — ข้อ 20)
// ตาราง/อัตราเป็น "ข้อมูลทดสอบสมมุติ" ไม่ใช่ตัวเลขกฎหมาย — ห้ามนำไปอ้างอิงจริง
// ตรวจ: ชื่อชีตถูกกฎ Excel · ชีตครบ/ลดตามข้อมูลจริง · เงินเป็น number · bahtText ใน ปร.4 ·
// disclaimer ทุกชีต · ชื่อไฟล์ · สารบัญในชีต 00
import { beforeAll, describe, expect, it } from "vitest";
import * as XL from "xlsx";
import type { BoqItem, BoqProject } from "./boq";
import type { Ruleset } from "./ruleset";
import { computeGovBOQ } from "./calc/compute";
import { buildReg2569Report, type Reg2569Report } from "./report2569";
import {
  REG2569_DISCLAIMER,
  REG2569_SHEETS,
  reg2569Filename,
  reg2569SheetNames,
  sheetNameSafe,
  toReg2569WorkbookArray,
} from "./export-reg2569";
import { bahtText } from "./bahttext";

const NOW = new Date(2026, 10, 12); // 12 พ.ย. 2569 (local) — ให้เทสต์ deterministic

// ข้อมูลทดสอบสมมุติ — ห้ามใช้อ้างอิงจริง
const TEST_RULESET: Ruleset = {
  id: "test-ruleset-2569",
  name: "ชุดกฎทดสอบ (ข้อมูลสมมุติ)",
  sourceDoc: "ไม่ใช่เอกสารจริง — ใช้ทดสอบเครื่องยนต์เท่านั้น",
  effectiveFrom: "2000-01-01",
  createdAt: "2000-01-01T00:00:00.000Z",
  checksum: "test-checksum",
  factorF: {
    advancePct: 0,
    retentionPct: 0,
    interestPct: 0,
    vatPct: 7,
    workType: "building", // ข้อมูลสมมุติ — ทดสอบการแปลงเป็นป้ายไทย (WORK_TYPE_LABELS)
    rows: [{ B: 0, C: 100, D: 1.25, E: 1.2 }], // ข้อมูลสมมุติ
  },
  provenance: { sourceKind: "mirror-unverified", verifiedAgainstGazette: false, retrievedFrom: "test" },
  notices: ["ข้อความทดสอบจากชุดกฎ"],
  contingencyPct: 5,
  swcPct: 3,
  durableHandlingPct: 2,
};

function item(over: Partial<BoqItem>): BoqItem {
  return {
    id: over.id ?? "it_" + Math.random().toString(36).slice(2),
    section: "งานทดสอบ",
    name: "รายการทดสอบ",
    unit: "หน่วย",
    qty: 1,
    price: 0,
    ...over,
  } as BoqItem;
}

function project(over: Partial<BoqProject>): BoqProject {
  return {
    id: "p_test",
    name: "โปรเจกต์ทดสอบ",
    address: "ที่ทดสอบ",
    boqType: "ปร.1",
    createdAt: new Date().toISOString(),
    items: [],
    ...over,
  };
}

// โปรเจกต์ทอง: 2 หมวดงาน + ครุภัณฑ์มีค่าติดตั้ง + ค่าใช้จ่ายพิเศษ 2 รายการ + เนื้อที่อาคาร
function goldenProject(): BoqProject {
  return project({
    committee: {
      agency: "หน่วยงานทดสอบ",
      chairman: "ประธานทดสอบ",
      member1: "กรรมการหนึ่ง",
      member2: "กรรมการสอง",
      formNo: "ทดสอบ-01",
      calcDate: "12 พฤศจิกายน 2569",
    },
    buildingAreaSqm: 100,
    items: [
      item({
        section: "งานเตรียมงาน",
        name: "ค่าบริหารงาน",
        unit: "งาน",
        qty: 10,
        price: 100.25,
        matPrice: 70.25,
        laborPrice: 30,
        source: {
          kind: "tpso",
          code: "C1",
          prov: "10",
          provName: "ส่วนกลาง",
          year: 2569,
          month: 9,
          priceAtPick: 70.25,
          pickedAt: "2026-11-01T00:00:00.000Z",
        },
      }),
      item({ section: "งานโครงสร้าง", name: "งานคอนกรีต", unit: "ลบ.ม.", qty: 2, price: 500, matPrice: 400, laborPrice: 100 }),
      item({ section: "งานโครงสร้าง", name: "งานเหล็กเส้น", unit: "ตัน", qty: 3.5, price: 99.99 }), // ไม่แยก ก./ข.
      item({
        section: "งานระบบไฟฟ้า",
        name: "ตู้พาเนลหลัก",
        unit: "ตู้",
        qty: 2,
        price: 14500,
        part: "equipment",
        installPrice: 1200,
        installPriceReason: "ต้องติดตั้งหน้างาน",
        installSourcingDetail: "สอบราคาผู้รับจ้าง 2 ราย",
      }),
    ],
    specialExpenses: [
      { id: "se1", name: "ค่าเช่าเครนยกของหน้างาน", qty: 1, unit: "งาน", amount: 1000, vatIncluded: true, reason: "จำเป็น", calcDetail: "เช่า 1 วัน" },
      { id: "se2", name: "ค่าประสานงานพื้นที่", qty: 2, unit: "ครั้ง", amount: 500, vatIncluded: false },
    ],
  });
}

function reportOf(p: BoqProject): Reg2569Report {
  const calc = computeGovBOQ(p, TEST_RULESET);
  return buildReg2569Report(p, TEST_RULESET, calc, NOW);
}

function rowsOf(wb: XL.WorkBook, name: string): (string | number | undefined)[][] {
  const ws = wb.Sheets[name];
  return XL.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: true }) as (string | number | undefined)[][];
}

function allText(wb: XL.WorkBook, name: string): string {
  return rowsOf(wb, name)
    .map((r) => r.map((c) => (c === undefined ? "" : String(c))).join(" | "))
    .join("\n");
}

const GOLD = goldenProject();
const GOLD_REP = reportOf(GOLD);

describe("export-reg2569 — ชุดเอกสารเผยแพร่ (xlsx หลายชีต)", () => {
  let buf: Uint8Array;
  let wb: XL.WorkBook;

  beforeAll(async () => {
    buf = await toReg2569WorkbookArray(GOLD, TEST_RULESET, GOLD_REP, { now: NOW });
    wb = XL.read(buf, { type: "array" });
  });

  it("มีชีตครบตามชุด 9 ชิ้น + BOQ/สรุปหมวดงาน และชื่อชีตถูกกฎ Excel", () => {
    expect(wb.SheetNames).toEqual(reg2569SheetNames(GOLD_REP));
    expect(wb.SheetNames[0]).toBe(REG2569_SHEETS.cover);
    expect(wb.SheetNames).toHaveLength(12); // มีครุภัณฑ์ + ค่าใช้จ่ายพิเศษ
    for (const n of wb.SheetNames) {
      expect(n.length).toBeLessThanOrEqual(31);
      expect(n).not.toMatch(/[\\/:*?[\]]/);
    }
  });

  it("ทุกชีตมี disclaimer และชีต 00 มีสารบัญ/ที่มา/คำเตือน", () => {
    for (const n of wb.SheetNames) {
      expect(allText(wb, n)).toContain(REG2569_DISCLAIMER);
    }
    const cover = allText(wb, REG2569_SHEETS.cover);
    for (const n of wb.SheetNames) expect(cover).toContain(n);
    expect(cover).toContain("mirror-unverified");
    expect(cover).toContain("ข้อความทดสอบจากชุดกฎ"); // notices จากชุดกฎ
    expect(cover).toContain(bahtText(GOLD_REP.summary.totalSat));
  });

  it("เงินในเซลล์เป็น number (บาท 2 ตำแหน่ง) และตรงกับยอดเครื่องยนต์ (สตางค์ ÷ 100)", () => {
    const p4 = rowsOf(wb, REG2569_SHEETS.p4);
    const row = p4.find((r) => r[1] === "ราคากลาง");
    expect(row).toBeTruthy();
    expect(typeof row![2]).toBe("number");
    expect(row![2]).toBe(GOLD_REP.summary.totalSat / 100);

    // ทุกช่องเงินของคอลัมน์ค่าก่อสร้าง (C) ต้องเป็น number — ยกเว้นคำว่า "ไม่มี" (ไม่มีครุภัณฑ์/ค่าใช้จ่ายพิเศษ)
    const start = p4.findIndex((r) => r[2] === "ค่าก่อสร้าง (บาท)");
    expect(start).toBeGreaterThan(-1);
    for (const r of p4.slice(start + 1)) {
      if (String(r[0] ?? "").startsWith("ลงชื่อ")) break; // ถึงบล็อกลงนามแล้ว
      const v = r[2];
      if (v === undefined || v === "") continue;
      if (typeof v === "string") expect(v).toBe("ไม่มี");
      else expect(typeof v).toBe("number");
    }

    // ปร.1(ก): ยอดค่าก่อสร้างรวมเท่ากับ constructionTotalSat
    const p1g = rowsOf(wb, REG2569_SHEETS.p1g);
    const totalRow = p1g.find((r) => r[1] === "รวมค่างานต้นทุน / รวมค่าก่อสร้าง");
    expect(totalRow![4]).toBe(GOLD_REP.constructionTotalSat / 100);

    // ปร.3: ยอดรวมค่าใช้จ่ายพิเศษตรงกับ report
    const p3 = rowsOf(wb, REG2569_SHEETS.p3);
    const p3Total = p3.find((r) => r[1] === "รวมค่าใช้จ่ายพิเศษตามข้อกำหนดทุกรายการ");
    expect(p3Total![4]).toBe(GOLD_REP.p3!.sumSat / 100);
  });

  it("ปร.4 มีจำนวนเงินเป็นตัวอักษร (bahtText) และส่วนสรุป 3 ส่วน", () => {
    const p4 = allText(wb, REG2569_SHEETS.p4);
    expect(p4).toContain(bahtText(GOLD_REP.summary.totalSat));
    expect(p4).toContain("ค่างานต้นทุน");
    expect(p4).toContain("ค่าครุภัณฑ์จัดซื้อ");
    expect(p4).toContain("ค่าใช้จ่ายพิเศษตามข้อกำหนด");
  });

  it("ชีต ปร.1 แยกหมวดงานและมีค่าวัสดุ/ค่าแรง/หมายเหตุ", () => {    const p1 = allText(wb, REG2569_SHEETS.p1);
    for (const sh of GOLD_REP.p1Sheets) expect(p1).toContain(sh.section);
    expect(p1).toContain("ยังไม่แยกค่าวัสดุ/ค่าแรง"); // แถวไม่แยก ก./ข.
  });

  it("ชีต 9 มีป้าย unverified ของราคาที่ไม่มีหลักฐาน และภาคผนวกค่าติดตั้งครุภัณฑ์", () => {
    const ev = allText(wb, REG2569_SHEETS.evidence);
    expect(ev).toContain("ยังไม่ระบุแหล่งที่มาราคา (unverified)");
    expect(ev).toContain("ภาคผนวก: การสืบราคาค่าติดตั้งครุภัณฑ์");
  });

  it("Factor F: แสดง A, แถวตาราง, คอลัมน์ที่ใช้ และผล A × F", () => {
    const ff = allText(wb, REG2569_SHEETS.factorF);
    expect(ff).toContain("ค่างานต้นทุนทั้งโครงการ (A)");
    expect(ff).toContain(GOLD_REP.factorFDetail.columnLabel);
    expect(ff).toContain("ผลการคำนวณ A × F");
  });

  it("ปร.1(ก) มีกล่องเงื่อนไข Factor F 4 อัตรา + จำนวนแบบ ปร.1 ที่แนบ", () => {
    const rows = rowsOf(wb, REG2569_SHEETS.p1g);
    const t = allText(wb, REG2569_SHEETS.p1g);
    expect(t).toContain(`แบบ ปร.1 ที่แนบ จำนวน ${GOLD_REP.p1Sheets.length} หน้า`);
    expect(t).toContain("ค่าจ้างล่วงหน้า");
    expect(t).toContain("เงินประกันผลงาน");
    expect(t).toContain("ดอกเบี้ยเงินกู้");
    expect(t).toContain("ภาษีมูลค่าเพิ่ม");
    // กล่อง 4 อัตราทีละช่อง — ค่าต้องมาจากตารางที่เลือกเท่านั้น (ห้ามเดา)
    const box = rows.find((r) => r[0] === "ค่าจ้างล่วงหน้า")!;
    expect(box).toBeTruthy();
    expect(box[1]).toBe(`${TEST_RULESET.factorF!.advancePct}%`);
    expect(box[3]).toBe(`${TEST_RULESET.factorF!.retentionPct}%`);
    expect(box[5]).toBe(`${TEST_RULESET.factorF!.interestPct}%/ปี`);
    expect(box[7]).toBe("7%"); // VAT ตามตารางทดสอบ
    expect(box[9]).toBe("อาคาร"); // workType แปลงเป็นป้ายไทยจาก WORK_TYPE_LABELS
  });

  it("ปร.2(ก)/ปร.2 map VAT ครุภัณฑ์ vs VAT ค่าติดตั้งถูกคอลัมน์ และยอดรวมตรง report", () => {
    const p2 = GOLD_REP.p2!;
    const g = p2.groups[0];

    const gRows = rowsOf(wb, REG2569_SHEETS.p2g);
    const gRow = gRows.find((r) => r[1] === g.section)!;
    expect(gRow[2]).toBe(g.equipSat / 100);
    expect(gRow[3]).toBe(g.equipVatSat! / 100);
    expect(gRow[4]).toBe((g.equipSat + (g.equipVatSat ?? 0)) / 100);
    expect(gRow[5]).toBe(g.installSat / 100);
    expect(gRow[6]).toBe(g.installVatSat! / 100);
    expect(gRow[7]).toBe((g.installSat + (g.installVatSat ?? 0)) / 100);
    expect(gRow[8]).toBe(g.totalSat / 100);
    const gTotal = gRows.find((r) => r[1] === "รวม")!;
    expect(gTotal[8]).toBe(p2.sumSat / 100);

    const r = p2.rows[0];
    const rows = rowsOf(wb, REG2569_SHEETS.p2);
    const row = rows.find((x) => x[1] === r.name)!;
    expect(row[4]).toBe(r.equipUnit);
    expect(row[5]).toBe(r.equipSat / 100);
    expect(row[6]).toBe(r.equipVatSat! / 100);
    expect(row[7]).toBe(r.installUnit!);
    expect(row[8]).toBe(r.installSat / 100);
    expect(row[9]).toBe(r.installVatSat! / 100);
    expect(row[10]).toBe(r.totalSat / 100);
    expect(row[11]).toBe(r.installReason);
    expect(row[12]).toBe(r.installSourcing);
  });

  it("ไม่มีตาราง Factor F → ปร.2 ไม่คิด VAT และติดป้าย unverified (ห้ามเดาอัตรา)", async () => {
    const p = project({
      items: [item({ name: "ครุภัณฑ์ทดสอบ", part: "equipment", qty: 1, price: 1000, installPrice: 200 })],
    });
    const empty: Ruleset = {
      id: "empty-vat",
      name: "ชุดกฎว่าง",
      sourceDoc: "ไม่ใช่เอกสารจริง",
      effectiveFrom: "2000-01-01",
      createdAt: "2000-01-01T00:00:00.000Z",
      checksum: "empty-vat",
    };
    const rep = buildReg2569Report(p, empty, computeGovBOQ(p, empty), NOW);
    expect(rep.p2!.vatPct).toBeNull();
    const b = await toReg2569WorkbookArray(p, empty, rep, { now: NOW });
    const w = XL.read(b, { type: "array" });
    const rows = rowsOf(w, REG2569_SHEETS.p2g);
    const row = rows.find((x) => x[1] === "งานทดสอบ")!;
    expect(row[2]).toBe(rep.p2!.groups[0].equipSat / 100);
    expect(row[3]).toBe(""); // VAT ครุภัณฑ์ว่าง (ไม่ทราบอัตรา)
    expect(row[4]).toBe(rep.p2!.groups[0].equipSat / 100);
    expect(row[6]).toBe(""); // VAT ค่าติดตั้งว่าง
    expect(allText(w, REG2569_SHEETS.p2g)).toContain("ยังไม่ทราบอัตรา VAT (unverified)");
  });

  it("ชีต BOQ/สรุปหมวดงาน อธิบายชัดว่ายอดในชีตไม่ใช่ราคากลาง", () => {
    const warn = "ห้ามใช้ยอดรวมในชีตนี้เป็นราคากลาง";
    expect(allText(wb, REG2569_SHEETS.boq)).toContain(warn);
    expect(allText(wb, REG2569_SHEETS.sections)).toContain(warn);
    expect(allText(wb, REG2569_SHEETS.sections)).toContain("ราคากลางดูชีต 7.ปร.4");
  });

  it("โหมดเอกชน — export ชุดเผยแพร่ต้องปฏิเสธ (กันใช้คำ 'ราคากลาง' ผิดโหมด)", async () => {
    const p: BoqProject = { ...GOLD, mode: "private" };
    const rep = reportOf(p);
    await expect(toReg2569WorkbookArray(p, TEST_RULESET, rep, { now: NOW })).rejects.toThrow(/โหมดราชการ/);
  });

  it("โปรเจกต์ไม่มีครุภัณฑ์/ค่าใช้จ่ายพิเศษ → ไม่มีชีต ปร.2/ปร.3 (ตรงกับหน้าพิมพ์)", async () => {
    const p = project({
      items: [item({ name: "งานเดียว", qty: 1, price: 1000, matPrice: 700, laborPrice: 300 })],
    });
    const rep = reportOf(p);
    const b = await toReg2569WorkbookArray(p, TEST_RULESET, rep, { now: NOW });
    const w = XL.read(b, { type: "array" });
    expect(w.SheetNames).not.toContain(REG2569_SHEETS.p2g);
    expect(w.SheetNames).not.toContain(REG2569_SHEETS.p2);
    expect(w.SheetNames).not.toContain(REG2569_SHEETS.p3);
    expect(w.SheetNames).not.toContain(REG2569_SHEETS.p3reason);
    expect(w.SheetNames).toHaveLength(8);
    for (const n of w.SheetNames) expect(allText(w, n)).toContain(REG2569_DISCLAIMER);
  });

  it("โปรเจกต์ไม่มีตาราง Factor F → ยังติดป้าย unverified (F = 1) ไม่เดาค่า", async () => {
    const p = project({ items: [item({ qty: 1, price: 500, matPrice: 300, laborPrice: 200 })] });
    const empty: Ruleset = {
      id: "empty",
      name: "ชุดกฎว่าง",
      sourceDoc: "ไม่ใช่เอกสารจริง",
      effectiveFrom: "2000-01-01",
      createdAt: "2000-01-01T00:00:00.000Z",
      checksum: "empty",
    };
    const rep = buildReg2569Report(p, empty, computeGovBOQ(p, empty), NOW);
    const b = await toReg2569WorkbookArray(p, empty, rep, { now: NOW });
    const w = XL.read(b, { type: "array" });
    const ff = allText(w, REG2569_SHEETS.factorF);
    expect(ff).toContain("unverified");
    expect(ff).toContain("F = 1");
    // ปร.1(ก): กล่องเงื่อนไขต้องติดป้าย unverified ด้วย — และห้ามพิมพ์ช่องอัตราเดา
    const p1g = allText(w, REG2569_SHEETS.p1g);
    expect(p1g).toContain("ยังไม่มีตาราง Factor F");
    expect(p1g).not.toContain("ค่าจ้างล่วงหน้า");
    const cover = allText(w, REG2569_SHEETS.cover);
    expect(cover).toContain("ยังไม่ pin ชุดกฎราคากลาง");
  });

  it("sheetNameSafe ตัดอักขระต้องห้ามและความยาวไม่เกิน 31", () => {
    expect(sheetNameSafe("a/b:c*d?e[f]g\\h")).toBe("a-b-c-d-e-f-g-h");
    expect(sheetNameSafe("x".repeat(40)).length).toBe(31);
    expect(sheetNameSafe("   ")).toBe("Sheet");
  });

  it("ชื่อไฟล์ดาวน์โหลดเป็น .xlsx และมีคำว่า ชุดเผยแพร่", () => {
    const f = reg2569Filename({ ...GOLD, name: "โครงการทดสอบ/ทดสอบ" }, NOW);
    expect(f.startsWith("BOQ-")).toBe(true);
    expect(f).toContain("ชุดเผยแพร่");
    expect(f).toContain("2026-11-12");
    expect(f.endsWith(".xlsx")).toBe(true);
    expect(f).not.toContain("/");
  });
});
