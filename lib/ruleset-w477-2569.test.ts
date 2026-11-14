// Golden tests ของตารางค่าขนส่งวัสดุก่อสร้าง (กค 0433.2/ว 477)
// ค่าที่ตรึงไว้ในไฟล์นี้คัดลอกมาจาก PDF ต้นฉบับ (docs/reg-2569/w477.pdf) ที่หน้า/ระยะตามหมายเหตุในเทสต์
// — ใช้เป็น "ตะปู" กัน parser/extractor เปลี่ยนพฤติกรรมเงียบ ๆ
import { describe, expect, it } from "vitest";
import {
  W477_2569_BAND_CHECKSUMS,
  W477_2569_CONDITIONS,
  W477_2569_DISTANCE_END_KM,
  W477_2569_DISTANCE_START_KM,
  W477_2569_FUEL_PRICE_BASIS,
  W477_2569_QUALITY,
  W477_2569_SECTIONS,
  W477_2569_SET_CHECKSUM,
  W477_2569_STATS,
  W477_2569_SCHEDULE,
  getW477Ruleset,
  verifyW477Checksums,
} from "./ruleset-w477-2569";
import {
  findTransportBand,
  findTransportSection,
  rulesetChecksum,
  transportBandNotices,
  transportChargeAt,
  type TransportFuelBand,
} from "./ruleset";
import { prepareImport } from "./ruleset-import";
import { getW480Ruleset } from "./ruleset-w480-2569";

const s1 = W477_2569_SECTIONS[0]; // 6 ล้อ ≤15 ตัน
const s2 = W477_2569_SECTIONS[1]; // 10 ล้อ ≤25 ตัน
const s3 = W477_2569_SECTIONS[2]; // 10 ล้อ + รถลากพ่วง ≤47 ตัน

const band = (sec: typeof s1, fuelMinSatang: number): TransportFuelBand => {
  const b = sec.bands.find((x) => x.fuelMinSatang === fuelMinSatang);
  if (!b) throw new Error(`ไม่พบช่วงน้ำมัน ${fuelMinSatang} ใน ${sec.truckType}`);
  return b;
};

describe("ว 477 — โครงสร้างตาราง", () => {
  it("มี 3 ประเภทารถตามต้นฉบับ (6 ล้อ ≤15 / 10 ล้อ ≤25 / 10 ล้อ+พ่วง ≤47)", () => {
    expect(W477_2569_SECTIONS.map((s) => [s.lorryCount, s.hasTrailer, s.maxGrossTons])).toEqual([
      [6, false, 15],
      [10, false, 25],
      [10, true, 47],
    ]);
    expect(s1.truckType).toBe("6 ล้อ");
    expect(s2.truckType).toBe("10 ล้อ");
    expect(s3.truckType).toBe("10 ล้อ + รถลากพ่วง");
    expect(W477_2569_SECTIONS.every((s) => s.titlePrinted.includes("ไม่เกิน"))).toBe(true);
  });

  it("แต่ละประเภทมี 45 ช่วงราคาน้ำมัน 25.00–69.99 ต่อเนื่องกัน", () => {
    for (const sec of W477_2569_SECTIONS) {
      expect(sec.bands.length).toBe(45);
      expect(sec.bands[0].fuelMinSatang).toBe(2500);
      expect(sec.bands[0].fuelMaxSatang).toBe(2599);
      expect(sec.bands[44].fuelMinSatang).toBe(6900);
      expect(sec.bands[44].fuelMaxSatang).toBe(6999);
      for (let i = 1; i < sec.bands.length; i++) {
        expect(sec.bands[i].fuelMinSatang).toBe(sec.bands[i - 1].fuelMaxSatang + 1);
      }
    }
  });

  it("ระยะทาง 1–200 กม. ครบทุกช่วง (20,000 แถว/ประเภท) และจำนวนแถวรวมตรง metadata", () => {
    expect(W477_2569_DISTANCE_START_KM).toBe(1);
    expect(W477_2569_DISTANCE_END_KM).toBe(200);
    expect(W477_2569_SCHEDULE.distanceStartKm).toBe(1);
    for (const sec of W477_2569_SECTIONS) {
      for (const b of sec.bands) {
        expect(b.perTonSatang).toHaveLength(200);
        expect(b.perM3Satang).toHaveLength(200);
        expect(b.farMinKm).toBe(201);
        expect(b.farMaxKm).toBe(1000);
      }
    }
    expect(W477_2569_STATS).toEqual({
      sections: 3,
      bandsPerSection: 45,
      distanceStartKm: 1,
      distanceEndKm: 200,
      distanceRows: 27000,
    });
    expect(W477_2569_QUALITY.issues).toBe(0);
  });

  it("ทุกจำนวนเงินเป็นสตางค์จำนวนเต็มบวก และค่าที่เพิ่มขึ้นตามระยะทาง", () => {
    // รวบรวม failure แล้ว assert ครั้งเดียว — เร็วกว่า expect ต่อค่ามาก (54,000 ค่า)
    // และยังบอกตำแหน่ง (ประเภทรถ/ช่วงน้ำมัน/ระยะ) ได้เมื่อล้ม
    const failures: string[] = [];
    for (const sec of W477_2569_SECTIONS) {
      for (const b of sec.bands) {
        const where = `${sec.truckType} · ช่วง ${b.fuelMinSatang}`;
        for (let i = 0; i < b.perTonSatang.length; i++) {
          const t = b.perTonSatang[i];
          const m = b.perM3Satang[i];
          if (!Number.isInteger(t)) failures.push(`${where} ระยะ index ${i}: perTonSatang ไม่ใช่จำนวนเต็ม (${t})`);
          if (!Number.isInteger(m)) failures.push(`${where} ระยะ index ${i}: perM3Satang ไม่ใช่จำนวนเต็ม (${m})`);
          if (!(t > 0)) failures.push(`${where} ระยะ index ${i}: perTonSatang ต้อง > 0 (${t})`);
          if (!(m > t)) failures.push(`${where} ระยะ index ${i}: perM3Satang (${m}) ต้อง > perTonSatang (${t})`);
          if (i > 0) {
            if (t < b.perTonSatang[i - 1]) failures.push(`${where} ระยะ index ${i}: perTonSatang ลดลง (${b.perTonSatang[i - 1]} → ${t})`);
            if (m < b.perM3Satang[i - 1]) failures.push(`${where} ระยะ index ${i}: perM3Satang ลดลง (${b.perM3Satang[i - 1]} → ${m})`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("เงื่อนไขการใช้ตาราง (ภูมิประเทศ/ผิวทาง/จราจร) + ฐานราคาน้ำมัน มาจากหัวตารางทุกหน้า", () => {
    expect(W477_2569_SCHEDULE.conditions).toHaveLength(3);
    expect(W477_2569_CONDITIONS).toEqual(W477_2569_SCHEDULE.conditions);
    expect(W477_2569_SCHEDULE.conditions.join(" ")).toContain("ลาดยาง");
    expect(W477_2569_SCHEDULE.conditions.join(" ")).toContain("จราจรปกติ");
    expect(W477_2569_FUEL_PRICE_BASIS).toBe(W477_2569_SCHEDULE.fuelPriceBasis);
    expect(W477_2569_SCHEDULE.fuelPriceBasis).toContain("ดีเซล");
    // ตารางใช้ได้เฉพาะเงื่อนไขนี้ — ต้องไม่เป็นค่าว่าง (ผู้เรียกต้องเตือนเมื่อสภาพงานไม่ตรง)
    expect(W477_2569_SCHEDULE.conditions.every((c) => c.trim().length > 0)).toBe(true);
  });

  it("หมายเหตุของตาราง: ช่วง 201–1000 กม. คิดเป็น กม.ละ + สูตรคูณระยะทาง + ค่าเฉลี่ยน้ำมัน (ตัด \"- \" แล้ว)", () => {
    expect(W477_2569_SCHEDULE.notices).toHaveLength(3);
    expect(W477_2569_SCHEDULE.notices.every((n) => !n.startsWith("- "))).toBe(true);
    expect(W477_2569_SCHEDULE.notices[0]).toContain("201 กม.");
    expect(W477_2569_SCHEDULE.notices[0]).toContain("1000 กม.");
    expect(W477_2569_SCHEDULE.notices[1]).toContain("คูณด้วยอัตราค่าขนส่งต่อตัน");
    expect(W477_2569_SCHEDULE.notices[2]).toContain("เชื้อเพลิงเฉลี่ย");
    expect(W477_2569_SCHEDULE.unit).toBe("satang");

    // helper ประกอบข้อความพร้อมค่าของแต่ละช่วงน้ำมัน
    const b = band(s1, 2500);
    const out = transportBandNotices(W477_2569_SCHEDULE, b);
    expect(out).toHaveLength(3);
    expect(out[0]).toContain("3.06 บาท/ตัน");
    expect(out[0]).toContain("4.28 บาท/ลบ.ม.");
    expect(out[1]).toBe(W477_2569_SCHEDULE.notices[1]);
    expect(out[2]).toContain("25.50 บาท/ลิตร");
    // ข้อความต้นฉบับใน schedule ต้องไม่ถูกแก้ (helper คืนสำเนา)
    expect(W477_2569_SCHEDULE.notices[0]).not.toContain("3.06");

    // จับจากเนื้อข้อความ ไม่ใช่ตำแหน่ง — สลับลำดับหมายเหตุก็ยังเติมค่าถูกข้อ
    const reordered = { ...W477_2569_SCHEDULE, notices: [W477_2569_SCHEDULE.notices[2], W477_2569_SCHEDULE.notices[1], W477_2569_SCHEDULE.notices[0]] };
    const out2 = transportBandNotices(reordered, b);
    expect(out2[0]).toContain("25.50 บาท/ลิตร");
    expect(out2[1]).toBe(W477_2569_SCHEDULE.notices[1]);
    expect(out2[2]).toContain("3.06 บาท/ตัน");
    expect(out2[2]).toContain("4.28 บาท/ลบ.ม.");
  });
});

describe("ว 477 — ค่าตามต้นฉบับ (golden)", () => {
  it("6 ล้อ · น้ำมัน 25.00–25.99 (หน้า 9–10)", () => {
    const b = band(s1, 2500);
    expect(b.avgFuelSatang).toBe(2550);
    expect(b.perTonSatang[0]).toBe(1350); // ระยะ 1 กม. = 13.50 บาท/ตัน
    expect(b.perM3Satang[0]).toBe(1889); // 18.89 บาท/ลบ.ม.
    expect(b.perTonSatang[40]).toBe(12732); // ระยะ 41 กม. = 127.32
    expect(b.perM3Satang[40]).toBe(17824);
    expect(b.perTonSatang[119]).toBe(36807); // ระยะ 120 กม. = 368.07 (หน้าสุดท้ายของหน้าแรก)
    expect(b.perM3Satang[119]).toBe(51530);
    expect(b.perTonSatang[120]).toBe(37111); // ระยะ 121 กม. = 371.11 (หน้าแรกของหน้าที่สอง)
    expect(b.perM3Satang[120]).toBe(51956);
    expect(b.perTonSatang[199]).toBe(61185); // ระยะ 200 กม. = 611.85
    expect(b.perM3Satang[199]).toBe(85659);
    expect(b.farPerTonSatang).toBe(306); // 201–1000 กม. = 3.06 บาท/ตัน/กม.
    expect(b.farPerM3Satang).toBe(428);
    expect(b.sourcePages).toEqual([9, 10]);
  });

  it("6 ล้อ · น้ำมัน 69.00–69.99 (หน้า 97–98)", () => {
    const b = band(s1, 6900);
    expect(b.avgFuelSatang).toBe(6950);
    expect(b.perTonSatang[0]).toBe(1516);
    expect(b.perM3Satang[0]).toBe(2122);
    expect(b.perTonSatang[40]).toBe(19547);
    expect(b.perTonSatang[80]).toBe(38384);
    expect(b.perM3Satang[80]).toBe(53738);
    expect(b.perTonSatang[146]).toBe(69466); // ระยะ 147
    expect(b.perM3Satang[146]).toBe(97252);
    expect(b.perTonSatang[173]).toBe(82186); // ระยะ 174
    expect(b.perM3Satang[173]).toBe(115060);
    expect(b.farPerTonSatang).toBe(472);
    expect(b.farPerM3Satang).toBe(661);
    expect(b.sourcePages).toEqual([97, 98]);
  });

  it("10 ล้อ · น้ำมัน 25.00–25.99 (หน้า 100–101) และ 10 ล้อ+พ่วง · 25.00 (หน้า 191–192)", () => {
    const b2 = band(s2, 2500);
    expect(b2.perTonSatang[0]).toBe(796); // 7.96
    expect(b2.perM3Satang[0]).toBe(1114); // 11.14
    expect(b2.farPerTonSatang).toBe(232);
    expect(b2.farPerM3Satang).toBe(325);
    expect(b2.sourcePages).toEqual([100, 101]);

    const b3 = band(s3, 2500);
    expect(b3.perTonSatang[0]).toBe(437); // 4.37
    expect(b3.perM3Satang[0]).toBe(612); // 6.12
  });

  it("10 ล้อ+พ่วง · น้ำมัน 69.00–69.99 (หน้า 279–280) — ฟอนต์ต่างจาก section อื่นแต่ค่าเดียวกันตามตาราง", () => {
    const b = band(s3, 6900);
    expect(b.avgFuelSatang).toBe(6950);
    expect(b.perTonSatang[0]).toBe(550); // 5.50
    expect(b.perM3Satang[0]).toBe(770); // 7.70
    expect(b.perTonSatang[40]).toBe(10548); // ระยะ 41 = 105.48
    expect(b.perM3Satang[40]).toBe(14767);
    expect(b.perTonSatang[80]).toBe(20780); // ระยะ 81 = 207.80
    expect(b.perM3Satang[80]).toBe(29091);
    expect(b.farPerTonSatang).toBe(256);
    expect(b.farPerM3Satang).toBe(358);
    expect(b.sourcePages).toEqual([279, 280]);
  });

  it("รถใหญ่กว่าคิดราคาต่อหน่วยถูกกว่า ณ ช่วงน้ำมัน/ระยะเดียวกัน (ทุกช่วงน้ำมัน)", () => {
    for (let i = 0; i < 45; i++) {
      for (const km of [1, 41, 120, 200]) {
        const a = s1.bands[i].perTonSatang[km - 1];
        const b = s2.bands[i].perTonSatang[km - 1];
        const c = s3.bands[i].perTonSatang[km - 1];
        expect(a).toBeGreaterThan(b);
        expect(b).toBeGreaterThan(c);
      }
    }
  });
});

describe("ว 477 — checksum", () => {
  it("checksum รายช่วง/รายประเภท/ชุดรวม ตรงกับข้อมูล (verifyW477Checksums = [])", async () => {
    expect(await verifyW477Checksums()).toEqual([]);
    expect(Object.keys(W477_2569_BAND_CHECKSUMS)).toHaveLength(3 * 45);
  });

  it("ruleset ผูก checksum ของตัวเอง และ metadata ที่มาไม่ถูกรวมใน checksum", async () => {
    const rs = getW477Ruleset();
    expect(rs.id).toBe("reg2569-transport-w477");
    expect(rs.checksum).toMatch(/^[0-9a-f]{16}$/);
    expect(rs.transportScheduleChecksum).toBe(W477_2569_SET_CHECKSUM);
    expect(rs.effectiveFrom).toBe("2026-06-09");
    expect(rs.provenance).toEqual({
      sourceKind: "mirror-unverified",
      verifiedAgainstGazette: false,
      retrievedFrom: expect.stringContaining("yotathai"),
    });
    expect(rs.notices).toHaveLength(3);
    expect(await rulesetChecksum(rs)).toBe(rs.checksum);
    // provenance ไม่ใช่ตัวเลขกฎหมาย → ไม่อยู่ใน canonical ของ checksum (ตรวจจากรูปแบบที่คำนวณ)
    expect(
      await rulesetChecksum({
        factorF: null,
        transportSchedule: W477_2569_SCHEDULE,
        labor: null,
        contingencyPct: null,
        swcPct: null,
        durableHandlingPct: null,
      }),
    ).toBe(rs.checksum);
  });

  it("backward-compat: ชุดกฎที่ไม่มี transportSchedule ยังได้ checksum เดิม (ว 480 = f15226a818ecc23e)", async () => {
    expect(await rulesetChecksum(getW480Ruleset())).toBe("f15226a818ecc23e");
    const empty = await rulesetChecksum({ factorF: null, labor: null, contingencyPct: null, swcPct: null, durableHandlingPct: null });
    const withUndefined = await rulesetChecksum({
      factorF: null,
      labor: null,
      contingencyPct: null,
      swcPct: null,
      durableHandlingPct: null,
      transportSchedule: undefined,
    });
    expect(withUndefined).toBe(empty);
    const withSchedule = await rulesetChecksum({ factorF: null, transportSchedule: W477_2569_SCHEDULE });
    expect(withSchedule).not.toBe(empty);
  });
});

describe("ว 477 — ตัวช่วยอ่านตาราง", () => {
  it("เลือกประเภทรถ/ช่วงน้ำมันได้ และคืน null เมื่อไม่พบหรือน้ำหนักเกินขอบ", () => {
    expect(findTransportSection(W477_2569_SCHEDULE, { lorryCount: 6, hasTrailer: false })).toBe(s1);
    expect(findTransportSection(W477_2569_SCHEDULE, { lorryCount: 10, hasTrailer: true })).toBe(s3);
    expect(findTransportSection(W477_2569_SCHEDULE, { lorryCount: 12, hasTrailer: false })).toBeNull();
    // น้ำหนักรวมต้องไม่เกิน maxGrossTons ของตารางนั้น (ไม่บังคับส่ง = ไม่ตรวจ)
    expect(findTransportSection(W477_2569_SCHEDULE, { lorryCount: 6, hasTrailer: false, grossTons: 15 })).toBe(s1);
    expect(findTransportSection(W477_2569_SCHEDULE, { lorryCount: 6, hasTrailer: false, grossTons: 15.1 })).toBeNull();
    expect(findTransportSection(W477_2569_SCHEDULE, { lorryCount: 10, hasTrailer: true, grossTons: 47 })).toBe(s3);
    expect(findTransportSection(W477_2569_SCHEDULE, { lorryCount: 10, hasTrailer: true, grossTons: 48 })).toBeNull();
    // NaN/Infinity ไม่ใช่คำตอบที่ใช้ได้ (NaN > x เป็น false — ต้องไม่ปล่อยผ่าน)
    expect(findTransportSection(W477_2569_SCHEDULE, { lorryCount: 6, hasTrailer: false, grossTons: NaN })).toBeNull();
    expect(findTransportSection(W477_2569_SCHEDULE, { lorryCount: 6, hasTrailer: false, grossTons: Infinity })).toBeNull();
    expect(findTransportBand(s1, 2500)).toBe(band(s1, 2500));
    expect(findTransportBand(s1, 2599)).toBe(band(s1, 2500));
    expect(findTransportBand(s1, 2600)).toBe(band(s1, 2600));
    expect(findTransportBand(s1, 2499)).toBeNull();
    expect(findTransportBand(s1, 7000)).toBeNull();
  });

  it("คิดค่าขนส่งในตาราง (1–200 กม.) และแบบ กม.ละ (201–1000 กม.) — เกิน 1000 คืน null", () => {
    const b = band(s1, 2500);
    expect(transportChargeAt(W477_2569_SCHEDULE, b, 1)).toEqual({
      basis: "table",
      perTonSatang: 1350,
      perM3Satang: 1889,
      perTonRateSatang: 1350,
      perM3RateSatang: 1889,
    });
    expect(transportChargeAt(W477_2569_SCHEDULE, b, 200)?.perTonSatang).toBe(61185);
    // หมายเหตุข้อ 1/2: ระยะ 201–1000 กม. = ระยะทาง × อัตรา กม.ละ
    expect(transportChargeAt(W477_2569_SCHEDULE, b, 201)).toEqual({
      basis: "per-km",
      perTonSatang: 201 * 306,
      perM3Satang: 201 * 428,
      perTonRateSatang: 306,
      perM3RateSatang: 428,
    });
    expect(transportChargeAt(W477_2569_SCHEDULE, b, 500)?.perTonSatang).toBe(500 * 306);
    expect(transportChargeAt(W477_2569_SCHEDULE, b, 1000)?.perM3Satang).toBe(1000 * 428);
    expect(transportChargeAt(W477_2569_SCHEDULE, b, 1001)).toBeNull();
    expect(transportChargeAt(W477_2569_SCHEDULE, b, 0)).toBeNull();
    // ระยะทศนิยม: ห้ามปัดเศษเงียบ ๆ — อัตราเป็นสตางค์ ผลคูณจะไม่เป็นจำนวนเต็ม จึงคืน null
    expect(transportChargeAt(W477_2569_SCHEDULE, b, 12.5)).toBeNull();
    expect(transportChargeAt(W477_2569_SCHEDULE, b, 201.7)).toBeNull();
    expect(transportChargeAt(W477_2569_SCHEDULE, b, 250.5)).toBeNull();
  });
});

describe("ว 477 — import/export", () => {
  const payload = () => JSON.parse(JSON.stringify(getW477Ruleset())) as Record<string, unknown>;

  it("นำเข้าไฟล์ที่ export จาก getW477Ruleset() ได้ checksum เดิม", async () => {
    const rs = getW477Ruleset();
    const { rs: imported, note } = await prepareImport(JSON.stringify(rs));
    expect(imported.checksum).toBe(rs.checksum);
    expect(imported.transportScheduleChecksum).toBe(rs.transportScheduleChecksum);
    expect(imported.transportSchedule?.sections).toHaveLength(3);
    expect(note).toContain("transportSchedule");
  });

  it("ปฏิเสธเมื่อราคาถูกแก้ภายหลัง (checksum ไม่ตรง)", async () => {
    const raw = payload();
    const schedule = raw.transportSchedule as { sections: { bands: { perTonSatang: number[] }[] }[] };
    // แก้ค่าสุดท้าย (ไม่กระทบเงื่อนไขราคาไม่ลดลงตามระยะ) → ต้องไปติดที่ checksum
    schedule.sections[0].bands[0].perTonSatang[199] += 1;
    await expect(prepareImport(JSON.stringify(raw))).rejects.toThrow(/transportScheduleChecksum|checksum ไม่ตรง/);
  });

  it("ปฏิเสธโครงสร้างที่ผิด (หน่วยเงิน/ช่วงน้ำมัน/ความยาว/เงื่อนไข/ที่มา/ราคาลดลง)", async () => {
    const badUnit = payload();
    (badUnit.transportSchedule as Record<string, unknown>).unit = "baht";
    await expect(prepareImport(JSON.stringify(badUnit))).rejects.toThrow(/unit ต้องเป็น "satang"/);

    const gap = payload();
    const gs = gap.transportSchedule as {
      sections: { bands: { fuelMinSatang: number; fuelMaxSatang: number; avgFuelSatang: number }[] }[];
    };
    gs.sections[0].bands[5].fuelMinSatang += 100;
    gs.sections[0].bands[5].fuelMaxSatang += 100;
    gs.sections[0].bands[5].avgFuelSatang += 100;
    await expect(prepareImport(JSON.stringify(gap))).rejects.toThrow(/ช่วงราคาน้ำมันไม่ต่อเนื่อง/);

    const short = payload();
    const ss = short.transportSchedule as { sections: { bands: { perM3Satang: number[] }[] }[] };
    ss.sections[0].bands[0].perM3Satang.pop();
    await expect(prepareImport(JSON.stringify(short))).rejects.toThrow(/perTonSatang กับ perM3Satang/);

    const tail = payload();
    const ts = tail.transportSchedule as { sections: { bands: { farMinKm: number }[] }[] };
    ts.sections[0].bands[0].farMinKm = 300;
    await expect(prepareImport(JSON.stringify(tail))).rejects.toThrow(/farMinKm/);

    // B3: เงื่อนไขการใช้ตาราง/ฐานราคาน้ำมันต้องมาพร้อมข้อมูล
    for (const [key, bad] of [
      ["conditions", []],
      ["fuelPriceBasis", ""],
    ] as const) {
      const raw = payload();
      (raw.transportSchedule as Record<string, unknown>)[key] = bad;
      await expect(prepareImport(JSON.stringify(raw))).rejects.toThrow(new RegExp(key));
    }

    // B6: titlePrinted ว่าง / sourcePages สลับลำดับ / ราคาลดลงตามระยะ ต้องถูกปฏิเสธ
    const noTitle = payload();
    (noTitle.transportSchedule as { sections: { titlePrinted: string }[] }).sections[0].titlePrinted = "  ";
    await expect(prepareImport(JSON.stringify(noTitle))).rejects.toThrow(/titlePrinted/);

    const swapped = payload();
    (swapped.transportSchedule as { sections: { bands: { sourcePages: [number, number] }[] }[] }).sections[0].bands[0].sourcePages = [10, 9];
    await expect(prepareImport(JSON.stringify(swapped))).rejects.toThrow(/sourcePages ต้องเรียง/);

    const drop = payload();
    const db = (drop.transportSchedule as { sections: { bands: { perTonSatang: number[] }[] }[] }).sections[0].bands[0];
    db.perTonSatang[1] = db.perTonSatang[0] - 1;
    // ข้อความต้องบอกระยะจริง (distanceStartKm + index) ไม่ใช่ index
    await expect(prepareImport(JSON.stringify(drop))).rejects.toThrow(/perTonSatang ลดลง.*ระยะ 2 กม\./);
  });

  it("ตารางที่นำเข้าถูกตรึงแบบลึก — แก้ไม่ได้หลังตรวจ checksum", async () => {
    const { rs } = await prepareImport(JSON.stringify(payload()));
    expect(rs.transportSchedule).toBeDefined();
    expect(Object.isFrozen(rs.transportSchedule)).toBe(true);
    const schedule = rs.transportSchedule!;
    expect(Object.isFrozen(schedule.sections[0])).toBe(true);
    expect(Object.isFrozen(schedule.sections[0].bands[0].perTonSatang)).toBe(true);
    expect(() => {
      (schedule.sections[0].bands[0].perTonSatang as number[])[0] = 1;
    }).toThrow();
    expect(schedule.sections[0].bands[0].perTonSatang[0]).not.toBe(1);
  });

  it("sections = [] ถือว่าไม่ระบุตาราง — นำเข้าได้และตัดทิ้ง (ไม่ hard-reject)", async () => {
    const minimal = {
      name: "ชุดกฎที่ไม่มีตารางขนส่ง",
      sourceDoc: "ทดสอบ",
      effectiveFrom: "2026-01-01",
      transportSchedule: {
        distanceStartKm: 1,
        sections: [],
        conditions: [],
        fuelPriceBasis: "",
        notices: [],
        unit: "satang",
      },
    };
    const { rs, note } = await prepareImport(JSON.stringify(minimal));
    expect(rs.transportSchedule).toBeUndefined();
    expect(rs.transportScheduleChecksum).toBeUndefined();
    expect(note).toContain("sections = []");
  });

  it("ปฏิเสธเมื่อระบุ transportScheduleChecksum แต่ตัดตารางออก", async () => {
    const raw = payload();
    delete raw.transportSchedule;
    await expect(prepareImport(JSON.stringify(raw))).rejects.toThrow(/transportScheduleChecksum/);
  });
});
