// ตรวจ + เตรียม ruleset จาก JSON ที่ผู้ใช้นำเข้า (pure — ไม่แตะ DOM/storage จึงทดสอบด้วย Vitest ได้)
//
// ⚠️ กฎเหล็ก (skill thai-govt-base-price-rules):
// - ระบบตรวจ "โครงสร้าง/ความสมเหตุสมผลของตาราง" เท่านั้น — ไม่ตรวจว่าตัวเลขถูกตามกฎหมาย
//   (ผู้นำเข้าต้องอ้างเอกสารต้นทางเอง — sourceDoc บังคับ)
// - checksum ผูกกับเนื้อหาตาราง (รวมชุดตาราง factorFTables ของ ว 481) — แก้ไฟล์ภายหลัง = ตรวจพบ
import type { FactorFTable, Ruleset, WageSchedule, WorkTypeCode } from "./ruleset";
import { computeChecksum, rulesetChecksum, validateFactorFTable } from "./ruleset";

const WORK_TYPES: readonly WorkTypeCode[] = ["building", "road", "bridge", "irrigation"];

// ตรวจโครงสร้างบัญชีค่าแรงงาน (ว 480) — โครงสร้างเท่านั้น ไม่ตรวจว่าค่าถูกตามกฎหมาย
// เข้มเท่ากับ parser (scripts/parse-w480.mjs): ลำดับรูปแบบ/ไม่ซ้ำ, ระดับตรงกับจำนวนช่วง, ราคาเป็นบาทเต็ม > 0
function wageScheduleError(s: WageSchedule, where = "wageSchedule"): string | null {
  if (typeof s !== "object" || s === null || Array.isArray(s)) return `${where} ไม่ถูกต้อง — ต้องเป็น object { entries, notices }`;
  if (!Array.isArray(s.entries)) return `${where}.entries ต้องเป็น array ของรายการ`;
  if (!Array.isArray(s.notices) || s.notices.some((n) => typeof n !== "string"))
    return `${where}.notices ต้องเป็น array ของข้อความ`;
  const seen = new Set<string>();
  for (let i = 0; i < s.entries.length; i++) {
    const e = s.entries[i] as WageSchedule["entries"][number];
    const w = `${where}.entries[${i}] (no=${String((e as { no?: unknown }).no)})`;
    if (typeof e !== "object" || e === null || Array.isArray(e)) return `${w} ไม่ถูกต้อง — ต้องเป็น object ของรายการ`;
    if (typeof e.no !== "string" || !/^\d+(?:\.\d+)*$/.test(e.no))
      return `${w}.no ต้องเป็นข้อความลำดับรูป "1" หรือ "1.2.3"`;
    if (seen.has(e.no)) return `${w}.no ซ้ำ (${e.no}) — ลำดับต้องไม่ซ้ำ`;
    seen.add(e.no);
    if (typeof e.name !== "string" || !e.name) return `${w}.name ต้องเป็นข้อความ`;
    if (![1, 2, 3, 4].includes(e.level)) return `${w}.level ต้องเป็น 1, 2, 3 หรือ 4`;
    if (e.level !== e.no.split(".").length)
      return `${w}.level (${e.level}) ไม่ตรงกับจำนวนช่วงของ no (${e.no} = ${e.no.split(".").length} ช่วง)`;
    if (!Array.isArray(e.notes) || e.notes.some((n) => typeof n !== "string")) return `${w}.notes ต้องเป็น array ของข้อความ`;
    if (!Array.isArray(e.prices)) return `${w}.prices ต้องเป็น array ของแถวราคา`;
    for (let j = 0; j < e.prices.length; j++) {
      const p = e.prices[j] as WageSchedule["entries"][number]["prices"][number];
      if (typeof p !== "object" || p === null || Array.isArray(p)) return `${w}.prices[${j}] ไม่ถูกต้อง — ต้องเป็น object ของแถวราคา`;
      const perr = priceRowError(p, `${w}.prices[${j}]`);
      if (perr) return perr;
    }
    const checkVariants = (vs: WageSchedule["entries"][number]["variants"], path: string): string | null => {
      if (vs === undefined || vs === null) return null;
      if (!Array.isArray(vs)) return `${path} ต้องเป็น array ของ variant`;
      for (let k = 0; k < vs.length; k++) {
        const v = vs[k] as NonNullable<WageSchedule["entries"][number]["variants"]>[number];
        if (typeof v !== "object" || v === null || Array.isArray(v)) return `${path}[${k}] ไม่ถูกต้อง — ต้องเป็น object ของ variant`;
        if (typeof v.name !== "string" || !v.name) return `${path}[${k}].name ต้องเป็นข้อความ`;
        if (!Array.isArray(v.prices)) return `${path}[${k}].prices ต้องเป็น array ของแถวราคา`;
        for (let j = 0; j < v.prices.length; j++) {
          const p = v.prices[j] as WageSchedule["entries"][number]["prices"][number];
          if (typeof p !== "object" || p === null || Array.isArray(p)) return `${path}[${k}].prices[${j}] ไม่ถูกต้อง`;
          const perr = priceRowError(p, `${path}[${k}].prices[${j}]`);
          if (perr) return perr;
        }
        const sub = checkVariants(v.children, `${path}[${k}].children`);
        if (sub) return sub;
      }
      return null;
    };
    const verr = checkVariants(e.variants, `${w}.variants`);
    if (verr) return verr;
  }
  return null;
}

// แถวราคาเดียว — ราคาต้องเป็นบาทเต็ม > 0 (ตัวประกาศไม่มีราคา 0) และฟิลด์ข้อความต้องเป็น string
function priceRowError(p: { price: number; unit?: string; name?: string; note?: string }, path: string): string | null {
  if (typeof p.price !== "number" || !Number.isFinite(p.price) || !Number.isInteger(p.price) || p.price <= 0)
    return `${path}.price ต้องเป็นจำนวนเต็มบาทที่มากกว่า 0 (ตัวประกาศพิมพ์เป็นบาทเต็ม)`;
  for (const k of ["unit", "name", "note"] as const) {
    if (p[k] !== undefined && typeof p[k] !== "string") return `${path}.${k} ต้องเป็นข้อความ (ถ้ามี)`;
  }
  return null;
}

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

  // — บัญชีค่าแรงงาน (wageSchedule) — รูปแบบบัญชีค่าแรงงานฯ ว 480 (ตรวจโครงสร้าง ไม่ตรวจค่ากฎหมาย)
  // ว่าง (entries array ว่าง) = ถือว่าไม่ระบุ — ตัดทิ้งเพื่อให้ checksum เทียบเท่าแบบไม่มีบัญชี
  let wageSchedule: WageSchedule | undefined;
  let wageNote = "";
  const fileWageChecksum = typeof data.wageScheduleChecksum === "string" && data.wageScheduleChecksum ? data.wageScheduleChecksum : undefined;
  if (data.wageSchedule !== undefined && data.wageSchedule !== null) {
    const s = data.wageSchedule as WageSchedule;
    const err = wageScheduleError(s);
    if (err) throw new Error(err);
    if (s.entries.length > 0) {
      wageSchedule = s;
      wageNote = `ไฟล์มีบัญชีค่าแรงงาน (wageSchedule) ${s.entries.length} รายการ + หมายเหตุ ${s.notices.length} ข้อ — ต้องยืนยันตัวเลขกับเอกสารต้นทางก่อนใช้คำนวณจริง`;
    }
  }
  if (fileWageChecksum && !wageSchedule) {
    throw new Error("ไฟล์ระบุ wageScheduleChecksum (checksum ของบัญชีค่าแรงงาน) แต่ไม่พบ wageSchedule — ไฟล์อาจถูกตัดหรือแก้ไข ห้ามนำเข้า");
  }

  for (const k of ["contingencyPct", "swcPct", "durableHandlingPct"] as const) {
    if (data[k] !== undefined && data[k] !== null && typeof data[k] !== "number") throw new Error(`${k} ต้องเป็นตัวเลข (ถ้ามี)`);
  }
  if (data.labor !== undefined && data.labor !== null) {
    const l = data.labor as { minPct?: unknown; maxPct?: unknown };
    if (typeof l.minPct !== "number" || typeof l.maxPct !== "number") throw new Error("labor ต้องเป็น { minPct, maxPct }");
  }

  // provenance — metadata ที่มา (ไม่รวมใน checksum) ใช้เตือนว่าไฟล์ยังไม่ยืนยันกับราชกิจจานุเบกษา
  let provenance: Ruleset["provenance"];
  if (data.provenance !== undefined && data.provenance !== null) {
    const p = data.provenance as Record<string, unknown>;
    if (typeof p !== "object" || Array.isArray(p)) throw new Error("provenance ต้องเป็น object");
    if (p.sourceKind !== "official" && p.sourceKind !== "mirror-unverified")
      throw new Error('provenance.sourceKind ต้องเป็น "official" หรือ "mirror-unverified"');
    provenance = { sourceKind: p.sourceKind };
    if (typeof p.verifiedAgainstGazette === "boolean") provenance.verifiedAgainstGazette = p.verifiedAgainstGazette;
    if (typeof p.retrievedFrom === "string") provenance.retrievedFrom = p.retrievedFrom;
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

  // wageScheduleChecksum — pattern เดียวกับ setChecksum แต่ผูกบัญชีค่าแรงงาน (ว 480)
  let wageScheduleChecksum: string | undefined;
  if (fileWageChecksum && wageSchedule) {
    const actual = await computeChecksum(wageSchedule);
    if (actual !== fileWageChecksum) {
      throw new Error(
        `wageScheduleChecksum ไม่ตรงกับบัญชีค่าแรงงาน (ไฟล์: ${fileWageChecksum.slice(0, 8)}… / คำนวณใหม่: ${actual.slice(0, 8)}…) — บัญชีค่าแรงงานอาจถูกแก้ภายหลัง ห้ามนำเข้า`,
      );
    }
    wageScheduleChecksum = fileWageChecksum;
  } else if (wageSchedule) {
    wageScheduleChecksum = await computeChecksum(wageSchedule);
    notes.push("ระบบคำนวณ wageScheduleChecksum ของบัญชีค่าแรงงานให้ใหม่ (ป้องกันการตัดบัญชีออกจากไฟล์ภายหลัง)");
  }

  const draft = {
    factorF: factorF ?? null,
    factorFTables,
    wageSchedule,
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
  if (wageNote) notes.push(wageNote);

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
    wageSchedule,
    wageScheduleChecksum,
    labor: draft.labor ?? undefined,
    contingencyPct: draft.contingencyPct ?? undefined,
    swcPct: draft.swcPct ?? undefined,
    durableHandlingPct: draft.durableHandlingPct ?? undefined,
    provenance,
    notices: Array.isArray(data.notices) ? (data.notices as unknown[]).map(String) : undefined,
    supersededBy: typeof data.supersededBy === "string" && data.supersededBy ? data.supersededBy : undefined,
    createdAt: new Date().toISOString(),
  };
  return { rs, note: notes.join(" · ") };
}
