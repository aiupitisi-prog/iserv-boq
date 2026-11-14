// Golden tests ของตารางค่าดำเนินการและค่าเสื่อมราคา (กค 0433.2/ว 475)
// ค่าที่ตรึงไว้ในไฟล์นี้คัดลอกมาจาก PDF ต้นฉบับ (docs/reg-2569/w475.pdf) ที่หน้า/บรรทัดตามหมายเหตุในเทสต์
// — ใช้เป็น "ตะปู" กัน parser/extractor เปลี่ยนพฤติกรรมเงียบ ๆ
import { describe, expect, it } from "vitest";
import {
  W475_2569_BAND_CHECKSUMS,
  W475_2569_ITEMS,
  W475_2569_ITEMS_CHECKSUM,
  W475_2569_QUALITY,
  W475_2569_SCHEDULE,
  W475_2569_SET_CHECKSUM,
  W475_2569_STATS,
  W475_2569_FUEL_PRICE_BASIS,
  W475_2569_TITLE,
  getW475Ruleset,
  verifyW475Checksums,
} from "./ruleset-w475-2569";
import {
  findMachineryBand,
  findMachineryItem,
  machineryRateAt,
  rulesetChecksum,
  type MachineryRateBand,
} from "./ruleset";
import { prepareImport } from "./ruleset-import";
import { getW480Ruleset } from "./ruleset-w480-2569";
import { getW477Ruleset } from "./ruleset-w477-2569";

const band = (fuelMinSatang: number): MachineryRateBand => {
  const b = W475_2569_SCHEDULE.bands.find((x) => x.fuelMinSatang === fuelMinSatang);
  if (!b) throw new Error(`ไม่พบช่วงน้ำมัน ${fuelMinSatang}`);
  return b;
};

// บรรทัดรายการที่ใช้บ่อย (index ใน items)
const itemAt = (entryNo: number, label: string, occurrence = 1) => {
  const it = findMachineryItem(W475_2569_SCHEDULE, { entryNo, label, occurrence });
  if (!it) throw new Error(`ไม่พบรายการ ${entryNo} · ${label} #${occurrence}`);
  return it;
};

const FIVE = W475_2569_ITEMS.filter((i) => i.priced === "five");
const LUMP = W475_2569_ITEMS.filter((i) => i.priced === "lump");
const NONE = W475_2569_ITEMS.filter((i) => i.priced === "none");

describe("ว 475 — โครงสร้างตาราง", () => {
  it("หัวตาราง/ฐานราคาน้ำมันตรงตามที่พิมพ์", () => {
    expect(W475_2569_TITLE).toBe("ตารางค่าดำเนินการและค่าเสื่อมราคา");
    expect(W475_2569_SCHEDULE.titlePrinted).toBe(W475_2569_TITLE);
    expect(W475_2569_FUEL_PRICE_BASIS).toBe("อำเภอเมือง");
    expect(W475_2569_SCHEDULE.fuelPriceBasis).toBe(W475_2569_FUEL_PRICE_BASIS);
    expect(W475_2569_SCHEDULE.unit).toBe("satang");
  });

  it("มี 20 ลำดับ และ 77 บรรทัด (ราคา 5 ค่า 58 · ค่าก้อนเดียว 2 · หัวเรื่องไม่มีราคา 17)", () => {
    expect(W475_2569_SCHEDULE.items).toHaveLength(77);
    expect(FIVE).toHaveLength(58);
    expect(LUMP).toHaveLength(2);
    expect(NONE).toHaveLength(17);
    const entryNos = [...new Set(W475_2569_SCHEDULE.items.map((i) => i.entryNo))];
    expect(entryNos).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    // หัวเรื่องที่ไม่มีราคา = บรรทัดลำดับ (20) + หัวข้อย่อย 2 บรรทัดที่ต้นฉบับไม่พิมพ์ราคา
    expect(NONE.filter((i) => i.label === i.entryName)).toHaveLength(15);
    expect(NONE.filter((i) => i.label !== i.entryName).map((i) => i.label)).toEqual([
      "ค่าขนส่งอุปกรณ์ 80 ตัน ระยะขนส่ง100-300 กม.",
      "งานปูลาดและบดทับ ผิว AC หนา 5 ซม.",
    ]);
    expect(W475_2569_STATS).toEqual({
      pages: 91,
      bands: 45,
      items: 77,
      entries: 20,
      fivePriceItems: 58,
      lumpSumItems: 2,
      unpricedItems: 17,
      priceValues: 13140,
      fuelMinSatang: 2500,
      fuelMaxSatang: 6999,
    });
    expect(W475_2569_QUALITY.issues).toEqual([]);
  });

  it("บรรทัดที่มีราคาต้องมีหน่วย · บรรทัดหัวเรื่องต้องไม่มีหน่วย", () => {
    for (const it of [...FIVE, ...LUMP]) expect(it.unit).toEqual(expect.any(String));
    for (const it of NONE) expect(it.unit).toBeNull();
  });

  it("ค่าก้อนเดียว = ค่าติดตั้งเครื่องผสม 250,000 / 150,000 บาท/ครั้ง (ลำดับ 13 และ 14)", () => {
    expect(LUMP.map((i) => [i.entryNo, i.label, i.unit])).toEqual([
      [13, "ค่าติดตั้งเครื่องผสม", "ครั้ง"],
      [14, "ค่าติดตั้งเครื่องผสม", "ครั้ง"],
    ]);
    const b = band(2500);
    expect(b.operationSatang[W475_2569_ITEMS.indexOf(LUMP[0])]).toBe(25_000_000); // 250,000.00 บาท
    expect(b.operationSatang[W475_2569_ITEMS.indexOf(LUMP[1])]).toBe(15_000_000); // 150,000.00 บาท
  });

  it("45 ช่วงราคาน้ำมัน 25.00–69.99 ต่อเนื่อง และหน้า PDF ตรงกับช่วง (2 หน้า/ช่วง)", () => {
    expect(W475_2569_SCHEDULE.bands).toHaveLength(45);
    expect(band(2500).fuelMaxSatang).toBe(2599);
    expect(band(6900).fuelMaxSatang).toBe(6999);
    for (let i = 1; i < W475_2569_SCHEDULE.bands.length; i++) {
      expect(W475_2569_SCHEDULE.bands[i].fuelMinSatang).toBe(W475_2569_SCHEDULE.bands[i - 1].fuelMaxSatang + 1);
    }
    for (let i = 0; i < 45; i++) {
      expect(W475_2569_SCHEDULE.bands[i].sourcePages).toEqual([2 + 2 * i, 3 + 2 * i]);
    }
  });

  it("ทุกช่วงมี 5 คอลัมน์ยาวเท่า items และทุกค่าเป็นสตางค์จำนวนเต็ม > 0 หรือ null", () => {
    const failures: string[] = [];
    for (const b of W475_2569_SCHEDULE.bands) {
      for (const c of ["operationSatang", "depNormalSatang", "depRainySatang", "totalNormalSatang", "totalRainySatang"] as const) {
        const arr = b[c];
        if (arr.length !== W475_2569_SCHEDULE.items.length) failures.push(`ช่วง ${b.fuelMinSatang}: ${c} ยาว ${arr.length}`);
        for (let k = 0; k < arr.length; k++) {
          const v = arr[k];
          if (v !== null && (!Number.isInteger(v) || v <= 0)) failures.push(`ช่วง ${b.fuelMinSatang}: ${c}[${k}] = ${v}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("ผลบวกตรงทุกแถว: op + dep = total (ปกติ/ฝนชุก) และฝนชุก ≥ ปกติ", () => {
    const failures: string[] = [];
    for (const b of W475_2569_SCHEDULE.bands) {
      for (let k = 0; k < W475_2569_SCHEDULE.items.length; k++) {
        const it = W475_2569_SCHEDULE.items[k];
        if (it.priced !== "five") continue;
        const op = b.operationSatang[k] as number;
        const dn = b.depNormalSatang[k] as number;
        const dr = b.depRainySatang[k] as number;
        const tn = b.totalNormalSatang[k] as number;
        const tr = b.totalRainySatang[k] as number;
        if (op + dn !== tn) failures.push(`ช่วง ${b.fuelMinSatang} · ${it.label}: ${op}+${dn}≠${tn}`);
        if (op + dr !== tr) failures.push(`ช่วง ${b.fuelMinSatang} · ${it.label}: ${op}+${dr}≠${tr}`);
        if (dr < dn) failures.push(`ช่วง ${b.fuelMinSatang} · ${it.label}: ฝนชุก ${dr} < ปกติ ${dn}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("ค่าเสื่อมราคา/ค่าก้อนเดียวคงที่ทุกช่วงน้ำมัน · ค่าดำเนินการไม่ลดลงเมื่อน้ำมันแพงขึ้น", () => {
    const first = W475_2569_SCHEDULE.bands[0];
    const failures: string[] = [];
    for (let k = 0; k < W475_2569_SCHEDULE.items.length; k++) {
      const it = W475_2569_SCHEDULE.items[k];
      if (it.priced === "none") continue;
      if (it.priced === "lump") {
        for (const b of W475_2569_SCHEDULE.bands) {
          if (b.operationSatang[k] !== first.operationSatang[k]) failures.push(`${it.label}: ค่าก้อนเดียวไม่คงที่`);
        }
        continue;
      }
      for (const b of W475_2569_SCHEDULE.bands) {
        if (b.depNormalSatang[k] !== first.depNormalSatang[k]) failures.push(`${it.label}: dep ปกติไม่คงที่`);
        if (b.depRainySatang[k] !== first.depRainySatang[k]) failures.push(`${it.label}: dep ฝนชุกไม่คงที่`);
      }
      for (let j = 1; j < W475_2569_SCHEDULE.bands.length; j++) {
        const prev = W475_2569_SCHEDULE.bands[j - 1].operationSatang[k] as number;
        const cur = W475_2569_SCHEDULE.bands[j].operationSatang[k] as number;
        if (cur < prev) failures.push(`${it.label}: ค่าดำเนินการลดลงที่ช่วง ${W475_2569_SCHEDULE.bands[j].fuelMinSatang}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("golden: ช่วง 25.00 (หน้า 2/3) และ 69.00 (หน้า 90/91) ตรงกับที่พิมพ์", () => {
    const b1 = band(2500);
    const b45 = band(6900);
    const small = itemAt(1, "ขนาดเบา");
    const haul = itemAt(2, "ขุด - ขน");
    const at = (b: MachineryRateBand, it: typeof small) => {
      const r = machineryRateAt(W475_2569_SCHEDULE, b, it);
      if (!r) throw new Error("ไม่พบค่า");
      return [r.operationSatang, r.depNormalSatang, r.depRainySatang, r.totalNormalSatang, r.totalRainySatang];
    };
    // หน้า 2 (25.00–25.99): 1.45 / 0.22 / 0.28 / 1.67 / 1.73
    expect(at(b1, small)).toEqual([145, 22, 28, 167, 173]);
    // หน้า 2: 17.18 / 3.51 / 4.39 / 20.69 / 21.57
    expect(at(b1, haul)).toEqual([1718, 351, 439, 2069, 2157]);
    // หน้า 3 (25.00–25.99 ต่อ): ค่าผสมวัสดุแอสฟัลท์ติกคอนกรีต 312.52 / 16.77 / 20.96 / 329.29 / 333.48
    const asphalt = itemAt(13, "ค่าผสมวัสดุแอสฟัลท์ติกคอนกรีต");
    expect(at(b1, asphalt)).toEqual([31252, 1677, 2096, 32929, 33348]);
    // หน้า 90 (69.00–69.99): ค่าดำเนินการขึ้น แต่ค่าเสื่อมราคาเดิม (2.01 / 0.22 / 0.28 / 2.23 / 2.29)
    expect(at(b45, small)).toEqual([201, 22, 28, 223, 229]);
  });

  it("checksum รายช่วง/รายการ/ชุดรวม ตรงกับข้อมูล (verifyW475Checksums = [])", async () => {
    expect(await verifyW475Checksums()).toEqual([]);
    expect(Object.keys(W475_2569_BAND_CHECKSUMS)).toHaveLength(45);
    expect(W475_2569_ITEMS_CHECKSUM).toMatch(/^[0-9a-f]{16}$/);
  });

  it("ruleset ผูก checksum ของตัวเอง และ metadata ที่มาไม่ถูกรวมใน checksum", async () => {
    const rs = getW475Ruleset();
    expect(rs.id).toBe("reg2569-machinery-w475");
    expect(rs.checksum).toMatch(/^[0-9a-f]{16}$/);
    expect(rs.machineryScheduleChecksum).toBe(W475_2569_SET_CHECKSUM);
    expect(rs.effectiveFrom).toBe("2026-06-09");
    expect(rs.provenance).toEqual({
      sourceKind: "mirror-unverified",
      verifiedAgainstGazette: false,
      retrievedFrom: expect.stringContaining("yotathai"),
    });
    // ป้ายเตือนที่ต้องติดไปกับชุดข้อมูล (provenance + ค่าก้อนเดียว + disclaimer)
    expect(rs.notices).toHaveLength(3);
    expect(rs.notices?.join(" ")).toContain("mirror-unverified");
    expect(rs.notices?.join(" ")).toContain("ไม่ใช่ราคามาตรฐานของกรมบัญชีกลาง");
    expect(await rulesetChecksum(rs)).toBe(rs.checksum);
    expect(
      await rulesetChecksum({
        factorF: null,
        machinerySchedule: W475_2569_SCHEDULE,
        labor: null,
        contingencyPct: null,
        swcPct: null,
        durableHandlingPct: null,
      }),
    ).toBe(rs.checksum);
  });

  it("backward-compat: ชุดกฎที่ไม่มี machinerySchedule ยังได้ checksum เดิม (ว 480 = f15226a818ecc23e, ว 477 = b1e7141b0648d584)", async () => {
    expect(await rulesetChecksum(getW480Ruleset())).toBe("f15226a818ecc23e");
    expect(await rulesetChecksum(getW477Ruleset())).toBe("b1e7141b0648d584");
    const empty = await rulesetChecksum({ factorF: null, labor: null, contingencyPct: null, swcPct: null, durableHandlingPct: null });
    expect(await rulesetChecksum({ factorF: null, labor: null, contingencyPct: null, swcPct: null, durableHandlingPct: null, machinerySchedule: undefined })).toBe(empty);
    // bands = [] = ไม่ระบุตาราง → checksum เท่ากับไม่มีตาราง
    expect(
      await rulesetChecksum({
        factorF: null,
        labor: null,
        contingencyPct: null,
        swcPct: null,
        durableHandlingPct: null,
        machinerySchedule: { ...W475_2569_SCHEDULE, bands: [] },
      }),
    ).toBe(empty);
    expect(await rulesetChecksum({ factorF: null, machinerySchedule: W475_2569_SCHEDULE })).not.toBe(empty);
  });
});

describe("ว 475 — ตัวช่วยอ่านตาราง", () => {
  it("เลือกช่วงน้ำมันแบบปิดสองด้าน และคืน null นอกราคาที่ตารางครอบ", () => {
    expect(findMachineryBand(W475_2569_SCHEDULE, 2500)).toBe(band(2500));
    expect(findMachineryBand(W475_2569_SCHEDULE, 2599)).toBe(band(2500));
    expect(findMachineryBand(W475_2569_SCHEDULE, 2600)).toBe(band(2600));
    expect(findMachineryBand(W475_2569_SCHEDULE, 2499)).toBeNull();
    expect(findMachineryBand(W475_2569_SCHEDULE, 7000)).toBeNull();
    expect(findMachineryBand(W475_2569_SCHEDULE, NaN)).toBeNull();
    expect(findMachineryBand(W475_2569_SCHEDULE, Infinity)).toBeNull();
  });

  it("หาบรรทัดรายการด้วยลำดับ/ชื่อ/occurrence — ชื่อซ้ำในลำดับเดียวต้องแยกได้", () => {
    expect(itemAt(1, "ขนาดเบา").unit).toBe("ตร.ม.");
    expect(findMachineryItem(W475_2569_SCHEDULE, { entryNo: 1, label: "ไม่มีอยู่จริง" })).toBeNull();
    expect(findMachineryItem(W475_2569_SCHEDULE, { entryNo: 99, label: "ขนาดเบา" })).toBeNull();
    // ลำดับ 3 พิมพ์ "- ดันและตัก" 2 ครั้ง — ต้องแยกด้วย occurrence และเป็นคนละค่า
    const first = itemAt(3, "- ดันและตัก", 1);
    const second = itemAt(3, "- ดันและตัก", 2);
    expect(second.occurrence).toBe(2);
    const b = band(2500);
    expect(machineryRateAt(W475_2569_SCHEDULE, b, first)?.operationSatang).not.toBe(
      machineryRateAt(W475_2569_SCHEDULE, b, second)?.operationSatang,
    );
    expect(findMachineryItem(W475_2569_SCHEDULE, { entryNo: 3, label: "- ดันและตัก", occurrence: 3 })).toBeNull();
  });

  it("คืนค่าของบรรทัดตามช่วงน้ำมัน · บรรทัดหัวเรื่องคืน null ทุกช่อง · item นอกชุดคืน null", () => {
    const b = band(2500);
    const heading = itemAt(1, "งานถางป่าขุดตอ");
    expect(heading.priced).toBe("none");
    expect(machineryRateAt(W475_2569_SCHEDULE, b, heading)).toEqual({
      itemIndex: W475_2569_ITEMS.indexOf(heading),
      operationSatang: null,
      depNormalSatang: null,
      depRainySatang: null,
      totalNormalSatang: null,
      totalRainySatang: null,
    });
    const lump = LUMP[0];
    expect(machineryRateAt(W475_2569_SCHEDULE, b, lump)).toEqual({
      itemIndex: W475_2569_ITEMS.indexOf(lump),
      operationSatang: 25_000_000,
      depNormalSatang: null,
      depRainySatang: null,
      totalNormalSatang: null,
      totalRainySatang: null,
    });
    // object ที่ไม่ได้อยู่ใน schedule → null (ไม่เดา index)
    expect(machineryRateAt(W475_2569_SCHEDULE, b, { ...heading })).toBeNull();
  });
});

describe("ว 475 — import/export", () => {
  const payload = () => JSON.parse(JSON.stringify(getW475Ruleset())) as Record<string, unknown>;
  type RawBand = {
    fuelMinSatang: number;
    fuelMaxSatang: number;
    operationSatang: (number | null)[];
    depNormalSatang: (number | null)[];
    depRainySatang: (number | null)[];
    totalNormalSatang: (number | null)[];
    totalRainySatang: (number | null)[];
    sourcePages: [number, number];
  };
  type RawSched = {
    items: { priced: string; unit: string | null; label: string; occurrence: number }[];
    bands: RawBand[];
    unit: string;
    titlePrinted: string;
    fuelPriceBasis: string;
  };
  const sched = (raw: Record<string, unknown>) => raw.machinerySchedule as RawSched;

  it("นำเข้าไฟล์ที่ export จาก getW475Ruleset() ได้ checksum เดิม", async () => {
    const rs = getW475Ruleset();
    const { rs: imported, note } = await prepareImport(JSON.stringify(rs));
    expect(imported.checksum).toBe(rs.checksum);
    expect(imported.machineryScheduleChecksum).toBe(rs.machineryScheduleChecksum);
    expect(imported.machinerySchedule?.bands).toHaveLength(45);
    expect(note).toContain("machinerySchedule");
  });

  it("ปฏิเสธเมื่อราคาถูกแก้ภายหลัง (checksum ไม่ตรง)", async () => {
    const raw = payload();
    const s = sched(raw);
    // แก้ช่วงสุดท้าย (ไม่มีช่วงถัดไปให้ตรวจการลดลง) และปรับยอดรวมให้สอดคล้อง → ผ่าน validator โครงสร้าง แต่ checksum ต้องจับได้
    const last = s.bands.length - 1;
    const b = s.bands[last];
    const op = b.operationSatang[1] as number;
    b.operationSatang[1] = op + 1;
    b.totalNormalSatang[1] = op + 1 + (b.depNormalSatang[1] as number);
    b.totalRainySatang[1] = op + 1 + (b.depRainySatang[1] as number);
    await expect(prepareImport(JSON.stringify(raw))).rejects.toThrow(/machineryScheduleChecksum|checksum ไม่ตรง/);
  });

  it("ปฏิเสธโครงสร้างที่ผิด (หน่วยเงิน/ผลบวก/ช่วงน้ำมัน/ความยาว/ค่าเสื่อมไม่คงที่/ค่าดำเนินการลดลง/บรรทัดไม่มีหน่วย)", async () => {
    const badUnit = payload();
    sched(badUnit).unit = "baht";
    await expect(prepareImport(JSON.stringify(badUnit))).rejects.toThrow(/unit ต้องเป็น "satang"/);

    const badSum = payload();
    sched(badSum).bands[0].depNormalSatang[1] = 999;
    await expect(prepareImport(JSON.stringify(badSum))).rejects.toThrow(/≠ รวมปกติ/);

    const gap = payload();
    sched(gap).bands[5].fuelMinSatang += 1;
    await expect(prepareImport(JSON.stringify(gap))).rejects.toThrow(/ช่วงราคาน้ำมันไม่ต่อเนื่อง/);

    const short = payload();
    sched(short).bands[0].operationSatang.pop();
    await expect(prepareImport(JSON.stringify(short))).rejects.toThrow(/ต้องมี 77 ค่า/);

    // ค่าเสื่อมราคาไม่คงที่ข้ามช่วง (ปรับยอดรวมให้บวกถูกก่อน → ไปติดที่การตรวจคงที่)
    const depDrift = payload();
    const dd = sched(depDrift).bands[3];
    dd.depNormalSatang[1] = 23;
    dd.totalNormalSatang[1] = (dd.operationSatang[1] as number) + 23;
    await expect(prepareImport(JSON.stringify(depDrift))).rejects.toThrow(/ค่าเสื่อมราคาปกติไม่คงที่/);

    // ค่าดำเนินการลดลงเมื่อน้ำมันแพงขึ้น (ปรับยอดรวมทั้งสองฝั่งให้บวกถูกก่อน)
    const dropRaw = payload();
    const dr = sched(dropRaw).bands[1];
    dr.operationSatang[1] = 1;
    dr.totalNormalSatang[1] = 1 + (dr.depNormalSatang[1] as number);
    dr.totalRainySatang[1] = 1 + (dr.depRainySatang[1] as number);
    await expect(prepareImport(JSON.stringify(dropRaw))).rejects.toThrow(/ค่าดำเนินการลดลง/);

    const noUnit = payload();
    sched(noUnit).items[1].unit = null;
    await expect(prepareImport(JSON.stringify(noUnit))).rejects.toThrow(/มีราคาแต่ไม่มีหน่วย/);

    const badPrice = payload();
    sched(badPrice).items[0].priced = "five";
    await expect(prepareImport(JSON.stringify(badPrice))).rejects.toThrow(/มีราคาแต่ไม่มีหน่วย/);
  });

  it("ปฏิเสธโครงสร้างที่เหลือ: lump มีค่าช่องอื่น · none มีราคา · หัวตารางว่าง · sourcePages ไม่ต่อเนื่อง · รายการซ้ำ", async () => {
    // ค่าก้อนเดียวต้องมีเฉพาะค่าดำเนินการ
    const lumpExtra = payload();
    const lumpSched = sched(lumpExtra);
    const lumpIdx = lumpSched.items.findIndex((i) => i.priced === "lump");
    lumpSched.bands[0].depNormalSatang[lumpIdx] = 5;
    await expect(prepareImport(JSON.stringify(lumpExtra))).rejects.toThrow(/ค่าก้อนเดียว.*ช่องอื่นต้องเป็น null/);

    // หัวเรื่องไม่มีราคาต้องเป็น null ทุกช่อง
    const nonePriced = payload();
    const noneSched = sched(nonePriced);
    const noneIdx = noneSched.items.findIndex((i) => i.priced === "none");
    noneSched.bands[0].operationSatang[noneIdx] = 5;
    await expect(prepareImport(JSON.stringify(nonePriced))).rejects.toThrow(/หัวเรื่องไม่มีราคา.*null ทุกช่อง/);

    const noTitle = payload();
    sched(noTitle).titlePrinted = "";
    await expect(prepareImport(JSON.stringify(noTitle))).rejects.toThrow(/titlePrinted/);

    const noBasis = payload();
    sched(noBasis).fuelPriceBasis = "";
    await expect(prepareImport(JSON.stringify(noBasis))).rejects.toThrow(/fuelPriceBasis/);

    const pages = payload();
    sched(pages).bands[3].sourcePages = [9, 10];
    await expect(prepareImport(JSON.stringify(pages))).rejects.toThrow(/sourcePages ไม่ต่อเนื่อง/);

    const dup = payload();
    const ds = sched(dup);
    ds.items[2].label = ds.items[1].label;
    ds.items[2].occurrence = ds.items[1].occurrence;
    await expect(prepareImport(JSON.stringify(dup))).rejects.toThrow(/รายการซ้ำ/);
  });

  it("ปฏิเสธเมื่อไฟล์อ้าง machineryScheduleChecksum แต่ไม่มีตาราง", async () => {
    const raw = payload();
    delete raw.machinerySchedule;
    await expect(prepareImport(JSON.stringify(raw))).rejects.toThrow(/machineryScheduleChecksum.*ไม่พบ machinerySchedule/);
  });

  it("bands = [] ถือว่าไม่ระบุตาราง — ตัดทิ้งและ checksum เทียบเท่าแบบไม่มีตาราง", async () => {
    const raw = payload();
    delete raw.machineryScheduleChecksum;
    sched(raw).bands = [];
    raw.checksum = await rulesetChecksum({ factorF: null, labor: null, contingencyPct: null, swcPct: null, durableHandlingPct: null });
    const { rs } = await prepareImport(JSON.stringify(raw));
    expect(rs.machinerySchedule).toBeUndefined();
    expect(rs.machineryScheduleChecksum).toBeUndefined();
  });

  it("ตารางที่นำเข้าถูกตรึงแบบลึก — แก้ไม่ได้หลังตรวจ checksum", async () => {
    const { rs } = await prepareImport(JSON.stringify(getW475Ruleset()));
    expect(rs.machinerySchedule).toBeDefined();
    expect(Object.isFrozen(rs.machinerySchedule)).toBe(true);
    const s = rs.machinerySchedule!;
    expect(Object.isFrozen(s.items[0])).toBe(true);
    expect(Object.isFrozen(s.bands[0].operationSatang)).toBe(true);
    expect(() => {
      (s.bands[0].operationSatang as (number | null)[])[1] = 1;
    }).toThrow();
    expect(s.bands[0].operationSatang[1]).not.toBe(1);
  });
});
