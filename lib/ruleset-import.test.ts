// ทดสอบการนำเข้าชุดกฎ — ตารางเดี่ยว (รูปแบบเดิม) + ชุดตาราง factorFTables (ว 481 ชุดข้อมูลจริงใน repo)
// ⚠️ ข้อมูลใน describe "ตารางเดี่ยว/ชุดตารางย่อย" เป็นข้อมูลสมมุติเพื่อทดสอบโครงสร้าง — ไม่ใช่ตัวเลขกฎหมาย
import { describe, expect, it } from "vitest";
import type { FactorFTable } from "./ruleset";
import { computeChecksum, rulesetChecksum } from "./ruleset";
import { prepareImport } from "./ruleset-import";
import { getW481Ruleset, verifyW481Checksums } from "./ruleset-w481-2569";

const LEGACY_TABLE: FactorFTable = {
  advancePct: 0,
  retentionPct: 5,
  interestPct: 7,
  vatPct: 0,
  rows: [
    { B: 0, C: 5, D: 1.15, E: 1.05 },
    { B: 5, C: 30, D: 1.13, E: 1.03 },
  ],
};

const legacyJson = JSON.stringify({
  name: "(สมมุติ) ชุดกฎตารางเดี่ยว",
  sourceDoc: "ข้อมูลสมมุติเพื่อทดสอบ — ไม่ใช่เอกสารทางการ",
  effectiveFrom: "2569-01-01",
  factorF: LEGACY_TABLE,
});

describe("prepareImport — ตารางเดี่ยว (รูปแบบเดิมของเฟส 2)", () => {
  it("นำเข้าผ่าน + checksum ครอบตาราง (export → แก้ค่า 1 ช่อง → import ใหม่ต้องถูกปฏิเสธ)", async () => {
    const { rs, note } = await prepareImport(legacyJson);
    expect(note).toContain("ไฟล์ไม่มี checksum");
    expect(rs.factorF?.rows).toHaveLength(2);
    expect(rs.checksum).toBe(await rulesetChecksum({ factorF: LEGACY_TABLE }));

    // round-trip: export → import ซ้ำต้องผ่าน (checksum ตรงกัน)
    const again = await prepareImport(JSON.stringify(rs));
    expect(again.rs.checksum).toBe(rs.checksum);

    // แก้ค่า Factor F 1 ช่อง → checksum เปลี่ยน → ปฏิเสธ
    const tampered = structuredClone(rs);
    tampered.factorF!.rows[0].D = 1.14;
    await expect(prepareImport(JSON.stringify(tampered))).rejects.toThrow(/checksum ไม่ตรงกับเนื้อหาตาราง/);
  });

  it("ไม่มี sourceDoc → ปฏิเสธ (กฎเหล็ก: ห้ามนำเข้าชุดกฎไม่ระบุที่มา)", async () => {
    const bad = JSON.parse(legacyJson) as Record<string, unknown>;
    delete bad.sourceDoc;
    await expect(prepareImport(JSON.stringify(bad))).rejects.toThrow(/sourceDoc/);
  });
});

describe("prepareImport — ชุดตาราง factorFTables (ว 481 ชุดข้อมูลจริง)", () => {
  it("round-trip: dataset จริง → import ผ่าน → export → import ซ้ำ checksum ตรงกัน + ได้ 48 ตาราง", async () => {
    expect(await verifyW481Checksums()).toEqual([]); // ตัว dataset เองต้องสมบูรณ์ก่อน
    const { checksum: _setChecksum, ...base } = getW481Ruleset(); // ตัด SET checksum ออก (มัน checksum เฉพาะ array ตาราง)
    const first = await prepareImport(JSON.stringify(base));
    expect(first.rs.factorFTables).toHaveLength(48);
    expect(first.note).toContain("ชุดตาราง Factor F 48 ตาราง");
    // ตารางแรก/สุดท้ายเรียงถูก + ผ่าน validator ทุกตารางแล้ว (prepareImport ตรวจให้)
    const again = await prepareImport(JSON.stringify(first.rs));
    expect(again.rs.checksum).toBe(first.rs.checksum);
    expect(again.rs.factorFTables).toHaveLength(48);
  });

  it("แก้ค่าในหนึ่งช่องของชุดตาราง → setChecksum ไม่ตรง (กันแก้ไฟล์) → ปฏิเสธ", async () => {
    const { checksum: _setChecksum, ...base } = getW481Ruleset();
    const first = await prepareImport(JSON.stringify(base));
    const tampered = structuredClone(first.rs);
    tampered.factorFTables![0].rows[0].D = 1.9999;
    await expect(prepareImport(JSON.stringify(tampered))).rejects.toThrow(/setChecksum ไม่ตรงกับชุดตาราง/);
  });

  it("ตารางซ้ำ (ประเภทงาน × ทดรองจ่าย × ประกันผลงาน เดียวกัน) → ปฏิเสธ", async () => {
    const dupJson = {
      name: "(สมมุติ) ชุดตารางซ้ำ",
      sourceDoc: "ข้อมูลสมมุติเพื่อทดสอบ",
      effectiveFrom: "2569-01-01",
      factorFTables: [
        { workType: "building", advancePct: 0, retentionPct: 0, interestPct: 6, vatPct: 7, rows: [{ B: 0, C: 5, D: 1.2, E: 1.1 }] },
        { workType: "building", advancePct: 0, retentionPct: 0, interestPct: 6, vatPct: 7, rows: [{ B: 0, C: 5, D: 1.3, E: 1.1 }] },
      ],
    };
    await expect(prepareImport(JSON.stringify(dupJson))).rejects.toThrow(/มีตารางซ้ำกัน/);
  });

  it("workType ไม่อยู่ใน 4 ประเภทงาน → ปฏิเสธ", async () => {
    const badJson = {
      name: "(สมมุติ) workType ผิด",
      sourceDoc: "ข้อมูลสมมุติเพื่อทดสอบ",
      effectiveFrom: "2569-01-01",
      factorFTables: [
        { workType: "roadX", advancePct: 0, retentionPct: 0, interestPct: 6, vatPct: 7, rows: [{ B: 0, C: 5, D: 1.2, E: 1.1 }] },
      ],
    };
    await expect(prepareImport(JSON.stringify(badJson))).rejects.toThrow(/workType ต้องเป็นหนึ่งใน/);
  });

  it("แถวช่วงไม่ต่อเนื่อง → ปฏิเสธพร้อมระบุลำดับตาราง", async () => {
    const gapJson = {
      name: "(สมมุติ) ช่วงมีช่องว่าง",
      sourceDoc: "ข้อมูลสมมุติเพื่อทดสอบ",
      effectiveFrom: "2569-01-01",
      factorFTables: [
        {
          workType: "road",
          advancePct: 5,
          retentionPct: 5,
          interestPct: 6,
          vatPct: 7,
          rows: [
            { B: 0, C: 5, D: 1.2, E: 1.1 },
            { B: 10, C: 20, D: 1.15, E: 1.05 }, // ช่องว่าง 5–10
          ],
        },
      ],
    };
    await expect(prepareImport(JSON.stringify(gapJson))).rejects.toThrow(/ตาราง Factor F ลำดับ 0.*ช่องว่าง/);
  });

  it("factorFTables ว่าง = ถือว่าไม่ระบุชุด (ไม่เข้า ruleset)", async () => {
    const empty = JSON.stringify({
      name: "(สมมุติ) ชุดว่าง",
      sourceDoc: "ข้อมูลสมมุติเพื่อทดสอบ",
      effectiveFrom: "2569-01-01",
      factorF: LEGACY_TABLE,
      factorFTables: [],
    });
    const { rs, note } = await prepareImport(empty);
    expect(rs.factorFTables).toBeUndefined();
    expect(note).not.toContain("ชุดตาราง");
  });
});

describe("setChecksum — กันการตัดชุดตารางออกจากไฟล์ภายหลัง", () => {
  // ชุดกฎแบบมีทั้งตารางเดี่ยว (factorF) และชุดตาราง (factorFTables) — ถ้าชุดตารางถูกตัดทิ้ง
  // เครื่องยนต์จะ fallback ไปตารางเดี่ยว (อาจเป็นประกาศต่างฉบับ) → ตัวเลขผิดแบบเงียบ
  const dualBase = {
    name: "(สมมุติ) ชุดกฎมีทั้งคู่",
    sourceDoc: "ข้อมูลสมมุติเพื่อทดสอบ — ไม่ใช่เอกสารทางการ",
    effectiveFrom: "2569-01-01",
    factorF: LEGACY_TABLE,
    factorFTables: [
      { workType: "building", advancePct: 0, retentionPct: 0, interestPct: 6, vatPct: 7, rows: [{ B: 0, C: 5, D: 1.2, E: 1.1 }] },
    ],
  };

  it("import ครั้งแรก → ระบบแนบ setChecksum ให้เอง (กัน strip รอบถัดไป)", async () => {
    const { rs } = await prepareImport(JSON.stringify(dualBase));
    expect(rs.setChecksum).toBe(await computeChecksum(rs.factorFTables!));
  });

  it("ตัด factorFTables ออกแต่เก็บ setChecksum → ปฏิเสธ", async () => {
    const { rs } = await prepareImport(JSON.stringify(dualBase));
    const { factorFTables: _stripped, ...rest } = rs;
    await expect(prepareImport(JSON.stringify(rest))).rejects.toThrow(/ระบุ setChecksum.*ไม่พบ factorFTables/);
  });

  it("แก้ค่าในชุดตารางหลังจากมี setChecksum → setChecksum ไม่ตรง → ปฏิเสธ", async () => {
    const { rs } = await prepareImport(JSON.stringify(dualBase));
    const tampered = structuredClone(rs);
    tampered.factorFTables![0].rows[0].D = 1.9;
    await expect(prepareImport(JSON.stringify(tampered))).rejects.toThrow(/setChecksum ไม่ตรงกับชุดตาราง/);
  });

  it("ชุด ว 481: install ส่ง SET checksum เป็น setChecksum → ตรวจผ่าน + แนบคงเดิม", async () => {
    const { checksum: setChecksum, ...base } = getW481Ruleset();
    const { rs } = await prepareImport(JSON.stringify({ ...base, setChecksum }));
    expect(rs.setChecksum).toBe(setChecksum);
  });
});

describe("rulesetChecksum — ครอบชุดตารางแบบ backward-compat", () => {
  it("ชุดกฎไม่มี factorFTables → canonical เหมือนรูปแบบเดิม (checksum ชุดกฎเก่าไม่เปลี่ยน)", async () => {
    const c = await rulesetChecksum({ factorF: LEGACY_TABLE });
    const legacyCanonical = await computeChecksum({
      factorF: LEGACY_TABLE,
      labor: null,
      contingencyPct: null,
      swcPct: null,
      durableHandlingPct: null,
    });
    expect(c).toBe(legacyCanonical);
  });

  it("มี factorFTables → checksum ต่างจากแบบไม่มี (เนื้อหาตารางเข้า checksum)", async () => {
    const { checksum: _setChecksum, ...base } = getW481Ruleset();
    const withTables = await rulesetChecksum({ ...base, factorFTables: base.factorFTables });
    const without = await rulesetChecksum({ ...base, factorFTables: undefined });
    expect(withTables).not.toBe(without);
    // ค่า null / undefined / [] ถือว่า "ไม่มีชุด" เหมือนกันหมด
    expect(await rulesetChecksum({ ...base, factorFTables: null })).toBe(without);
    expect(await rulesetChecksum({ ...base, factorFTables: [] })).toBe(without);
  });
});

// บัญชีค่าแรงงาน (ว 480) — backward-compat: ชุดกฎเดิมที่ไม่มี wageSchedule ต้องใช้ checksum เดิมได้
describe("rulesetChecksum — wageSchedule (ว 480) แบบ backward-compat", () => {
  const emptySchedule = { entries: [], notices: [] };

  it("wageSchedule undefined / null / entries ว่าง → checksum เท่ากับ canonical เดิม", async () => {
    const base = await rulesetChecksum({ factorF: LEGACY_TABLE });
    expect(await rulesetChecksum({ factorF: LEGACY_TABLE, wageSchedule: null })).toBe(base);
    expect(await rulesetChecksum({ factorF: LEGACY_TABLE, wageSchedule: { entries: [], notices: [] } })).toBe(base);
    expect(await rulesetChecksum({ factorF: LEGACY_TABLE, wageSchedule: undefined })).toBe(base);
  });

  it("prepareImport ไฟล์เก่า (ไม่มี wageSchedule/wageScheduleChecksum) → ผ่าน และ checksum ไม่เปลี่ยน", async () => {
    const file = {
      id: "legacy",
      name: "ชุดกฎเดิม",
      sourceDoc: "เอกสารทดสอบ",
      effectiveFrom: "2024-01-01",
      factorF: LEGACY_TABLE,
    };
    const { rs } = await prepareImport(JSON.stringify(file));
    expect(rs.wageSchedule).toBeUndefined();
    expect(rs.wageScheduleChecksum).toBeUndefined();
    expect(rs.checksum).toBe(await rulesetChecksum({ factorF: LEGACY_TABLE }));
  });

  it("prepareImport wageSchedule entries ว่าง → ถือว่าไม่ระบุ (ไม่ปฏิเสธ ไม่แนบ checksum)", async () => {
    const { rs } = await prepareImport(
      JSON.stringify({
        id: "empty-wage",
        name: "ชุดกฎที่ไม่มีบัญชีค่าแรงงาน",
        sourceDoc: "เอกสารทดสอบ",
        effectiveFrom: "2024-01-01",
        factorF: LEGACY_TABLE,
        wageSchedule: emptySchedule,
      }),
    );
    expect(rs.wageSchedule).toBeUndefined();
    expect(rs.wageScheduleChecksum).toBeUndefined();
  });

  it("prepareImport ราคา 0 หรือ level ไม่ตรงกับ no → ปฏิเสธ (เข้มเท่า parser)", async () => {
    const base = {
      id: "bad-wage",
      name: "ชุดกฎทดสอบ",
      sourceDoc: "เอกสารทดสอบ",
      effectiveFrom: "2024-01-01",
    };
    const entry = { no: "1.1", level: 2, name: "รายการทดสอบ", notes: [], prices: [{ price: 10, unit: "ต้น" }] };
    const zero = JSON.parse(JSON.stringify(entry));
    zero.prices[0].price = 0;
    await expect(prepareImport(JSON.stringify({ ...base, wageSchedule: { entries: [zero], notices: [] } }))).rejects.toThrow(/price/);

    const badLevel = JSON.parse(JSON.stringify(entry));
    badLevel.level = 3;
    await expect(prepareImport(JSON.stringify({ ...base, wageSchedule: { entries: [badLevel], notices: [] } }))).rejects.toThrow(/level/);
  });
});
