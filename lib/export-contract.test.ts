// เทสต์ส่งออก "แบบแสดงรายการ ปริมาณงาน และราคา (แนบท้ายสัญญา)" (xlsx ชีตเดียว)
// ข้อมูลชุดกฎ/ราคาเป็น "ข้อมูลทดสอบสมมุติ" ไม่ใช่ตัวเลขกฎหมาย — ห้ามนำไปอ้างอิงจริง
// ตรวจ: ผลรวมทุกบรรทัด = winItemsSat · ยอดรวม = winningSat · เงินเป็น number ·
// disclaimer ครบ · โหมดเอกชนถูกปฏิเสธ · ราคา invalid/สูงกว่า/เท่าราคากลางถูกปฏิเสธ · ชื่อไฟล์
import { describe, expect, it } from "vitest";
import * as XL from "xlsx";
import type { BoqItem, BoqProject } from "./boq";
import type { Ruleset } from "./ruleset";
import { computeGovBOQ } from "./calc/compute";
import { computePriceReduction } from "./calc/reduce";
import { buildReg2569Report } from "./report2569";
import {
  CONTRACT_DISCLAIMER,
  contractFilename,
  toContractWorkbookArray,
} from "./export-contract";
import { bahtText } from "./bahttext";

// ข้อมูลทดสอบสมมุติ — ห้ามใช้อ้างอิงจริง
const TEST_RULESET: Ruleset = {
  id: "test-ruleset-contract",
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
    workType: "building",
    rows: [{ B: 0, C: 100, D: 1.25, E: 1.2 }], // ข้อมูลสมมุติ
  },
  provenance: { sourceKind: "mirror-unverified", verifiedAgainstGazette: false, retrievedFrom: "test" },
  notices: [],
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

function goldenProject(): BoqProject {
  return {
    id: "p_contract",
    name: "ก่อสร้างอาคารทดสอบ",
    address: "เลขที่ 1 ต.ทดสอบ อ.ทดสอบ",
    boqType: "ปร.1",
    createdAt: "2026-11-01T00:00:00.000Z",
    committee: {
      agency: "อบต.ทดสอบ",
      province: "นครปฐม",
      chairman: "ประธานทดสอบ",
      member1: "กรรมการหนึ่ง",
      member2: "กรรมการสอง",
      formNo: "ทดสอบ-01",
      calcDate: "12 พฤศจิกายน 2569",
    },
    award: {
      contractNoteDate: "สัญญาเลขที่ 1/2569 ลงวันที่ 1 พฤศจิกายน 2569",
      contractor: "หจก.ผู้รับจ้างทดสอบ",
      contractorSigner: "นายทดสอบ ใจดี",
      procurementOfficer: "นางทดสอบ พัสดุ",
    },
    items: [
      item({ id: "c1", section: "งานโครงสร้าง", name: "งานคอนกรีต", unit: "ลบ.ม.", qty: 10, price: 100.25, matPrice: 70.25, laborPrice: 30 }),
      item({ id: "c2", section: "งานโครงสร้าง", name: "งานเหล็กเส้น", unit: "ตัน", qty: 2, price: 500, matPrice: 400, laborPrice: 100 }),
      item({ id: "c3", section: "งานสถาปัตยกรรม", name: "งานก่ออิฐ", unit: "ตร.ม.", qty: 3.5, price: 99.99 }),
      item({
        id: "e1",
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
  };
}

const GOLD = goldenProject();
const CALC = computeGovBOQ(GOLD, TEST_RULESET);
// ฐานราคากลางของแนบท้ายสัญญาต้องมาจากชุด 9 ชิ้น (ปร.4) — ไม่ใช่ยอดเครื่องยนต์เดิม
const REP = buildReg2569Report(GOLD, TEST_RULESET, CALC);
const BASE = REP.contractBase;

// ตั้งราคาชนะที่ 90% ของฐาน ปร.4 (ไม่ hardcode ตัวเลข)
const WINNING_SAT = Math.round(BASE.totalSat * 0.9);
const WINNING_BAHT = Number((WINNING_SAT / 100).toFixed(2));
const RED = computePriceReduction(GOLD, CALC, WINNING_BAHT, BASE);
// ฐานแบบเครื่องยนต์เดิม (afterFactor + ราคาครุภัณฑ์ดิบ + ค่าดำเนินงานครุภัณฑ์) — ใช้ทดสอบ F5
const ENGINE_BASE = computePriceReduction(GOLD, CALC, 1);

function rowsOf(wb: XL.WorkBook, name: string): (string | number | undefined)[][] {
  const ws = wb.Sheets[name];
  return XL.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: true }) as (string | number | undefined)[][];
}

function allText(wb: XL.WorkBook, name: string): string {
  return rowsOf(wb, name)
    .map((r) => r.map((c) => (c === undefined ? "" : String(c))).join(" | "))
    .join("\n");
}

async function workbookOf(p: BoqProject, winningBaht: number): Promise<XL.WorkBook> {
  const buf = await toContractWorkbookArray(p, CALC, winningBaht, { base: BASE, ruleset: TEST_RULESET });
  return XL.read(buf, { type: "array" });
}

describe("export-contract — แนบท้ายสัญญา (xlsx ชีตเดียว)", () => {
  it("ราคาทดสอบตั้งต้นถูกต้อง: ฐานมาจาก ปร.4 และราคาชนะต่ำกว่าฐานรายการ", () => {
    expect(RED.ok).toBe(true);
    expect(RED.baseSource).toBe("reg2569");
    expect(RED.fixedTotalSat).toBe(0); // ฐาน ปร.4 รวมทุกองค์ประกอบในรายการแล้ว
    expect(RED.winItemsSat).toBeGreaterThan(0);
    expect(RED.winItemsSat).toBeLessThan(RED.reducibleBaseSat);
    expect(RED.winItemsSat + RED.fixedTotalSat).toBe(RED.winningSat);
    // B1 invariant: ผลรวมฐานรายการ = ยอดรวม ปร.4 (ค่าก่อสร้าง + ครุภัณฑ์)
    expect(RED.reducibleBaseSat).toBe(REP.summary.totalSat);
    expect(BASE.totalSat).toBe(REP.summary.constructionSat + REP.summary.equipmentSat);
    expect(BASE.lines.reduce((a, l) => a + l.baseSat, 0)).toBe(BASE.totalSat);
  });

  it("ฐานรายการครุภัณฑ์รวม VAT + ค่าติดตั้งตาม ปร.2 (ไม่ใช่ราคาดิบ)", () => {
    const eq = RED.lines.find((l) => l.itemId === "e1")!;
    expect(REP.p2).toBeTruthy();
    expect(eq.medianSat).toBe(REP.p2!.rows[0].totalSat);
    // ราคาดิบ 2 × 14,500 = 29,000 บาท — ต้องมากกว่านั้นเพราะมี VAT และค่าติดตั้ง
    expect(eq.medianSat).toBeGreaterThan(2 * 14500 * 100);
  });

  it("มีชีตเดียวชื่อ 'แนบท้ายสัญญา' และผลรวมทุกบรรทัดเท่ากับ winItemsSat", async () => {
    const wb = await workbookOf(GOLD, WINNING_BAHT);
    expect(wb.SheetNames).toEqual(["แนบท้ายสัญญา"]);

    const rows = rowsOf(wb, "แนบท้ายสัญญา");
    const itemRows = rows.filter((r) => typeof r[0] === "number");
    expect(itemRows).toHaveLength(GOLD.items.length);

    const sumSat = Math.round(itemRows.reduce((a, r) => a + Number(r[6]), 0) * 100);
    expect(sumSat).toBe(RED.winItemsSat);

    const itemsTotal = rows.find((r) => r[1] === "รวมรายการ BOQ ตามสัญญา");
    expect(itemsTotal).toBeTruthy();
    expect(Math.round(Number(itemsTotal![6]) * 100)).toBe(RED.winItemsSat);
  });

  it("ยอดรวมวงเงินตามสัญญา = winningSat และมีจำนวนเงินเป็นตัวอักษร", async () => {
    const wb = await workbookOf(GOLD, WINNING_BAHT);
    const rows = rowsOf(wb, "แนบท้ายสัญญา");
    const grand = rows.find((r) => r[1] === "รวมวงเงินตามสัญญา");
    expect(grand).toBeTruthy();
    expect(Math.round(Number(grand![6]) * 100)).toBe(RED.winningSat);

    // แถวฐานราคากลาง/ราคาชนะ ต้องตรงกับผล reduce
    const baseRow = rows.find((r) => r[0] === "ราคากลางส่วนรายการ BOQ");
    expect(Math.round(Number(baseRow![1]) * 100)).toBe(RED.reducibleBaseSat);
    const winRow = rows.find((r) => r[0] === "ราคาตามคำเสนอของผู้ได้รับคัดเลือก (วงเงินตามสัญญา)");
    expect(Math.round(Number(winRow![1]) * 100)).toBe(RED.winningSat);

    expect(allText(wb, "แนบท้ายสัญญา")).toContain(bahtText(RED.winningSat));
  });

  it("ช่องเงิน/จำนวนเป็น number และราคาต่อหน่วยคำนวณจาก reducedSat เท่านั้น", async () => {
    const wb = await workbookOf(GOLD, WINNING_BAHT);
    const rows = rowsOf(wb, "แนบท้ายสัญญา");
    const itemRows = rows.filter((r) => typeof r[0] === "number");

    for (const r of itemRows) {
      expect(typeof r[2]).toBe("number"); // จำนวน
      expect(typeof r[4]).toBe("number"); // ราคากลาง/หน่วย
      expect(typeof r[5]).toBe("number"); // ราคาตามสัญญา/หน่วย
      expect(typeof r[6]).toBe("number"); // จำนวนเงินตามสัญญา
      expect(Number.isInteger(Math.round(Number(r[6]) * 100))).toBe(true); // ลงตัวที่สตางค์
    }

    const c1 = itemRows.find((r) => r[1] === "งานคอนกรีต");
    const line = RED.lines.find((l) => l.itemId === "c1")!;
    expect(c1![2]).toBe(line.qty);
    expect(c1![6]).toBe(line.reducedSat / 100);
    expect(c1![5]).toBe(Number((line.reducedSat / 100 / line.qty).toFixed(2)));
  });

  it("หัวเอกสาร/ลายเซ็น/disclaimer ครบ — ระบุว่าไม่ใช่ราคากลาง", async () => {
    const wb = await workbookOf(GOLD, WINNING_BAHT);
    const text = allText(wb, "แนบท้ายสัญญา");
    expect(text).toContain("แบบแสดงรายการ ปริมาณงาน และราคา (แนบท้ายสัญญา)");
    expect(text).toContain("นครปฐม");
    expect(text).toContain("อบต.ทดสอบ");
    expect(text).toContain("สัญญาเลขที่ 1/2569");
    expect(text).toContain("หจก.ผู้รับจ้างทดสอบ");
    expect(text).toContain("นางทดสอบ พัสดุ");
    expect(text).toContain("นายทดสอบ ใจดี");
    expect(text).toContain("เจ้าหน้าที่พัสดุ");
    expect(text).toContain(CONTRACT_DISCLAIMER);
    expect(text).toContain("ไม่ใช่ราคากลาง");
    expect(text).toContain("ไม่ใช่ราคามาตรฐานของกรมบัญชีกลาง");
    expect(text).toContain("unverified");
  });

  it("ตัวเลือก committee/procurementOfficer ทับข้อมูลโปรเจกต์ได้", async () => {
    const buf = await toContractWorkbookArray(GOLD, CALC, WINNING_BAHT, {
      committee: { ...GOLD.committee, province: "ขอนแก่น" },
      procurementOfficer: "นายเจ้าหน้าที่ ทดสอบ",
      base: BASE,
      ruleset: TEST_RULESET,
    });
    const text = allText(XL.read(buf, { type: "array" }), "แนบท้ายสัญญา");
    expect(text).toContain("ขอนแก่น");
    expect(text).toContain("นายเจ้าหน้าที่ ทดสอบ");
    expect(text).not.toContain("นางทดสอบ พัสดุ");
  });

  it("F1 — ระบุชุดกฎ/ปี พ.ศ. และเตือนเมื่อชุดกฎถูกแทนที่", async () => {
    const text = allText(await workbookOf(GOLD, WINNING_BAHT), "แนบท้ายสัญญา");
    expect(text).toContain("ชุดกฎราคากลาง");
    expect(text).toContain(TEST_RULESET.id);
    expect(text).toContain("พ.ศ. 2543"); // จาก effectiveFrom 2000-01-01 (ข้อมูลทดสอบ)

    const buf = await toContractWorkbookArray(GOLD, CALC, WINNING_BAHT, {
      base: BASE,
      ruleset: { ...TEST_RULESET, supersededBy: "new-ruleset" },
    });
    const sup = allText(XL.read(buf, { type: "array" }), "แนบท้ายสัญญา");
    expect(sup).toContain("ถูกแทนที่แล้ว");
    expect(sup).toContain("new-ruleset");
  });

  it("F5 — ราคาเสนอระหว่างฐานเครื่องยนต์เดิมกับ ปร.4 ต้องไม่ถูกปฏิเสธ", async () => {
    // ฐานเครื่องยนต์เดิมต่ำกว่า ปร.4 เพราะขาด VAT/ค่าติดตั้งครุภัณฑ์
    expect(ENGINE_BASE.reducibleBaseSat).toBeLessThan(BASE.totalSat);
    const between = Math.round((ENGINE_BASE.reducibleBaseSat + BASE.totalSat) / 2);
    expect(between).toBeGreaterThan(ENGINE_BASE.reducibleBaseSat);
    expect(between).toBeLessThan(BASE.totalSat);
    const buf = await toContractWorkbookArray(GOLD, CALC, between / 100, { base: BASE, ruleset: TEST_RULESET });
    expect(buf.length).toBeGreaterThan(0);
  });

  it("โหมดเอกชนถูกปฏิเสธ", async () => {
    await expect(
      toContractWorkbookArray({ ...GOLD, mode: "private" }, CALC, WINNING_BAHT, { base: BASE }),
    ).rejects.toThrow("โหมดราชการเท่านั้น");
  });

  it("ราคา invalid/เท่าหรือสูงกว่าฐานรายการ ถูกปฏิเสธพร้อมเหตุผล", async () => {
    await expect(toContractWorkbookArray(GOLD, CALC, 0, { base: BASE })).rejects.toThrow("ยังไม่ได้กรอกราคา");

    // ราคาชนะ "เท่าฐานรายการ" ต้องเทียบกับฐาน ปร.4
    const equalBaht = BASE.totalSat / 100;
    await expect(toContractWorkbookArray(GOLD, CALC, equalBaht, { base: BASE })).rejects.toThrow("ไม่ต้องปรับลด");
    await expect(toContractWorkbookArray(GOLD, CALC, equalBaht + 1, { base: BASE })).rejects.toThrow("สูงกว่าราคากลางส่วนรายการ");
  });

  it("ฐานที่ไม่ครบทุกบรรทัด BOQ / ผลรวมไม่ตรง ถูกปฏิเสธ", async () => {
    await expect(
      toContractWorkbookArray(GOLD, CALC, WINNING_BAHT, {
        base: { lines: BASE.lines.slice(1), totalSat: BASE.totalSat },
      }),
    ).rejects.toThrow("ไม่ครบทุกบรรทัด");
    await expect(
      toContractWorkbookArray(GOLD, CALC, WINNING_BAHT, {
        base: { lines: BASE.lines, totalSat: BASE.totalSat + 1 },
      }),
    ).rejects.toThrow("ไม่เท่ากับยอดรวมที่แจ้ง");
  });

  it("runtime guard — ผู้เรียกที่ไม่ส่ง base ต้องถูกปฏิเสธ (ไม่ถอยไปใช้ฐาน engine เดิม)", async () => {
    await expect(
      toContractWorkbookArray(GOLD, CALC, WINNING_BAHT, {} as never),
    ).rejects.toThrow("ต้องส่งฐานราคากลาง");
  });

  it("ชื่อไฟล์ตัดอักขระต้องห้ามของ Windows และลงวันที่", () => {
    expect(contractFilename(GOLD, new Date(2026, 10, 18))).toBe(
      "BOQ-ก่อสร้างอาคารทดสอบ-แนบท้ายสัญญา-2026-11-18.xlsx",
    );
    const weird = contractFilename({ ...GOLD, name: 'A/B:C*D?"E<F>G|' }, new Date(2026, 0, 2));
    expect(weird).not.toMatch(/[\\/:*?"<>|]/);
    expect(weird).toContain("แนบท้ายสัญญา-2026-01-02.xlsx");
    expect(contractFilename({ ...GOLD, name: "   " }, new Date(2026, 0, 2))).toBe(
      "BOQ-BOQ-แนบท้ายสัญญา-2026-01-02.xlsx",
    );
  });
});
