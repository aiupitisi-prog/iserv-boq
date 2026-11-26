// ทดสอบ metadata ที่มา ว 481 — helper ต้องเติม provenance/notice โดยไม่แตะตัวเลขหรือ checksum
// (ไฟล์ lib/ruleset-w481-2569.ts เป็น GENERATED — เทสต์นี้ไม่แก้ไฟล์นั้น)
import { describe, expect, it } from "vitest";
import type { Ruleset } from "./ruleset";
import { prepareImport } from "./ruleset-import";
import { getW481Ruleset, W481_2569_SOURCE_URL } from "./ruleset-w481-2569";
import { W481_2569_ID, W481_2569_MIRROR_NOTICE, withW481Provenance } from "./ruleset-w481-meta";

describe("withW481Provenance — เติมที่มาของชุดกฎ ว 481", () => {
  it("ชุดจริงยังไม่มี provenance/notice — helper เติม mirror-unverified + notice", () => {
    const rs = getW481Ruleset();
    expect(rs.id).toBe(W481_2569_ID);
    expect(rs.provenance).toBeUndefined();
    expect(rs.notices ?? []).not.toContain(W481_2569_MIRROR_NOTICE);

    const out = withW481Provenance(rs);
    expect(out.provenance).toEqual({
      sourceKind: "mirror-unverified",
      verifiedAgainstGazette: false,
      retrievedFrom: W481_2569_SOURCE_URL,
    });
    expect(out.notices).toContain(W481_2569_MIRROR_NOTICE);
    expect(out.notices).toHaveLength((rs.notices?.length ?? 0) + 1);
  });

  it("idempotent — เรียกซ้ำไม่เพิ่ม notice ซ้ำ และไม่ทับ provenance เดิม", () => {
    const once = withW481Provenance(getW481Ruleset());
    const twice = withW481Provenance(once);
    expect(twice.provenance).toEqual(once.provenance);
    expect(twice.notices).toEqual(once.notices);
    expect(twice.notices?.filter((n) => n === W481_2569_MIRROR_NOTICE)).toHaveLength(1);
  });

  it("ไม่เปลี่ยนข้อมูลกฎหมาย: id/name/sourceDoc/effectiveFrom/checksum/factorFTables/createdAt", () => {
    const rs = getW481Ruleset();
    const out = withW481Provenance(rs);
    expect(out.id).toBe(rs.id);
    expect(out.name).toBe(rs.name);
    expect(out.sourceDoc).toBe(rs.sourceDoc);
    expect(out.sourceUrl).toBe(rs.sourceUrl);
    expect(out.effectiveFrom).toBe(rs.effectiveFrom);
    expect(out.checksum).toBe(rs.checksum);
    expect(out.setChecksum).toBe(rs.setChecksum);
    expect(out.factorFTables).toBe(rs.factorFTables); // reference เดิม ไม่ clone/แก้ตาราง
    expect(out.createdAt).toBe(rs.createdAt);
  });

  it("ชุดกฎ id อื่นไม่ถูกแก้ (คืน reference เดิม)", () => {
    const other: Ruleset = { ...getW481Ruleset(), id: "other-ruleset" };
    expect(withW481Provenance(other)).toBe(other);
  });

  it("ผ่าน prepareImport (เส้นทางติดตั้งจริง) — provenance/notice ยังอยู่หลัง import", async () => {
    const { checksum: _setChecksum, ...base } = withW481Provenance(getW481Ruleset());
    const { rs } = await prepareImport(JSON.stringify(base));
    expect(rs.id).toBe(W481_2569_ID);
    expect(rs.provenance).toEqual({
      sourceKind: "mirror-unverified",
      verifiedAgainstGazette: false,
      retrievedFrom: W481_2569_SOURCE_URL,
    });
    expect(rs.notices).toContain(W481_2569_MIRROR_NOTICE);
    expect(rs.notices?.filter((n) => n === W481_2569_MIRROR_NOTICE)).toHaveLength(1);
  });
});
