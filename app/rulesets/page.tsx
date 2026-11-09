"use client";

import { useEffect, useState } from "react";
import { FactorFTable, loadRulesets, rulesetChecksum, Ruleset, saveRulesets, validateFactorFTable } from "@/lib/ruleset";

// หน้าจัดการชุดกฎราคากลาง (F3.3 ส่วนประกอบเครื่องยนต์)
// กฎเหล็ก: ตัวเลขกฎหมายเข้าระบบได้จากเอกสารทางการเท่านั้น — ระบบตรวจเฉพาะ "โครงสร้าง/ความสมเหตุสมผลของตาราง"
// ไม่ตรวจว่าตัวเลขถูกตามกฎหมาย (ผู้นำเข้าต้องอ้างเอกสารเอง — sourceDoc บังคับ)

type ImportResult = { ok: boolean; message: string };

const SAMPLE_JSON = `{
  "name": "(ตัวอย่างสมมุติ) หลักเกณฑ์การคำนวณราคากลางงานก่อสร้าง พ.ศ. 2569",
  "sourceDoc": "(สมมุติเพื่อทดสอบโครงสร้าง — ใช้จริงต้องอ้างราชกิจจานุเบกษาฉบับที่มีผลบังคับ)",
  "sourceUrl": "",
  "effectiveFrom": "2569-01-01",
  "factorF": {
    "advancePct": 0,
    "retentionPct": 5,
    "interestPct": 7,
    "vatPct": 0,
    "rows": [
      { "B": 0, "C": 5, "D": 1.1500, "E": 1.0500 },
      { "B": 5, "C": 30, "D": 1.1300, "E": 1.0300 }
    ]
  },
  "labor": { "minPct": 30, "maxPct": 37 },
  "contingencyPct": 5,
  "swcPct": 5,
  "durableHandlingPct": 12,
  "notices": ["ตัวเลขทั้งหมดในตัวอย่างนี้เป็นข้อมูลสมมุติ ไม่ใช่ตัวเลขกฎหมาย"]
}`;

// ตรวจ + เตรียม ruleset จาก JSON ที่ผู้ใช้นำเข้า — คืน (ruleset พร้อม checksum ที่คำนวณเอง, คำเตือน) หรือ throw Error(ข้อความไทย)
async function prepareImport(raw: string): Promise<{ rs: Ruleset; note: string }> {
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

  const factorF = data.factorF as FactorFTable | undefined;
  if (factorF !== undefined) {
    if (typeof factorF !== "object" || factorF === null || !Array.isArray(factorF.rows)) throw new Error("factorF ไม่ถูกต้อง — ต้องมี advancePct/retentionPct/interestPct/vatPct และ rows");
    for (const k of ["advancePct", "retentionPct", "interestPct", "vatPct"] as const) {
      if (typeof factorF[k] !== "number") throw new Error(`factorF.${k} ต้องเป็นตัวเลข`);
    }
    const err = validateFactorFTable(factorF);
    if (err) throw new Error(`ตาราง Factor F ไม่ผ่านการตรวจ: ${err}`);
  }
  for (const k of ["contingencyPct", "swcPct", "durableHandlingPct"] as const) {
    if (data[k] !== undefined && data[k] !== null && typeof data[k] !== "number") throw new Error(`${k} ต้องเป็นตัวเลข (ถ้ามี)`);
  }
  if (data.labor !== undefined && data.labor !== null) {
    const l = data.labor as { minPct?: unknown; maxPct?: unknown };
    if (typeof l.minPct !== "number" || typeof l.maxPct !== "number") throw new Error("labor ต้องเป็น { minPct, maxPct }");
  }

  const draft = {
    factorF: factorF ?? null,
    labor: (data.labor as Ruleset["labor"]) ?? null,
    contingencyPct: (data.contingencyPct as number | undefined) ?? null,
    swcPct: (data.swcPct as number | undefined) ?? null,
    durableHandlingPct: (data.durableHandlingPct as number | undefined) ?? null,
  };
  const computed = await rulesetChecksum(draft);
  let note = "";
  if (typeof data.checksum === "string" && data.checksum) {
    if (data.checksum !== computed) {
      throw new Error(
        `checksum ไม่ตรงกับเนื้อหาตาราง (ไฟล์: ${String(data.checksum).slice(0, 8)}… / คำนวณใหม่: ${computed.slice(0, 8)}…) — ไฟล์อาจถูกแก้หลังจากคำนวณ checksum ห้ามนำเข้า`,
      );
    }
  } else {
    note = "ไฟล์ไม่มี checksum — ระบบคำนวณจากเนื้อหาให้ใหม่ (ควรตรวจตัวเลขกับเอกสารต้นทางก่อนใช้จริง)";
  }

  const rs: Ruleset = {
    id: String(data.id ?? "").trim() || crypto.randomUUID(),
    name,
    sourceDoc,
    sourceUrl: data.sourceUrl ? String(data.sourceUrl) : undefined,
    effectiveFrom,
    checksum: computed,
    factorF,
    labor: draft.labor ?? undefined,
    contingencyPct: draft.contingencyPct ?? undefined,
    swcPct: draft.swcPct ?? undefined,
    durableHandlingPct: draft.durableHandlingPct ?? undefined,
    notices: Array.isArray(data.notices) ? (data.notices as unknown[]).map(String) : undefined,
    supersededBy: typeof data.supersededBy === "string" && data.supersededBy ? data.supersededBy : undefined,
    createdAt: new Date().toISOString(),
  };
  return { rs, note };
}

export default function RulesetsPage() {
  const [list, setList] = useState<Ruleset[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [paste, setPaste] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [showSample, setShowSample] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setList(loadRulesets());
    setLoaded(true);
  }, []);

  function persist(next: Ruleset[]) {
    setList(next);
    saveRulesets(next);
  }

  async function importRaw(raw: string) {
    setBusy(true);
    setResult(null);
    try {
      const { rs, note } = await prepareImport(raw);
      const existing = list.find((x) => x.id === rs.id);
      if (existing && existing.checksum !== rs.checksum) {
        throw new Error(`มีชุดกฎ id ${rs.id.slice(0, 8)}… อยู่แล้วโดย checksum ต่างกัน — ถ้าตั้งใจประกาศใหม่ ให้ลบ id ออกจากไฟล์เพื่อให้ระบบออก id ใหม่`);
      }
      const next = existing ? list.map((x) => (x.id === rs.id ? rs : x)) : [...list, rs];
      persist(next);
      setPaste("");
      setResult({ ok: true, message: `นำเข้าสำเร็จ: ${rs.name}${note ? " — " + note : ""}` });
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  function importFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => importRaw(String(reader.result ?? ""));
    reader.onerror = () => setResult({ ok: false, message: "อ่านไฟล์ไม่สำเร็จ" });
    reader.readAsText(file, "utf-8");
  }

  function exportRs(rs: Ruleset) {
    const blob = new Blob([JSON.stringify(rs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ruleset-${rs.name.slice(0, 40).replace(/[\\/:*?"<>|]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function deleteRs(rs: Ruleset) {
    if (!window.confirm(`ลบชุดกฎ "${rs.name}" ออกจากอุปกรณ์นี้?\nโปรเจกต์ที่ pin ชุดกฎนี้จะเตือนว่าหาไม่เจอ`)) return;
    persist(list.filter((x) => x.id !== rs.id));
  }

  function markSuperseded(oldId: string, newId: string | "") {
    persist(list.map((x) => (x.id === oldId ? { ...x, supersededBy: newId || undefined } : x)));
  }

  if (!loaded) return <div className="mx-auto max-w-5xl px-4 py-10 text-slate-500">กำลังโหลด…</div>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-blue-950">ชุดกฎราคากลาง (Ruleset Registry)</h1>
          <p className="mt-1 text-sm text-slate-500">
            ที่เก็บตัวเลขกฎหมาย (ตาราง Factor F, % ค่าแรง, เงินเผื่อจำเป็น, ค่าดำเนินงาน) — เครื่องยนต์คำนวณอ่านจากที่นี่เท่านั้น ห้าม hardcode ในโค้ด
          </p>
        </div>
        <a href="/projects" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">กลับหน้าโครงการ</a>
      </div>

      <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        ⚠ นำเข้าได้จาก <b>เอกสารทางการที่มีผลบังคับ</b> (ราชกิจจานุเบกษา/ประกาศหน่วยงาน) เท่านั้น — ระบบตรวจโครงสร้างตารางให้
        แต่<b>ไม่ตรวจว่าตัวเลขถูกตามกฎหมาย</b> ผู้นำเข้าต้องอ้างเอกสารต้นทาง (sourceDoc) ทุกครั้ง
      </div>

      {/* นำเข้า */}
      <div className="mb-8 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-2 text-lg font-semibold text-blue-950">นำเข้าชุดกฎ (JSON)</h2>
        <p className="mb-3 text-xs text-slate-500">
          วางเนื้อหา JSON หรือเลือกไฟล์ — ถ้าไฟล์มี checksum ระบบจะตรวจกับเนื้อหาตาราง (ตรวจพบการแก้ไฟล์ภายหลัง)
        </p>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={8}
          placeholder="วาง JSON ของชุดกฎที่นี่…"
          className="w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs text-slate-800"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => importRaw(paste)}
            disabled={busy || !paste.trim()}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-40"
          >
            {busy ? "กำลังตรวจ…" : "ตรวจและนำเข้าจากข้อความ"}
          </button>
          <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">
            เลือกไฟล์ .json
            <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
          </label>
          <button onClick={() => setShowSample((s) => !s)} className="text-sm text-blue-700 underline">
            {showSample ? "ซ่อนโครงสร้างตัวอย่าง" : "ดูโครงสร้าง JSON ตัวอย่าง"}
          </button>
        </div>
        {result && (
          <p className={`mt-3 rounded-lg border px-3 py-2 text-sm ${result.ok ? "border-green-500 bg-green-50 text-green-800" : "border-red-400 bg-red-50 text-red-800"}`}>
            {result.ok ? "✓ " : "✕ "}{result.message}
          </p>
        )}
        {showSample && (
          <div className="mt-3">
            <p className="mb-1 text-xs text-amber-900">⚠ ค่าในตัวอย่างเป็น <b>ข้อมูลสมมุติเพื่อทดสอบโครงสร้าง</b> ไม่ใช่ตัวเลขกฎหมาย — ห้ามลอกไปใช้จริง</p>
            <pre className="max-h-72 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-700">{SAMPLE_JSON}</pre>
          </div>
        )}
      </div>

      {/* รายการชุดกฎ */}
      <h2 className="mb-3 text-lg font-semibold text-blue-950">ชุดกฎในอุปกรณ์นี้ ({list.length})</h2>
      {list.length === 0 && (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          ยังไม่มีชุดกฎ — นำเข้าจากเอกสารทางการด้านบน โปรเจกต์โหมดราชการจะคำนวณเฉพาะต้นทุนจนกว่าจะ pin ชุดกฎ
        </p>
      )}
      <div className="grid gap-4">
        {list.map((rs) => {
          const supersededByRs = rs.supersededBy ? list.find((x) => x.id === rs.supersededBy) : null;
          return (
            <div key={rs.id} className={`rounded-xl border bg-white p-5 ${rs.supersededBy ? "border-amber-300" : "border-slate-200"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-blue-950">{rs.name}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    ที่มา: {rs.sourceDoc} · มีผล {rs.effectiveFrom} · checksum {rs.checksum.slice(0, 8)}…
                  </p>
                </div>
                {rs.supersededBy ? (
                  <span className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-900">
                    ถูกแทนที่แล้ว{supersededByRs ? ` โดย "${supersededByRs.name}"` : " (ชุดกฎใหม่ถูกลบไปแล้ว)"}
                  </span>
                ) : (
                  <span className="rounded bg-green-100 px-2 py-1 text-xs text-green-800">ใช้งานได้</span>
                )}
              </div>

              <div className="mt-3 grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
                {rs.labor && <span>ช่วง % ค่าแรง: {rs.labor.minPct}–{rs.labor.maxPct}%</span>}
                {rs.contingencyPct !== undefined && <span>เงินเผื่อจำเป็น: {rs.contingencyPct}%</span>}
                {rs.swcPct !== undefined && <span>ค่าดำเนินงาน (ก่อสร้าง): {rs.swcPct}%</span>}
                {rs.durableHandlingPct !== undefined && <span>ค่าดำเนินงานครุภัณฑ์: {rs.durableHandlingPct}%</span>}
                {!rs.factorF && <span className="text-amber-900">ไม่มีตาราง Factor F — เครื่องยนต์จะคำนวณแบบไม่ปรับ (F = 1)</span>}
              </div>

              {rs.notices && rs.notices.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-xs text-slate-500">
                  {rs.notices.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              )}

              {rs.factorF && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-blue-700">ตาราง Factor F ({rs.factorF.rows.length} ช่วง)</summary>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 text-left text-slate-600">
                        <tr>
                          <th className="px-2 py-1 font-medium">ต้นทุนล่าง B (ล้านบาท)</th>
                          <th className="px-2 py-1 font-medium">ต้นทุนบน C (ล้านบาท)</th>
                          <th className="px-2 py-1 font-medium">F ที่ขอบล่าง D</th>
                          <th className="px-2 py-1 font-medium">F ที่ขอบบน E</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rs.factorF.rows.map((r, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            <td className="px-2 py-1">{r.B}</td>
                            <td className="px-2 py-1">{r.C}</td>
                            <td className="px-2 py-1">{r.D}</td>
                            <td className="px-2 py-1">{r.E}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">พารามิเตอร์: ทดรองจ่าย {rs.factorF.advancePct}% · ประกันผลงาน {rs.factorF.retentionPct}% · ดอกเบี้ย {rs.factorF.interestPct}% · VAT {rs.factorF.vatPct}%</p>
                </details>
              )}

              <div className="no-print mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-sm">
                <button onClick={() => exportRs(rs)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-50">ส่งออก JSON</button>
                <button onClick={() => deleteRs(rs)} className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs text-red-700 hover:bg-red-50">ลบ</button>
                {!rs.supersededBy && list.length > 1 && (
                  <label className="ml-auto flex items-center gap-2 text-xs text-slate-500">
                    มาร์กว่าถูกแทนที่โดย:
                    <select
                      value=""
                      onChange={(e) => markSuperseded(rs.id, e.target.value)}
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                    >
                      <option value="">— เลือกชุดกฎ —</option>
                      {list.filter((x) => x.id !== rs.id).map((x) => (
                        <option key={x.id} value={x.id}>{x.name}</option>
                      ))}
                    </select>
                  </label>
                )}
                {rs.supersededBy && (
                  <button onClick={() => markSuperseded(rs.id, "")} className="ml-auto text-xs text-slate-500 underline">เลิกมาร์กถูกแทนที่</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-xs text-slate-500">
        ข้อมูลชุดกฎเก็บในเครื่องผู้ใช้ (localStorage) เท่านั้น — ตามข้อตกลงคุ้มครองข้อมูลของระบบ การย้ายเครื่องให้ส่งออก/นำเข้าไฟล์ JSON
      </p>
    </div>
  );
}
