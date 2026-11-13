// ทดสอบ "ชุดข้อมูลจริง" บัญชีค่าแรงงาน/ดำเนินการสำหรับถอดแบบคำนวณราคากลางงานก่อสร้าง
// (หนังสือกรมบัญชีกลาง ที่ กค 0433.2/ว 480, ลง 26 มิ.ย. 2569 — 45 หน้า)
// ⚠️ แหล่ง PDF (Yotathai mirror) ไม่ใช่ทางการ — ก่อนใช้จริงต้องยืนยันกับราชกิจจานุเบกษา/เล่มจริง
// Golden ทุกตัวเลขอ้างจาก geometry ของ PDF ต้นฉบับ (mupdf) ที่ถอดทีละหน้า ไม่ได้เดาจากความจำ
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getW480Ruleset,
  verifyW480Checksums,
  W480_2569_ENTRIES,
  W480_2569_ENTRY_CHECKSUMS,
  W480_2569_LABOR,
  W480_2569_NOTICES,
  W480_2569_PDF_SHA256,
  W480_2569_QUALITY,
  W480_2569_RULESET_CHECKSUM,
  W480_2569_SCHEDULE,
  W480_2569_SET_CHECKSUM,
  W480_2569_SOURCE_URL,
  W480_2569_STATS,
} from "./ruleset-w480-2569";
import { prepareImport } from "./ruleset-import";
import { rulesetChecksum } from "./ruleset";
import type { WageEntry } from "./ruleset";

// helper — throw ถ้าไม่พบรายการ (จะรู้ทันถ้า dataset ขาดรายการ golden)
function findEntry(no: string): WageEntry {
  const e = W480_2569_ENTRIES.find((x) => x.no === no);
  if (!e) throw new Error(`ไม่พบรายการ ${no} ใน dataset ว 480`);
  return e;
}

describe("ว 480 — checksum + โครงสร้างชุดข้อมูลจริง", () => {
  it("checksum รายรายการ + ชุดรวม ผ่านหมด", async () => {
    const bad = await verifyW480Checksums();
    expect(bad).toEqual([]);
  });

  it("checksum มีรูปแบบถูกต้อง (FNV-1a hex 16 ตัว / sha256 hex 64 ตัว)", () => {
    expect(W480_2569_SET_CHECKSUM).toMatch(/^[0-9a-f]{16}$/);
    expect(W480_2569_RULESET_CHECKSUM).toMatch(/^[0-9a-f]{16}$/);
    expect(W480_2569_PDF_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("sha256 ที่บันทึกไว้ตรงกับไฟล์ w480.pdf จริงใน repo (ไม่ใช่ค่าเดา)", () => {
    const pdf = readFileSync(resolve(process.cwd(), "docs/reg-2569/w480.pdf"));
    const actual = createHash("sha256").update(pdf).digest("hex");
    expect(actual).toBe(W480_2569_PDF_SHA256);
  });

  it("ไฟล์ generated ผ่านการถอดแบบไม่มี issues (คุณภาพการถอด) + frozen กันการ mutate", () => {
    expect(W480_2569_QUALITY.issues).toBe(0);
    expect(Object.isFrozen(W480_2569_SCHEDULE)).toBe(true);
    expect(Object.isFrozen(W480_2569_SCHEDULE.entries)).toBe(true);
    expect(Object.isFrozen(W480_2569_SCHEDULE.entries[0])).toBe(true);
    expect(Object.isFrozen(W480_2569_SCHEDULE.notices)).toBe(true);
  });

  it("ทุกรายการมี checksum อ้างถึง (keyed ด้วย no) และ no ไม่ซ้ำ", () => {
    const nos = W480_2569_ENTRIES.map((e) => e.no);
    expect(new Set(nos).size).toBe(nos.length);
    for (const e of W480_2569_ENTRIES) {
      expect(W480_2569_ENTRY_CHECKSUMS[e.no], `entry ${e.no}`).toBeDefined();
    }
  });

  it("ลำดับรายการครอบคลุมกลุ่มใหญ่ 1–5 และสถิติไฟล์ตรงกับข้อมูลจริง (ไม่ hardcode)", () => {
    expect(Object.keys(W480_2569_STATS.byGroup).sort()).toEqual(["1", "2", "3", "4", "5"]);
    // นับใหม่จาก ENTRIES แล้วเทียบ stats ที่ไฟล์ generated พิมพ์ไว้ — กันไฟล์ถูกแก้ให้ stats คลาดเคลื่อน
    const byGroup: Record<string, number> = {};
    for (const e of W480_2569_ENTRIES) {
      const g = e.no.split(".")[0];
      byGroup[g] = (byGroup[g] ?? 0) + 1;
    }
    expect(W480_2569_STATS.byGroup).toEqual(byGroup);
    let tiers = 0;
    let bullets = 0;
    const countBullets = (vs: WageEntry["variants"]) => {
      if (!vs) return;
      for (const v of vs) {
        if (v.prices.length > 0) bullets += 1;
        countBullets(v.children);
      }
    };
    for (const e of W480_2569_ENTRIES) {
      tiers += e.prices.length;
      countBullets(e.variants);
    }
    expect(W480_2569_STATS.entries).toBe(W480_2569_ENTRIES.length);
    expect(W480_2569_STATS.tierRows).toBe(tiers);
    expect(W480_2569_STATS.bulletRows).toBe(bullets);
    expect(W480_2569_STATS.entries).toBeGreaterThan(0);
  });
});

describe("ว 480 — golden แถวราคา (tier) ตามตัวประกาศ", () => {
  it("1.1 ค่าตอกเสาเข็มสั้น: ศก.4\" = 95/97/133, ศก.5\" = 112/114/159, ศก.6\" = 132/135/183", () => {
    const e = findEntry("1.1");
    expect(e.name).toBe("ค่าตอกเสาเข็มสั้น (ยาวไม่เกิน 6.00 ม.)");
    expect(e.level).toBe(2);
    expect(e.prices.map((p) => p.price)).toEqual([95, 97, 133, 112, 114, 159, 132, 135, 183]);
    // tier แรกของแต่ละขนาดเป็นแถวราคาที่มีชื่อ
    expect(e.prices[0].name).toBe('เสาเข็ม ขนาด ศก. 4" x 4.00 ม.');
    expect(e.prices[3].name).toBe('เสาเข็ม ขนาด ศก. 5" x 5.00 ม.');
    expect(e.prices[6].name).toBe('เสาเข็ม ขนาด ศก. 6" x 6.00 ม.');
    // เงื่อนไขจำนวนงาน (คอลัมน์หมายเหตุของแถวราคา)
    expect(e.prices[0].note).toBe("จำนวน 200 ต้นขึ้นไป");
    expect(e.prices[1].note).toBe("จำนวน 100 - 200 ต้น");
    expect(e.prices[2].note).toBe("จำนวน ตั้งแต่ 50 ต้น และไม่เกิน 100 ต้น");
    expect(e.prices.every((p) => p.unit === "ต้น")).toBe(true);
  });

  it("1.2.1.1 เสาเข็ม 0.18x0.18x9.00 ม. tiers 404/431/562 + ชื่อต่อบรรทัด (วงเล็บ)", () => {
    const e = findEntry("1.2.1.1");
    // ตัวประกาศตัดชื่อเป็น 2 บรรทัด (cell รวมแนวตั้ง) — ต้องรวมเป็นชื่อเดียว ไม่ใช่ชื่อของแถวราคาแถวกลาง
    expect(e.name).toBe("เสาเข็ม ขนาด 0.18 x 0.18 x 9.00 ม. (เสาเข็ม คอร. รูปตัวไอ, รูปสี่เหลี่ยมตัน)");
    expect(e.level).toBe(4);
    expect(e.prices.map((p) => p.price)).toEqual([404, 431, 562]);
    expect(e.prices.every((p) => p.name === undefined)).toBe(true);
  });

  it("1.2.1.10 ลำดับ+ชื่อรวมเดียวกัน + ราคามี comma (2,691 → 2691)", () => {
    const e = findEntry("1.2.1.10");
    expect(e.name).toBe("เสาเข็ม ขนาด ศก. 0.40 x 21.00 ม. (เสาเข็ม คอร. รูปกลมกลวง)");
    expect(e.prices.map((p) => p.price)).toEqual([2691, 3008, 3326]);
    expect(e.prices[0].note).toBe("จำนวน 100 ต้นขึ้นไป");
  });

  it("anomaly ที่ตัวประกาศพิมพ์ \"2.68\" → canonical 2.6.8 พร้อม noPrinted + คำอธิบาย", () => {
    const e = findEntry("2.6.8");
    expect(e.noPrinted).toBe("2.68");
    expect(e.anomaly).toContain("2.68");
  });
});

describe("ว 480 — golden กลุ่ม 5 (ระบบปรับอากาศ)", () => {
  it("5.8 ฉนวนท่อลม: Fiberglass thk. 1\" Density 1.5 lb/ft3 = 15 บาท/ชุด + โน้ตหัวรายการ", () => {
    const e = findEntry("5.8");
    expect(e.name).toBe("ฉนวนท่อลม");
    expect(e.notes).toContain("ค่าแรง / 1 ตารางฟุต");
    expect(e.variants).toHaveLength(1);
    expect(e.variants![0].name).toBe('Fiberglass thk. 1" , Density 1.5 lb/ft3');
    expect(e.variants![0].prices).toEqual([{ price: 15, unit: "ชุด" }]);
  });

  it("5.9 ท่อลมอ่อน Flexible Air Duct: dia 4\"–12\" = 26/31/31/36/41/46/51/62 บาท/เมตร", () => {
    const e = findEntry("5.9");
    expect(e.name).toBe("ท่อลมอ่อน Flexible Air Duct");
    expect(e.variants!.map((v) => v.name)).toEqual([
      'Size dia 4"', 'Size dia 5"', 'Size dia 6"', 'Size dia 7"',
      'Size dia 8"', 'Size dia 9"', 'Size dia 10"', 'Size dia 12"',
    ]);
    expect(e.variants!.map((v) => v.prices[0].price)).toEqual([26, 31, 31, 36, 41, 46, 51, 62]);
    expect(e.variants!.every((v) => v.prices[0].unit === "เมตร")).toBe(true);
  });

  it("5.10 หน้ากากลม: sub-header LSD → children LSD-1..4 = 138/267/374/492 + โน้ต \"ค่าแรง / 1 เมตร\"", () => {
    const e = findEntry("5.10");
    expect(e.name).toBe("หน้ากากลม");
    const lsd = e.variants!.find((v) => v.name === "Linear Slot Diffuser W/Plenum");
    expect(lsd, "มี sub-header Linear Slot Diffuser W/Plenum").toBeDefined();
    expect(lsd!.note).toBe("ค่าแรง / 1 เมตร");
    expect(lsd!.children!.map((c) => c.name)).toEqual(["LSD-1", "LSD-2", "LSD-3", "LSD-4"]);
    expect(lsd!.children!.map((c) => c.prices[0].price)).toEqual([138, 267, 374, 492]);
    expect(lsd!.children!.every((c) => c.prices[0].unit === "เมตร")).toBe(true);
  });

  it("5.10 sub-header Exhaust Air Grille: ลูกเป็น bullets ราคา (ชื่อ Size ...)", () => {
    const e = findEntry("5.10");
    const g = e.variants!.find((v) => v.name === "Exhaust Air Grille");
    expect(g, "มี sub-header Exhaust Air Grille").toBeDefined();
    expect(g!.children!.length).toBeGreaterThan(0);
    expect(g!.children![0].name).toBe('Size 6" x 6"');
    expect(g!.children![0].prices[0].price).toBe(128);
  });
});

describe("ว 480 — หมายเหตุ 3 ข้อท้ายบัญชี + labor 30–37%", () => {
  it("notices มี 3 ข้อ ครบข้อความต่อเนื่องตามบัญชี", () => {
    expect(W480_2569_NOTICES).toHaveLength(3);
    expect(W480_2569_NOTICES[0]).toContain("เหมารวมร้อยละ 30 - 37");
    expect(W480_2569_NOTICES[0]).toContain("ของยอดค่าวัสดุมาเป็นค่าแรงงาน");
    expect(W480_2569_NOTICES[0]).toContain("และหรือความขาดแคลนของแรงงานสำหรับรายการงานก่อสร้างนั้น");
    expect(W480_2569_NOTICES[1]).toContain("และราคาค่าแรงงานในท้องถิ่นนั้น");
    expect(W480_2569_NOTICES[2]).toContain("ในส่วนที่เกี่ยวข้องกับบัญชีค่าแรงงานฯ");
  });

  it("labor 30–37% ดึงจากหมายเหตุข้อ 1 ของบัญชี (ไม่ hardcode — เทสต์ถอดจากข้อความ)", () => {
    const m = /ร้อยละ\s*(\d+)\s*[-–—]\s*(\d+)/.exec(W480_2569_NOTICES[0]);
    expect(m, "หมายเหตุข้อ 1 ต้องมีช่วงร้อยละ N - M").not.toBeNull();
    expect(W480_2569_LABOR).toEqual({ minPct: Number(m![1]), maxPct: Number(m![2]) });
    expect(getW480Ruleset().labor).toEqual(W480_2569_LABOR);
  });

  it("getW480Ruleset(): labor 30–37% อ้างข้อ 1 ของบัญชี + ไม่มี Factor F + wageSchedule ครบ", async () => {
    const rs = getW480Ruleset();
    expect(rs.id).toBe("reg2569-wage-w480");
    expect(rs.effectiveFrom).toBe("2026-06-26");
    expect(rs.labor).toEqual({ minPct: 30, maxPct: 37 });
    expect(rs.factorF).toBeUndefined();
    expect(rs.factorFTables).toBeUndefined();
    expect(rs.wageSchedule).toBeDefined();
    expect(rs.wageSchedule!.entries).toBe(W480_2569_ENTRIES);
    expect(rs.wageSchedule!.notices).toBe(W480_2569_NOTICES);
    // ที่มาตรงตามระบบ: mirror + ยังไม่ยืนยันกับราชกิจจานุเบกษา (ใช้เตือนบน UI/เอกสารพิมพ์)
    expect(rs.provenance).toEqual({
      sourceKind: "mirror-unverified",
      verifiedAgainstGazette: false,
      retrievedFrom: W480_2569_SOURCE_URL,
    });
    expect(W480_2569_SOURCE_URL).toMatch(/^https:\/\//);
    expect(rs.sourceUrl).toBe(W480_2569_SOURCE_URL);
    // checksum ต้องคำนวณจากเนื้อหา (รวม wageSchedule) — ตรวจซ้ำด้วย rulesetChecksum
    expect(rs.checksum).toMatch(/^[0-9a-f]{16}$/);
    expect(await rulesetChecksum(rs)).toBe(rs.checksum);
  });

  it("prepareImport: รอบ export/import ของ ว 480 — checksum เท่าเดิม และ wageSchedule รอด", async () => {
    const rs = getW480Ruleset();
    const { rs: imported } = await prepareImport(JSON.stringify(rs));
    expect(imported.wageSchedule).toBeDefined();
    expect(imported.checksum).toBe(rs.checksum);
    expect(imported.provenance).toEqual(rs.provenance);
    // แก้เนื้อหาภายหลัง → ตรวจพบ (แตะ entry แรกที่มีแถวราคาจริง — entry แรกเป็นหัวกลุ่ม)
    const tampered = JSON.parse(JSON.stringify(rs)) as Record<string, unknown>;
    const sched = tampered.wageSchedule as { entries: Array<{ prices: Array<{ price: number }> }> };
    const target = sched.entries.find((e) => e.prices.length > 0)!;
    target.prices[0].price += 1;
    await expect(prepareImport(JSON.stringify(tampered))).rejects.toThrow(/checksum/i);
  });

  it("prepareImport: wageSchedule รูปแบบผิด (level นอกช่วง) → ปฏิเสธชัดเจน (ข้อมูลสมมุติเพื่อทดสอบ)", async () => {
    const rs = getW480Ruleset();
    const bad = JSON.parse(JSON.stringify(rs)) as Record<string, unknown>;
    const sched = bad.wageSchedule as { entries: Array<Record<string, unknown>> };
    sched.entries[0] = { no: "9.9", level: 9, name: "ข้อมูลสมมุติเพื่อทดสอบ", notes: [], prices: [] };
    await expect(prepareImport(JSON.stringify(bad))).rejects.toThrow(/level/);
  });
});
