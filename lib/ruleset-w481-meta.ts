// Metadata "ที่มา" ของชุดกฎ ว 481 — เติมที่เส้นทางติดตั้งเท่านั้น
// `lib/ruleset-w481-2569.ts` เป็นไฟล์ GENERATED (ห้ามแก้มือ) และไม่มี provenance/คำเตือน mirror
// helper นี้ไม่แตะ checksum/ตาราง/effectiveFrom — เติมเฉพาะ metadata ที่ไม่อยู่ใน rulesetChecksum

import type { Ruleset } from "./ruleset";

export const W481_2569_ID = "reg2569-factorF-6pct-w481";

export const W481_2569_MIRROR_NOTICE =
  "ที่มา: สำเนา PDF จาก Yotathai mirror — ยังไม่ยืนยันกับราชกิจจานุเบกษา/เล่มประกาศจริง (provenance: mirror-unverified) ห้ามใช้คำนวณส่งหน่วยงานก่อนยืนยัน";

// เติม provenance + notice แบบ idempotent; ชุดกฎ id อื่นไม่ถูกแก้ (คืน reference เดิม)
export function withW481Provenance(rs: Ruleset): Ruleset {
  if (rs.id !== W481_2569_ID) return rs;

  // ไม่ทับ provenance ที่มีอยู่แล้ว (เช่น ไฟล์ที่ human ยืนยันกับราชกิจจานุเบกษาแล้ว)
  const provenance = rs.provenance ?? {
    sourceKind: "mirror-unverified" as const,
    verifiedAgainstGazette: false,
    retrievedFrom: rs.sourceUrl,
  };
  const notices = rs.notices ?? [];
  return {
    ...rs,
    provenance,
    notices: notices.includes(W481_2569_MIRROR_NOTICE) ? notices : [...notices, W481_2569_MIRROR_NOTICE],
  };
}
