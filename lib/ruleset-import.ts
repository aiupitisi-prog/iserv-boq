// ตรวจ + เตรียม ruleset จาก JSON ที่ผู้ใช้นำเข้า (pure — ไม่แตะ DOM/storage จึงทดสอบด้วย Vitest ได้)
//
// ⚠️ กฎเหล็ก (skill thai-govt-base-price-rules):
// - ระบบตรวจ "โครงสร้าง/ความสมเหตุสมผลของตาราง" เท่านั้น — ไม่ตรวจว่าตัวเลขถูกตามกฎหมาย
//   (ผู้นำเข้าต้องอ้างเอกสารต้นทางเอง — sourceDoc บังคับ)
// - checksum ผูกกับเนื้อหาตาราง (รวมชุดตาราง factorFTables ของ ว 481) — แก้ไฟล์ภายหลัง = ตรวจพบ
import type { FactorFTable, Ruleset, WorkTypeCode } from "./ruleset";
import { computeChecksum, rulesetChecksum, validateFactorFTable } from "./ruleset";

const WORK_TYPES: readonly WorkTypeCode[] = ["building", "road", "bridge", "irrigation"];

// ตรวจพารามิเตอร์หัวตาราง (ตัวเลขครบ) — where เช่น "factorF" หรือ "factorFTables[3]"
function headerError(t: FactorFTable, where: string): string | null {
  for (const k of ["advancePct", "retentionPct", "interestPct", "vatPct"] as const) {
    if (typeof t[k] !== "number") return `${where}.${k} ต้องเป็นตัวเลข`;
  }
  return null;
}

// คืน (ruleset พร้อม checksum ที่คำนวณเอง, คำเตือน) หรือ throw Error(ข้อความไทย)
export async function prepareImport(raw: string): Promise<{ rs: Ruleset; note: string }> {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("JSON ไม่ถูกต้อง — ตรวจรูปแบบไฟล์อีกครั้ง");
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error("โครงสร้างไม่ถูกต้อง — ต้องเป็น object ของชุดกฎ");
  const name = String(data.name ?? "").trim();
  const sourceDoc = String(data.sourceDoc ?? "").trim();
  const effectiveFrom = String(data.effectiveFrom ?? "").trim();
  if (!name) throw new Error("ต้องมี name (ชื่อชุดกฎ)");
  if (!sourceDoc) throw new Error("ต้องมี sourceDoc (เอกสารต้นทางทางการ) — ห้ามนำเข้าชุดกฎไม่ระบุที่มา");
  if (!effectiveFrom) throw new Error("ต้องมี effectiveFrom (วันที่เริ่มมีผล)");

  // — ตารางเดี่ยว (factorF) — รูปแบบเดิมของเฟส 2
  const factorF = data.factorF as FactorFTable | undefined;
  if (factorF !== undefined) {
    if (typeof factorF !== "object" || factorF === null || !Array.isArray(factorF.rows)) throw new Error("factorF ไม่ถูกต้อง — ต้องมี advancePct/retentionPct/interestPct/vatPct และ rows");
    const hdr = headerError(factorF, "factorF");
    if (hdr) throw new Error(hdr);
    const err = validateFactorFTable(factorF);
    if (err) throw new Error(`ตาราง Factor F ไม่ผ่านการตรวจ: ${err}`);
  }

  // — ชุดตารางหลายตาราง (factorFTables) — รูปแบบประกาศ ว 481 (48 ตาราง)
  // ว่าง (array ว่าง) = ถือว่าไม่ระบุชุด — เครื่องยนต์ถือว่าไม่มีชุดตารางเช่นกัน ตัดทิ้งเพื่อให้ checksum เทียบเท่าแบบไม่มีชุด
  const rawTables = data.factorFTables;
  let factorFTables: FactorFTable[] | undefined;
  let setNote = "";
  // setChecksum = checksum เฉพาะ array ของชุดตาราง (กันการตัด factorFTables ทิ้งแล้ว import ใหม่แบบเงียบ ๆ —
  // ชุดกฎแบบมีทั้ง factorF เดี่ยวและชุดตาราง ถ้าตัดชุดตารางออก เครื่องยนต์จะ fallback ไปตารางเดี่ยวซึ่งอาจเป็นประกาศต่างฉบับ)
  const fileSetChecksum = typeof data.setChecksum === "string" && data.setChecksum ? data.setChecksum : undefined;
  if (rawTables !== undefined && rawTables !== null) {
    if (!Array.isArray(rawTables)) throw new Error("factorFTables ไม่ถูกต้อง — ต้องเป็น array ของตาราง Factor F");
    if (rawTables.length > 0) {
      factorFTables = [];
      const seen = new Set<string>();
      for (let i = 0; i < rawTables.length; i++) {
        const where = `factorFTables[${i}]`;
        const t = rawTables[i] as FactorFTable;
        if (typeof t !== "object" || t === null || Array.isArray(t)) throw new Error(`${where} ไม่ถูกต้อง — ต้องเป็น object ของตาราง`);
        if (!WORK_TYPES.includes(t.workType as WorkTypeCode))
          throw new Error(`${where}.workType ต้องเป็นหนึ่งใน building | road | bridge | irrigation (ชุดตารางต้องระบุประเภทงาน เพื่อให้เครื่องยนต์เลือกตารางได้)`);
        const hdr = headerError(t, where);
        if (hdr) throw new Error(hdr);
        const err = validateFactorFTable(t);
        if (err) throw new Error(`ตาราง Factor F ลำดับ ${i} (${t.workType} ทดรองจ่าย ${t.advancePct}% · ประกันผลงาน ${t.retentionPct}%) ไม่ผ่านการตรวจ: ${err}`);
        const combo = `${t.workType}|${t.advancePct}|${t.retentionPct}`;
        if (seen.has(combo))
          throw new Error(`${where}: มีตารางซ้ำกัน (ประเภทงาน ${t.workType} · ทดรองจ่าย ${t.advancePct}% · ประกันผลงาน ${t.retentionPct}%) — ชุดตารางต้องไม่ซ้ำ ไม่งั้นเครื่องยนต์จะเลือกตารางไม่ชัดเจน`);
        seen.add(combo);
        factorFTables.push(t);
      }
      setNote = factorF === undefined
        ? `ไฟล์มีชุดตาราง Factor F ${factorFTables.length} ตาราง — เครื่องยนต์เลือกตารางตามเงื่อนไขสัญญา (ประเภทงาน × ทดรองจ่าย × ประกันผลงาน)`
        : `ไฟล์มีทั้ง factorF (ตารางเดี่ยว) และ factorFTables (ชุด ${factorFTables.length} ตาราง) — เครื่องยนต์จะใช้ชุดตารางเท่านั้น ไม่ fallback ไปตารางเดี่ยว`;
    }
  }

  for (const k of ["contingencyPct", "swcPct", "durableHandlingPct"] as const) {
    if (data[k] !== undefined && data[k] !== null && typeof data[k] !== "number") throw new Error(`${k} ต้องเป็นตัวเลข (ถ้ามี)`);
  }
  if (data.labor !== undefined && data.labor !== null) {
    const l = data.labor as { minPct?: unknown; maxPct?: unknown };
    if (typeof l.minPct !== "number" || typeof l.maxPct !== "number") throw new Error("labor ต้องเป็น { minPct, maxPct }");
  }

  // setChecksum ต้องตรวจก่อน checksum หลัก — ป้องกันไฟล์ที่อ้างว่ามีชุดตารางแต่ถูกตัดทิ้ง
  const notes: string[] = [];
  let setChecksum: string | undefined;
  if (fileSetChecksum) {
    if (!factorFTables || factorFTables.length === 0) {
      throw new Error("ไฟล์ระบุ setChecksum (checksum ของชุดตาราง Factor F) แต่ไม่พบ factorFTables — ไฟล์อาจถูกตัดหรือแก้ไข ห้ามนำเข้า");
    }
    const actual = await computeChecksum(factorFTables);
    if (actual !== fileSetChecksum) {
      throw new Error(
        `setChecksum ไม่ตรงกับชุดตาราง (ไฟล์: ${fileSetChecksum.slice(0, 8)}… / คำนวณใหม่: ${actual.slice(0, 8)}…) — ชุดตารางอาจถูกแก้ภายหลัง ห้ามนำเข้า`,
      );
    }
    setChecksum = fileSetChecksum;
  } else if (factorFTables && factorFTables.length > 0) {
    // ไฟล์มีชุดตารางแต่ไม่มี setChecksum → ระบบคำนวณและแนบให้ เพื่อให้การ export รอบถัดไปตรวจจับการตัดชุดตารางได้
    setChecksum = await computeChecksum(factorFTables);
    notes.push("ระบบคำนวณ setChecksum ของชุดตารางให้ใหม่ (ป้องกันการตัดชุดตารางออกจากไฟล์ภายหลัง)");
  }

  const draft = {
    factorF: factorF ?? null,
    factorFTables,
    labor: (data.labor as Ruleset["labor"]) ?? null,
    contingencyPct: (data.contingencyPct as number | undefined) ?? null,
    swcPct: (data.swcPct as number | undefined) ?? null,
    durableHandlingPct: (data.durableHandlingPct as number | undefined) ?? null,
  };
  const computed = await rulesetChecksum(draft);
  if (typeof data.checksum === "string" && data.checksum) {
    if (data.checksum !== computed) {
      throw new Error(
        `checksum ไม่ตรงกับเนื้อหาตาราง (ไฟล์: ${String(data.checksum).slice(0, 8)}… / คำนวณใหม่: ${computed.slice(0, 8)}…) — ไฟล์อาจถูกแก้หลังจากคำนวณ checksum หรือคำนวณด้วยรูปแบบ checksum ต่างกัน ห้ามนำเข้า`,
      );
    }
  } else {
    notes.push("ไฟล์ไม่มี checksum — ระบบคำนวณจากเนื้อหาให้ใหม่ (ควรตรวจตัวเลขกับเอกสารต้นทางก่อนใช้จริง)");
  }
  if (setNote) notes.push(setNote);

  const rs: Ruleset = {
    id: String(data.id ?? "").trim() || globalThis.crypto?.randomUUID?.() || `rs-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`,
    name,
    sourceDoc,
    sourceUrl: data.sourceUrl ? String(data.sourceUrl) : undefined,
    effectiveFrom,
    checksum: computed,
    factorF,
    factorFTables,
    setChecksum,
    labor: draft.labor ?? undefined,
    contingencyPct: draft.contingencyPct ?? undefined,
    swcPct: draft.swcPct ?? undefined,
    durableHandlingPct: draft.durableHandlingPct ?? undefined,
    notices: Array.isArray(data.notices) ? (data.notices as unknown[]).map(String) : undefined,
    supersededBy: typeof data.supersededBy === "string" && data.supersededBy ? data.supersededBy : undefined,
    createdAt: new Date().toISOString(),
  };
  return { rs, note: notes.join(" · ") };
}
