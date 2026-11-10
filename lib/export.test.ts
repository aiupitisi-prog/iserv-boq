// เวกเตอร์ทดสอบ export (F3.4) — เกณฑ์ตรวจรับ: CSV เปิด Excel ไทยไม่เพี้ยน (BOM), xlsx อ่านกลับได้ครบทั้ง 3 แผ่นงาน
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import type { BoqProject } from "./boq";
import { toCsv, toCsvRows, toXlsxArray } from "./export";

const TEST_RULESET = {
  id: "rs-test",
  name: "ชุดกฎทดสอบ (ข้อมูลสมมุติ)",
  sourceDoc: "ไม่ใช่เอกสารจริง",
  effectiveFrom: "2000-01-01",
  createdAt: "2000-01-01T00:00:00.000Z",
  checksum: "test",
  factorF: { advancePct: 0, retentionPct: 0, interestPct: 0, vatPct: 0, rows: [{ B: 0, C: 100, D: 1.25, E: 1.2 }] }, // ข้อมูลสมมุติ
  contingencyPct: 5,
  swcPct: 3,
};

function project(): BoqProject {
  return {
    id: "p_x",
    name: 'โปรเจกต์ "ทดสอบ", ปรับปรุง',
    address: "อ.เมือง จ.ขอนแก่น",
    boqType: "ปร.1",
    createdAt: "2000-01-01T00:00:00.000Z",
    items: [
      {
        id: "i1",
        section: 'งานรื้อ, ถอน',
        name: 'รื้อ "พื้น" คอนกรีต\n(รวมขนของออก)',
        unit: "ตร.ม.",
        qty: 12.5,
        price: 120.5,
      },
      {
        id: "i2",
        section: "งานรื้อ, ถอน",
        name: "รื้อผนังก่ออิฐ",
        unit: "ตร.ม.",
        qty: 30,
        price: 90,
        matPrice: 60,
        laborPrice: 30,
      },
      {
        id: "i3",
        section: "ครุภัณฑ์",
        name: "เครื่องปรับอากาศ",
        unit: "เครื่อง",
        qty: 2,
        price: 15000,
        part: "equipment",
      },
    ],
  };
}

describe("toCsv", () => {
  it("เริ่มด้วย UTF-8 BOM — Excel ไทยอ่านภาษาไทยไม่เพี้ยน", () => {
    const csv = toCsv(project());
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("escape ตาม RFC 4180 — เครื่องหมายคำพูด คอมมา และขึ้นบรรทัดใหม่", () => {
    const rows = toCsvRows(project());
    const nameCell = rows[1][2] as string;
    expect(nameCell).toContain('"พื้น"');
    expect(nameCell).toContain("\n");
    const csv = toCsv(project());
    // รายการที่มี \n ต้องถูกครอบด้วย " จน parse กลับได้ครบ 4 แถว (header + 3 items)
    const parsed = parseCsv(csv);
    expect(parsed.length).toBe(4); // header + 3 items
    expect(parsed[1][2]).toContain("รวมขนของออก");
  });

  it("ตัวเงินเป็นตัวเลขเปล่า (ไม่มี comma เป็นหลักพัน) กันตกหลุมคอลัมน์", () => {
    const csv = toCsv(project());
    const parsed = parseCsv(csv);
    expect(parsed[1][9]).toBe("1506.25"); // 12.5 × 120.50
    expect(parsed[3][9]).toBe("30000"); // 2 × 15,000 (ครุภัณฑ์)
  });
});

// parser CSV เล็ก ๆ สำหรับทดสอบ (รองรับ escape " ซ้อน)
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 1; // ข้าม BOM
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // ignore
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
    i++;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

describe("toXlsxArray", () => {
  it("อ่านกลับได้ 3 แผ่นงาน + ข้อมูลตรง (gov มีแผ่นสรุปราคากลาง)", async () => {
    const u8 = await toXlsxArray(project(), TEST_RULESET as never);
    const wb = XLSX.read(u8, { type: "array" });
    expect(wb.SheetNames).toEqual(["BOQ", "สรุปหมวดงาน", "สรุปราคากลาง"]);
    const boq = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["BOQ"], { header: 1, defval: "" });
    // แถว 1 = ชื่อโปรเจกต์ (อ่านกลับเป็นภาษาไทยได้ ไม่เพี้ยน)
    expect(String(boq[0][0])).toContain("โปรเจกต์");
    const flat = boq.map((r) => r.join("│"));
    expect(flat.some((l) => l.includes("เครื่องปรับอากาศ"))).toBe(true);
    expect(flat.some((l) => l.includes("รวมทั้งสิ้น"))).toBe(true);
  });

  it("โหมดเอกชน → แผ่นสรุปราคาเสนอ + ติดป้าย ไม่ใช่ราคากลาง", async () => {
    const p = project();
    p.mode = "private";
    p.factors = { contingencyPct: 5, profitPct: 15, swcPct: 3, vatPct: 7 };
    const u8 = await toXlsxArray(p, TEST_RULESET as never);
    const wb = XLSX.read(u8, { type: "array" });
    expect(wb.SheetNames).toEqual(["BOQ", "สรุปหมวดงาน", "สรุปราคาเสนอ"]);
    const lines = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["สรุปราคาเสนอ"], { header: 1, defval: "" }).map((r) => r.join("│"));
    expect(lines.some((l) => l.includes("ไม่ใช่ราคากลาง"))).toBe(true);
  });

  it("ยอดนอกตาราง Factor F → แผ่นสรุปมีข้อความคำนวณไม่สำเร็จ (ไม่ crash)", async () => {
    const p = project();
    p.items.push({ id: "i4", section: "งานใหม่", name: "งานใหญ่มาก", unit: "บาท", qty: 1, price: 500_000_000 }); // 500 ล้าน — นอกช่วงตารางสมมุติ
    const u8 = await toXlsxArray(p, TEST_RULESET as never);
    const wb = XLSX.read(u8, { type: "array" });
    const lines = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["สรุปราคากลาง"], { header: 1, defval: "" }).map((r) => r.join("│"));
    expect(lines.some((l) => l.includes("คำนวณไม่สำเร็จ"))).toBe(true);
  });

  it("ไฟล์จริงเขียนลงดิสก์แล้วอ่านกลับด้วย Excel-engine ได้ (sanity check โครงสร้าง zip)", async () => {
    const u8 = await toXlsxArray(project(), TEST_RULESET as never);
    expect(u8.byteLength).toBeGreaterThan(1000);
    expect(u8[0]).toBe(0x50); // "P" ของ PK zip header
    expect(u8[1]).toBe(0x4b); // "K"
    const dir = mkdtempSync(join(tmpdir(), "boqx-"));
    const file = join(dir, "test.xlsx");
    writeFileSync(file, u8);
    const wb = XLSX.readFile(file);
    expect(wb.SheetNames.length).toBe(3);
  });
});
