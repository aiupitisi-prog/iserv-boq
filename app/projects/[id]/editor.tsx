"use client";

import { useEffect, useState } from "react";
import { BoqItem, BoqProject, FactorFCond, PriceSource, itemTotal, newId, proposalSummary, projectTotal, sectionTotals, thb } from "@/lib/boq";
import { loadProjects, saveProject } from "@/lib/storage";
import { loadPricelist, PrivatePrice } from "@/lib/pricelist";
import { WorkTypeCode, loadRulesets, Ruleset, rulesetStatus, selectFactorFTable, WORK_TYPE_LABELS } from "@/lib/ruleset";
import { CalcResult, computeGovBOQ, computeGovBOQSafe } from "@/lib/calc/compute";
import { satangToBaht } from "@/lib/calc/money";
import { downloadBlob, EXPORT_MIME, safeFilename, toCsv, toXlsxArray } from "@/lib/export";

function safeCalc(p: BoqProject, rs: Ruleset | null | undefined): { calc: CalcResult | null; err: string | null } {
  return computeGovBOQSafe(p, rs);
}

const THAI_MONTHS = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const CURRENT_TH_YEAR = new Date().getFullYear() + 543;
const PICKER_YEARS = [2569, 2568, 2567, 2566, 2565, 2564];

type PriceRow = {
  code: string;
  name: string;
  unit: string;
  headCategory: string;
  headCategoryName: string;
  price: number | null;
  month: number | null;
  year: number;
};

type Meta = {
  provinces: { type: string; name: string }[];
  heads: { code: string; name: string }[];
};

// อายุราคาเป็นเดือน (นับจากเดือนอ้างอิงราคาถึงเดือนปัจจุบัน) — ใช้เตือนราคาเก่าเกิน 12 เดือน
// - tpso: นับจากปี/เดือนอ้างอิงราคา ถ้าไม่รู้เดือน (month = null) นับจากปีอย่างเดียวแบบ conservative
// - private: นับจากวันที่อัปเดตราคาในคลังส่วนตัว ณ ตอนเลือก (priceAgeRef)
function priceAgeMonths(src: PriceSource): number | null {
  const now = new Date();
  const nowM = (now.getFullYear() + 543) * 12 + (now.getMonth() + 1);
  if (src.kind === "private") {
    const d = new Date(src.priceAgeRef);
    if (isNaN(d.getTime())) return null;
    return nowM - ((d.getFullYear() + 543) * 12 + (d.getMonth() + 1));
  }
  if (!src.month) return (now.getFullYear() + 543 - src.year) * 12;
  return nowM - (src.year * 12 + src.month);
}

export default function BoqEditor({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<BoqProject | null>(null);
  const [loaded, setLoaded] = useState(false);

  // state ของ picker "เลือกจากคลังราคา"
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pTab, setPTab] = useState<"tpso" | "mine">("tpso"); // แหล่งราคาใน picker
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaErr, setMetaErr] = useState<string | null>(null);
  const [pProv, setPProv] = useState("10");
  const [pYear, setPYear] = useState(CURRENT_TH_YEAR);
  const [pCat, setPCat] = useState("");
  const [pQ, setPQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [pTotal, setPTotal] = useState(0);
  const [pLoading, setPLoading] = useState(false);
  const [pErr, setPErr] = useState<string | null>(null);
  const [mine, setMine] = useState<PrivatePrice[]>([]); // คลังราคาส่วนตัว (โหลดตอนเปิดแท็บ "ของฉัน")
  const [rulesets, setRulesets] = useState<Ruleset[]>([]); // ชุดกฎราคากลาง (pin ระดับโปรเจกต์)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({}); // ยุบกลุ่มหมวดงาน (F3.1)

  useEffect(() => {
    loadProjects().then((list) => {
      setProject(list.find((p) => p.id === projectId) ?? null);
      setRulesets(loadRulesets());
      setLoaded(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // debounce ช่องค้นหาใน picker
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(pQ), 400);
    return () => clearTimeout(t);
  }, [pQ]);

  // ค้นหาราคาเมื่อเงื่อนไขใน picker เปลี่ยน (เรียกผ่าน API ฝั่งเซิร์ฟเวอร์ — TPSO ไม่มี CORS)
  useEffect(() => {
    if (!pickerOpen || pTab !== "tpso") return;
    let alive = true;
    setPLoading(true);
    setPErr(null);
    const url = `/api/prices/search?prov=${encodeURIComponent(pProv)}&y=${pYear}&cat=${encodeURIComponent(pCat)}&q=${encodeURIComponent(debouncedQ)}&limit=50`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("เชื่อมต่อ สนค. ไม่สำเร็จ (สถานะ " + r.status + ")"))))
      .then((d) => {
        if (!alive) return;
        setRows(d.rows ?? []);
        setPTotal(d.total ?? 0);
      })
      .catch((e) => {
        if (alive) setPErr(e instanceof Error ? e.message : "เชื่อมต่อ สนค. ไม่สำเร็จ");
      })
      .finally(() => {
        if (alive) setPLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [pickerOpen, pTab, pProv, pYear, pCat, debouncedQ]);

  function update(next: BoqProject | null) {
    setProject(next);
    if (next) void saveProject(next); // IndexedDB upsert ระเบียบเดียว (F4.4) — เบากว่าเขียนทั้งรายการ
  }

  function patchItem(id: string, patch: Partial<BoqItem>) {
    if (!project) return;
    const items = project.items.map((it) => (it.id === id ? { ...it, ...patch } : it));
    update({ ...project, items });
  }

  function addItem() {
    if (!project) return;
    const last = project.items[project.items.length - 1];
    const items: BoqItem[] = [
      ...project.items,
      {
        id: newId(),
        section: last?.section ?? "การงานเบื้องต้น",
        name: "",
        unit: "ตร.ม.",
        qty: 0,
        price: 0,
      },
    ];
    update({ ...project, items });
  }

  function openPicker() {
    if (!project) return;
    setPProv(project.province ?? "10");
    setPYear(project.budgetYear ?? CURRENT_TH_YEAR);
    setPCat("");
    setPQ("");
    setDebouncedQ("");
    setPErr(null);
    loadPricelist().then(setMine); // คลังส่วนตัวอ่านสดทุกครั้งที่เปิด (แก้ใน /my-prices แล้วเห็นทันที)
    setPickerOpen(true);
    if (!meta) {
      setMetaErr(null);
      fetch("/api/prices/meta")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("โหลดรายชื่อจังหวัดไม่สำเร็จ (สถานะ " + r.status + ")"))))
        .then((m: Meta) => setMeta(m))
        .catch((e) => setMetaErr(e instanceof Error ? e.message : "โหลดรายชื่อจังหวัดไม่สำเร็จ"));
    }
  }

  // เลือกรายการจากคลังราคา สนค. → เพิ่มแถว BOQ พร้อมบันทึก PriceEvidence
  function pickRow(row: PriceRow) {
    if (!project) return;
    if (typeof row.price !== "number" || !isFinite(row.price)) return;
    const last = project.items[project.items.length - 1];
    const src: PriceSource = {
      kind: "tpso",
      code: row.code,
      prov: pProv,
      provName: meta?.provinces.find((p) => p.type === pProv)?.name ?? "",
      year: row.year,
      month: row.month,
      priceAtPick: row.price,
      pickedAt: new Date().toISOString(),
    };
    const item: BoqItem = {
      id: newId(),
      section: last?.section ?? "การงานเบื้องต้น",
      name: row.name,
      unit: row.unit || "หน่วย",
      qty: 1,
      price: row.price,
      source: src,
    };
    // จังหวัด/ปีที่เลือก กลายเป็นค่าอ้างอิงระดับโปรเจกต์ (ครั้งต่อไปเอาไว้ก่อน)
    update({ ...project, province: pProv, budgetYear: pYear, items: [...project.items, item] });
    setPickerOpen(false);
  }

  // เลือกรายการจากคลังราคาส่วนตัว (F2.1) → เพิ่มแถว BOQ พร้อม PriceEvidence แบบ private
  function pickMine(entry: PrivatePrice) {
    if (!project) return;
    const last = project.items[project.items.length - 1];
    const src: PriceSource = {
      kind: "private",
      entryId: entry.id,
      category: entry.category,
      note: entry.note,
      priceAgeRef: entry.updatedAt,
      priceAtPick: entry.price,
      pickedAt: new Date().toISOString(),
    };
    const item: BoqItem = {
      id: newId(),
      section: last?.section ?? (entry.category === "ค่าแรง" ? "งานค่าแรง" : "การงานเบื้องต้น"),
      name: entry.name,
      unit: entry.unit || "หน่วย",
      qty: 1,
      price: entry.price,
      source: src,
    };
    update({ ...project, items: [...project.items, item] });
    setPickerOpen(false);
  }

  // คัดลอกรายการในตาราง (F2.3) — ทำซ้ำแถวเดิมมาแก้ต่อ (source คงที่มาราคาเดิม)
  function duplicateItem(id: string) {
    if (!project) return;
    const idx = project.items.findIndex((it) => it.id === id);
    if (idx < 0) return;
    const copy: BoqItem = { ...project.items[idx], id: newId() };
    const items = [...project.items];
    items.splice(idx + 1, 0, copy);
    update({ ...project, items });
  }

  function removeItem(id: string) {
    if (!project) return;
    update({ ...project, items: project.items.filter((it) => it.id !== id) });
  }

  // ย้ายลำดับรายการ (F3.1) — สลับกับแถวก่อนหน้า/ถัดไปในลิสต์เดิม
  function moveItem(id: string, dir: -1 | 1) {
    if (!project) return;
    const idx = project.items.findIndex((it) => it.id === id);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= project.items.length) return;
    const items = [...project.items];
    [items[idx], items[to]] = [items[to], items[idx]];
    update({ ...project, items });
  }

  // ส่งออก CSV / Excel (F3.4) — สร้างไฟล์จาก lib/export (CSV มี BOM, xlsx ผ่าน SheetJS)
  async function exportCsv() {
    if (!project) return;
    downloadBlob(toCsv(project), EXPORT_MIME.csv, safeFilename(project, "csv"));
  }
  async function exportXlsx() {
    if (!project) return;
    const rs = rulesets.find((r) => r.id === project.rulesetId) ?? null;
    const bytes = await toXlsxArray(project, rs);
    downloadBlob(bytes, EXPORT_MIME.xlsx, safeFilename(project, "xlsx"));
  }

  function downloadJson() {
    if (!project) return;
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `boq-${project.name}-${project.id.slice(0, 6)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ตั้งเงื่อนไขเลือกตาราง Factor F — patch ทีละฟิลด์; ฟิลด์ที่ยังไม่ระบุเติมค่า default แรกของชุดตารางให้เสมอ
  // (ไม่เก็บเงื่อนไขครึ่ง ๆ กลาง ๆ ไม่งั้นเครื่องยนต์จะ "หาตารางไม่เจอ" และเตือนผิดความหมาย)
  // clearNoVat / clearRain = ลบฟิลด์ optional ออก (แยกจากการ "ตั้งเป็น undefined" ซึ่งจะ fallback ไปค่าเดิม)
  function setCondFields(patch: Partial<FactorFCond> & { clearNoVat?: boolean; clearRain?: boolean }) {
    if (!project) return;
    const wt = patch.workType ?? cond?.workType ?? condWorkTypes[0];
    if (!wt) {
      update({ ...project, factorFCond: undefined });
      return;
    }
    const tablesOfWt = tableSet.filter((t) => t.workType === wt);
    const adv = patch.advancePct ?? cond?.advancePct ?? tablesOfWt.map((t) => t.advancePct).sort((a, b) => a - b)[0] ?? 0;
    const ret = patch.retentionPct ?? cond?.retentionPct ?? tablesOfWt.filter((t) => t.advancePct === adv).map((t) => t.retentionPct).sort((a, b) => a - b)[0] ?? 0;
    const next: FactorFCond = { workType: wt, advancePct: adv, retentionPct: ret };
    if (patch.clearNoVat) {
      // ล้าง noVat
    } else if (patch.noVat !== undefined || cond?.noVat !== undefined) {
      next.noVat = patch.noVat ?? cond?.noVat;
    }
    // สลับประเภทงานไปตารางที่ไม่มีคอลัมน์ฝนชุก → เคลียร์ rain ทิ้ง (เก็บค้างไว้จะหลอกว่า "ใช้ฝนชุกอยู่")
    const newHit = tablesOfWt.find((t) => t.advancePct === adv && t.retentionPct === ret);
    const newWtHasRain = newHit?.rows.some((r) => r.D2 !== undefined && r.D3 !== undefined) ?? false;
    const switchedToRainless = !!patch.workType && patch.workType !== cond?.workType && !newWtHasRain;
    if (patch.clearRain || switchedToRainless) {
      // ล้าง rain — ผู้ใช้เลือก "ไม่ระบุ" หรือสลับไปตารางที่ไม่มีคอลัมน์ฝนชุก
    } else if (patch.rain !== undefined || cond?.rain !== undefined) {
      next.rain = patch.rain ?? cond?.rain;
    }
    update({ ...project, factorFCond: next });
  }

  if (!loaded) {
    return <div className="mx-auto max-w-6xl px-4 py-10 text-slate-500">กำลังโหลด…</div>;
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="mb-2 text-xl font-semibold text-slate-700">ไม่พบโครงการนี้ในอุปกรณ์</h1>
        <p className="mb-6 text-sm text-slate-500">ข้อมูลถูกเก็บในเบราว์เซอร์ของอุปกรณ์เดียว หากสลับเครื่องต้องนำเข้าไฟล์ JSON อีกครั้ง</p>
        <a href="/projects" className="rounded-lg bg-blue-700 px-4 py-2 text-sm text-white hover:bg-blue-800">กลับหน้าโครงการ</a>
      </div>
    );
  }

  const totals = sectionTotals(project);
  const isPrivate = project.mode === "private";
  const proposal = isPrivate ? proposalSummary(project.items, project.factors) : null;
  const pinnedRs = rulesets.find((r) => r.id === project.rulesetId);
  const pinnedStatus = rulesetStatus(pinnedRs);
  const gov = !isPrivate ? safeCalc(project, pinnedRs) : null; // สรุปราคากลางสดจากเครื่องยนต์ (โหมดราชการ)

  // เงื่อนไขการใช้ตาราง Factor F (ประกาศ ว 481 — ชุดตารางแยกตามสัญญา) —
  // ตัวเลือกลากจากชุดตารางของชุดกฎที่ pin เท่านั้น (ไม่เดา/ไม่ hardcode) — เครื่องยนต์เลือกตารางจากค่านี้
  const tableSet = pinnedRs?.factorFTables ?? [];
  const cond = project.factorFCond;
  const condWorkTypes = [...new Set(tableSet.map((t) => t.workType))].filter((w): w is WorkTypeCode => w !== undefined).sort();
  const condAdvanceOptions = [...new Set(tableSet.filter((t) => !cond?.workType || t.workType === cond.workType).map((t) => t.advancePct))].sort((a, b) => a - b);
  const condRetentionOptions = [
    ...new Set(
      tableSet
        .filter((t) => (!cond?.workType || t.workType === cond.workType) && (cond?.advancePct === undefined || t.advancePct === cond.advancePct))
        .map((t) => t.retentionPct),
    ),
  ].sort((a, b) => a - b);
  const condHit = cond ? selectFactorFTable(tableSet, cond) : null; // null = ยังไม่ครบ/ไม่พบตาราง
  const condHasRainCols = condHit?.rows.some((r) => r.D2 !== undefined && r.D3 !== undefined) ?? false;
  const condHasNoVatCols = condHit?.rows.some((r) => r.F !== undefined && r.G !== undefined) ?? false;
  const hasTableSet = tableSet.length > 0;

  // จับกลุ่มรายการตามหมวดงาน (F3.1) — ตามลำดับที่พบแรก; ยุบ/ขยายได้ (ตอนพิมพ์ขยายเสมอ — CSS)
  const groups: { section: string; items: { it: BoqItem; index: number }[] }[] = [];
  project.items.forEach((it, index) => {
    let g = groups.find((x) => x.section === it.section);
    if (!g) {
      g = { section: it.section, items: [] };
      groups.push(g);
    }
    g.items.push({ it, index });
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={project.name}
          onChange={(e) => update({ ...project, name: e.target.value })}
          className="mb-1 w-full rounded-lg border border-transparent bg-transparent text-2xl font-bold text-blue-950 hover:border-slate-300 focus:border-blue-400 sm:w-auto sm:flex-1"
        />
        {isPrivate && (
          <span className="mb-1 rounded bg-teal-100 px-2 py-1 text-xs font-medium text-teal-800" title="โหมดเอกชน — สรุปท้ายตารางมีปัจจัยราคาเสนอที่ตั้งเอง">
            เอกชน · ประมาณการ — ไม่ใช่ราคากลางตามหลักเกณฑ์
          </span>
        )}
      </div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <input
          value={project.address}
          onChange={(e) => update({ ...project, address: e.target.value })}
          placeholder="ที่ตั้งงาน"
          className="rounded-lg border border-transparent bg-transparent text-sm text-slate-600 hover:border-slate-300 focus:border-blue-400"
        />
        <div className="no-print flex flex-wrap gap-2">
          <button onClick={openPicker} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">เลือกจากคลังราคา</button>
          <button onClick={addItem} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">เพิ่มรายการ</button>
          <a href={`/projects/${project.id}/docs`} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">
            {isPrivate ? "ใบเสนอราคา (พิมพ์)" : "เอกสาร 9 ฉบับ (พิมพ์)"}
          </a>
          <button onClick={exportXlsx} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">ส่งออก Excel</button>
          <button onClick={exportCsv} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">ส่งออก CSV</button>
          <button onClick={downloadJson} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">ส่งออก JSON</button>
          <button onClick={() => window.print()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">พิมพ์เอกสาร</button>
          <a href="/projects" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">กลับ</a>
        </div>
      </div>

      {/* pin ชุดกฎราคากลาง (โหมดราชการ) — เครื่องยนต์ใช้ตารางจากที่นี่เท่านั้น */}
      {!isPrivate && (
        <div className="no-print mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium text-blue-950">ชุดกฎราคากลางที่ใช้ (pin):</span>
            <select
              value={project.rulesetId ?? ""}
              onChange={(e) => update({ ...project, rulesetId: e.target.value || undefined })}
              className="min-w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800"
            >
              <option value="">— ไม่ pin (คำนวณเฉพาะต้นทุน) —</option>
              {rulesets.map((rs) => (
                <option key={rs.id} value={rs.id}>{rs.name}{rs.supersededBy ? " · ถูกแทนที่แล้ว" : ""}</option>
              ))}
            </select>
            <a href="/rulesets" className="text-blue-700 underline">จัดการชุดกฎ →</a>
          </div>
          {pinnedRs && pinnedStatus === "ok" && (
            <p className="mt-2 text-xs text-slate-500">
              ที่มา: {pinnedRs.sourceDoc} · มีผล {pinnedRs.effectiveFrom} · checksum {pinnedRs.checksum.slice(0, 8)}…
            </p>
          )}
          {pinnedStatus === "superseded" && pinnedRs && (
            <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              ⚠ ชุดกฎนี้ถูกประกาศฉบับใหม่แทนที่แล้ว — โปรเจกต์ยัง pin อยู่กับฉบับเก่า ตรวจสอบและเปลี่ยนที่{" "}
              <a href="/rulesets" className="underline">ชุดกฎราคากลาง</a>
            </p>
          )}
          {pinnedStatus === "missing" && (
            <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              ⚠ ชุดกฎที่ pin ไว้ถูกลบออกจากอุปกรณ์นี้แล้ว — เลือกชุดกฎใหม่หรือนำเข้าอีกครั้งที่{" "}
              <a href="/rulesets" className="underline">ชุดกฎราคากลาง</a>
            </p>
          )}

          {/* เงื่อนไขการใช้ตาราง Factor F — ประกาศ ว 481 แยกตารางตามสัญญา (ต้องระบุให้เครื่องยนต์เลือกได้) */}
          {hasTableSet && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="font-medium text-blue-950">เงื่อนไขการใช้ตาราง Factor F ตามสัญญา:</span>
                <select
                  value={cond?.workType ?? ""}
                  onChange={(e) => (e.target.value ? setCondFields({ workType: e.target.value as WorkTypeCode }) : update({ ...project, factorFCond: undefined }))}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800"
                >
                  <option value="">— ประเภทงาน —</option>
                  {condWorkTypes.map((wt) => (
                    <option key={wt} value={wt}>{WORK_TYPE_LABELS[wt]}</option>
                  ))}
                </select>
                <select
                  value={cond?.advancePct !== undefined ? String(cond.advancePct) : ""}
                  onChange={(e) => e.target.value !== "" && setCondFields({ advancePct: Number(e.target.value) })}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800"
                >
                  <option value="">— ค่าจ้างล่วงหน้า (%) —</option>
                  {condAdvanceOptions.map((v) => (
                    <option key={v} value={v}>{v}%</option>
                  ))}
                </select>
                <select
                  value={cond?.retentionPct !== undefined ? String(cond.retentionPct) : ""}
                  onChange={(e) => e.target.value !== "" && setCondFields({ retentionPct: Number(e.target.value) })}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800"
                >
                  <option value="">— เงินประกันผลงาน (%) —</option>
                  {condRetentionOptions.map((v) => (
                    <option key={v} value={v}>{v}%</option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-xs text-slate-600" title="หมายเหตุ 2 ของประกาศ ว 481 — งานที่ไม่ต้องชำระ VAT ให้ใช้คอลัมน์ “รวมในรูป Factor”">
                  <input
                    type="checkbox"
                    checked={cond?.noVat === true}
                    onChange={(e) => (e.target.checked ? setCondFields({ noVat: true }) : setCondFields({ clearNoVat: true }))}
                    className="h-3.5 w-3.5"
                  />
                  ไม่ชำระ VAT (ใช้คอลัมน์ “รวมในรูป Factor”)
                </label>
                <select
                  value={cond?.rain !== undefined ? String(cond.rain) : ""}
                  onChange={(e) => (e.target.value ? setCondFields({ rain: Number(e.target.value) as 1 | 2 }) : setCondFields({ clearRain: true }))}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800"
                  disabled={!condHasRainCols}
                  title={condHasRainCols ? "พื้นที่ฝนชุก — ใช้คอลัมน์ Factor F ฝนชุกของตาราง" : "ตารางตามเงื่อนไขนี้ไม่มีคอลัมน์ฝนชุก (มีเฉพาะงานทาง/ชลประทาน)"}
                >
                  <option value="">— พื้นที่ฝนชุก —</option>
                  <option value="1">ฝนชุก 1</option>
                  <option value="2">ฝนชุก 2</option>
                </select>
              </div>

              {condHit ? (
                <p className="mt-2 text-xs text-green-800">
                  ✓ ตารางที่จะใช้: {condHit.workType ? WORK_TYPE_LABELS[condHit.workType] : "—"} · ทดรองจ่าย {condHit.advancePct}% · ประกันผลงาน {condHit.retentionPct}% · ดอกเบี้ย {condHit.interestPct}% · VAT {condHit.vatPct}% ({condHit.rows.length} ช่วง)
                  {cond?.noVat === true && " · ใช้คอลัมน์ “รวมในรูป Factor” (ไม่รวม VAT)"}
                  {cond?.noVat === true && !condHasNoVatCols && " · ⚠ ตารางนี้ไม่มีคอลัมน์ “รวมในรูป Factor” — เครื่องยนต์จะใช้คอลัมน์ปกติ (รวม VAT) และเตือนใน trace"}
                  {cond?.rain !== undefined && !condHasRainCols && " · ⚠ ตารางนี้ไม่มีคอลัมน์ฝนชุก — เครื่องยนต์จะใช้คอลัมน์ปกติและเตือนใน trace"}
                </p>
              ) : cond ? (
                <p className="mt-2 text-xs text-amber-900">⚠ ไม่พบตารางตามเงื่อนไขนี้ในชุดกฎ — เครื่องยนต์ยังไม่ปรับ Factor F (F = 1) ตรวจเงื่อนไขหรือชุดกฎที่ pin</p>
              ) : (
                <p className="mt-2 text-xs text-slate-500">ชุดกฎนี้แยกตารางตามเงื่อนไขสัญญา (4 ประเภทงาน × คู่อัตรา) — ระบุเงื่อนไขให้ครบเพื่อเลือกตาราง · ไม่ระบุ = ไม่ปรับ Factor F (F = 1)</p>
              )}
              {cond?.noVat === true && (
                <p className="mt-1.5 text-xs text-amber-900">
                  ⚠ หากเป็น<strong>ทุนผสม</strong> (เงินกู้ + งบประมาณต้นสังกัด) เล่ม 2 ข้อ 9.3 ให้คิด Factor F ถ่วงน้ำหนักตามสัดส่วนเงินทุน — ระบบยังไม่รองรับการถ่วงน้ำหนัก ให้คำนวณเทียบเองและบันทึกหมายเหตุในเอกสาร
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-slate-600">
            <tr>
              <th className="px-3 py-3 font-medium">รายการงาน</th>
              <th className="px-3 py-3 font-medium">หน่วย</th>
              <th className="w-28 px-3 py-3 text-right font-medium">ปริมาณ</th>
              <th className="w-32 px-3 py-3 text-right font-medium">ราคา/หน่วย</th>
              <th className="no-print w-44 px-3 py-3 font-medium" title="แยกราคาเป็น ก. ค่าวัสดุ / ข. ค่าแรง (บาท/หน่วย) — ใส่คู่กัน ผลรวมต้องเท่าราคา/หน่วย">วัสดุ / แรงงาน</th>
              <th className="w-32 px-3 py-3 text-right font-medium">รวมเงิน</th>
              <th className="no-print px-2 py-3 font-medium" title="ครุภัณฑ์ = แยกออกจากฐานคำนวณ Factor F">ส่วน</th>
              <th className="no-print w-10 px-2 py-3"></th>
            </tr>
          </thead>
          {groups.map((g) => {
            const isCollapsed = collapsed[g.section] ?? false;
            const secTotal = g.items.reduce((a, x) => a + itemTotal(x.it), 0);
            return (
              <tbody key={g.section}>
                <tr
                  className="boq-sec-row cursor-pointer border-t border-slate-200 bg-slate-50"
                  onClick={() => setCollapsed((c) => ({ ...c, [g.section]: !isCollapsed }))}
                >
                  <td colSpan={6} className="px-3 py-2">
                    <span className="no-print mr-2 inline-block w-4 text-slate-400">{isCollapsed ? "▸" : "▾"}</span>
                    <span className="font-medium text-blue-950">{g.section}</span>
                    <span className="no-print ml-2 text-xs text-slate-500">{g.items.length} รายการ</span>
                  </td>
                  <td colSpan={2} className="px-3 py-2 text-right text-sm font-medium text-slate-700">
                    รวมหมวด: {thb(secTotal)}
                  </td>
                </tr>
                {g.items.map(({ it, index }, gi) => {
                  const age = it.source ? priceAgeMonths(it.source) : null;
                  const stale = age !== null && age > 12;
                  const edited = it.source !== undefined && typeof it.price === "number" && it.price !== it.source.priceAtPick;
                  return (
                    <tr key={it.id} className={`grp-row border-t border-slate-100 hover:bg-slate-50 ${isCollapsed ? "hidden" : ""}`}>
                      <td>
                        <div className="flex items-baseline gap-2 px-0 py-2">
                          <span className="text-xs text-slate-400">{gi + 1}.</span>
                          <input
                            value={it.name}
                            onChange={(e) => patchItem(it.id, { name: e.target.value })}
                            placeholder="ชื่อรายการงาน"
                            className="w-full rounded border border-transparent bg-transparent px-1 py-1 hover:border-slate-200 focus:border-blue-400"
                          />
                        </div>
                        {it.source && (
                          <span
                            className={`ml-6 inline-block rounded px-1.5 py-0.5 text-[11px] ${stale ? "bg-amber-100 text-amber-900" : "bg-blue-100 text-blue-800"}`}
                            title={it.source.kind === "private"
                              ? `ราคาจากคลังของฉัน ณ ตอนเลือก: ${thb(it.source.priceAtPick)}${it.source.note ? ` — ที่มา: ${it.source.note}` : ""}${edited ? " — ผู้ใช้แก้ราคาเองแล้ว" : ""}`
                              : `ราคา สนค. ณ ตอนเลือก: ${thb(it.source.priceAtPick)}${edited ? " — ผู้ใช้แก้ราคาเองแล้ว" : ""}`}
                          >
                            {it.source.kind === "private" ? (
                              <>คลังของฉัน · {it.source.category}{it.source.note ? ` · ${it.source.note}` : ""}</>
                            ) : (
                              <>สนค. {it.source.provName} · {it.source.month ? `${THAI_MONTHS[it.source.month]} ${it.source.year}` : it.source.year}</>
                            )}
                            {stale ? " · ราคาเก่าเกิน 12 เดือน" : ""}
                            {edited ? " · ปรับราคาแล้ว" : ""}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <input value={it.unit} onChange={(e) => patchItem(it.id, { unit: e.target.value })}
                          className="w-20 rounded border border-transparent bg-transparent py-1 hover:border-slate-200 focus:border-blue-400" />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input type="number" step="any" value={it.qty} onChange={(e) => patchItem(it.id, { qty: parseFloat(e.target.value) || 0 })}
                          className="w-24 rounded border border-transparent bg-transparent py-1 text-right hover:border-slate-200 focus:border-blue-400" />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input type="number" step="any" value={it.price} onChange={(e) => patchItem(it.id, { price: parseFloat(e.target.value) || 0 })}
                          className="w-28 rounded border border-transparent bg-transparent py-1 text-right hover:border-slate-200 focus:border-blue-400" />
                      </td>
                      <td className="no-print px-3 py-2">
                        <div className="flex items-center gap-1">
                          <input type="number" step="any" value={it.matPrice ?? ""} placeholder="วัสดุ"
                            onChange={(e) => patchItem(it.id, { matPrice: e.target.value === "" ? undefined : parseFloat(e.target.value) || 0 })}
                            className="w-20 rounded border border-transparent bg-transparent py-1 text-right hover:border-slate-200 focus:border-blue-400"
                            title="ราคาวัสดุ/หน่วย — ลงส่วน ก. ค่าวัสดุอย่างน้อยที่สุด" />
                          <input type="number" step="any" value={it.laborPrice ?? ""} placeholder="แรงงาน"
                            onChange={(e) => patchItem(it.id, { laborPrice: e.target.value === "" ? undefined : parseFloat(e.target.value) || 0 })}
                            className="w-20 rounded border border-transparent bg-transparent py-1 text-right hover:border-slate-200 focus:border-blue-400"
                            title="ราคาแรงงาน/หน่วย — ลงส่วน ข. ค่าแรงอย่างน้อยที่สุด" />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-slate-800">{thb(itemTotal(it))}</td>
                      <td className="no-print px-2 py-2">
                        <select
                          value={it.part ?? "construction"}
                          onChange={(e) => patchItem(it.id, { part: e.target.value === "equipment" ? ("equipment" as const) : undefined })}
                          className="rounded border border-slate-200 bg-white px-1 py-1 text-xs text-slate-700"
                          title="ครุภัณฑ์ = แยกออกจากฐานคำนวณ Factor F และคิดค่าดำเนินงานแยก (กฎเหล็ก)"
                        >
                          <option value="construction">ก่อสร้าง</option>
                          <option value="equipment">ครุภัณฑ์</option>
                        </select>
                      </td>
                      <td className="no-print whitespace-nowrap px-2 py-2 text-center">
                        <button onClick={() => moveItem(it.id, -1)} disabled={index === 0} className="mr-1 text-slate-400 hover:text-blue-600 disabled:opacity-25" aria-label="ย้ายขึ้น" title="ย้ายขึ้น">▲</button>
                        <button onClick={() => moveItem(it.id, 1)} disabled={index === project.items.length - 1} className="mr-1 text-slate-400 hover:text-blue-600 disabled:opacity-25" aria-label="ย้ายลง" title="ย้ายลง">▼</button>
                        <button onClick={() => duplicateItem(it.id)} className="mr-1 text-slate-400 hover:text-blue-600" aria-label="คัดลอกรายการ" title="คัดลอกแถวนี้มาแก้ต่อ">⧉</button>
                        <button onClick={() => removeItem(it.id)} className="text-slate-400 hover:text-red-600" aria-label="ลบรายการ">✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
          {project.items.length === 0 && (
            <tbody>
              <tr><td colSpan={8} className="px-3 py-10 text-center text-slate-500">ยังไม่มีรายการ BOQ — กด เลือกจากคลังราคา หรือ เพิ่มรายการ เพื่อเริ่ม</td></tr>
            </tbody>
          )}
          <tfoot>
            {isPrivate && proposal && (
              <>
                <tr className="border-t-2 border-slate-300 font-semibold text-blue-950">
                  <td colSpan={6} className="px-3 py-2 text-right">รวมราคาวัสดุ-แรงงาน (ต้นทุน)</td>
                  <td colSpan={2} className="px-3 py-2 text-right">{thb(proposal.base)}</td>
                </tr>
                {proposal.lines.map((ln, i) => (
                  <tr key={i} className="border-t border-slate-100 text-slate-600">
                    <td colSpan={6} className="px-3 py-2 text-right text-sm">
                      {ln.label} <span className="text-xs text-slate-500">({ln.formula})</span>
                    </td>
                    <td colSpan={2} className="px-3 py-2 text-right text-sm">{thb(ln.amount)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-300 font-semibold text-blue-950">
                  <td colSpan={6} className="px-3 py-3 text-right">
                    ราคาเสนอ (รวมทุกปัจจัย)
                    <span className="block text-xs font-normal text-amber-900">ประมาณการ — ไม่ใช่ราคากลางตามหลักเกณฑ์</span>
                  </td>
                  <td colSpan={2} className="px-3 py-3 text-right text-lg text-green-700">{thb(proposal.proposalTotal)}</td>
                </tr>
              </>
            )}
            {!isPrivate && (
              <>
                {gov?.calc ? (
                  <>
                    {gov.calc.steps.map((s, i) => (
                      <tr key={i} className={s.kind === "total" ? "border-t-2 border-slate-300 font-semibold text-blue-950" : "border-t border-slate-100 text-slate-600"}>
                        <td colSpan={6} className="px-3 py-2 text-right">
                          {s.label}
                          {s.formula && <span className="no-print text-xs text-slate-500"> ({s.formula})</span>}
                        </td>
                        <td colSpan={2} className={`px-3 py-2 text-right ${s.kind === "total" ? "py-3 text-lg text-green-700" : ""}`}>
                          {thb(satangToBaht(s.satang))}
                        </td>
                      </tr>
                    ))}
                    {gov.calc.warnings.length > 0 && (
                      <tr className="border-t border-amber-200">
                        <td colSpan={8} className="px-3 py-2 text-xs text-amber-900">
                          {gov.calc.warnings.map((w, i) => (
                            <span key={i} className="block">⚠ {w}</span>
                          ))}
                        </td>
                      </tr>
                    )}
                  </>
                ) : (
                  <>
                    <tr className="border-t-2 border-slate-300 font-semibold text-blue-950">
                      <td colSpan={6} className="px-3 py-3 text-right">รวมทั้งโครงการ</td>
                      <td colSpan={2} className="px-3 py-3 text-right text-lg text-green-700">{thb(projectTotal(project))}</td>
                    </tr>
                    {gov?.err && (
                      <tr>
                        <td colSpan={8} className="px-3 py-2 text-xs text-amber-900">⚠ คำนวณราคากลางไม่สำเร็จ: {gov.err}</td>
                      </tr>
                    )}
                  </>
                )}
              </>
            )}
          </tfoot>
        </table>
      </div>

      {/* Disclaimer ถาวร — ห้ามลบ (แสดงตอนพิมพ์ด้วย เพราะเอกสารพิมพ์ติด badge ที่มาราคา) */}
      <p className="mt-4 text-xs text-slate-500">
        ราคาที่อ้างอิงจากคลังราคา สนค. (สำนักงานนโยบายและแผนการขนส่ง) เป็นราคากลางท้องถิ่นเพื่อประกอบการประมาณการ —
        ไม่ใช่ราคามาตรฐานของกรมบัญชีกลางหรือหน่วยงานใด ควรปรับตามราคาจริงของพื้นที่ก่อนใช้ประกอบการจัดซื้อจัดจ้าง
      </p>

      {/* ปัจจัยราคาเสนอ (F2.2) — เฉพาะโหมดเอกชน / แผงตั้งค่าไม่พิมพ์ แต่สรุปในตารางพิมพ์ออก */}
      {isPrivate && (
        <div className="no-print mt-6 rounded-xl border border-teal-300 bg-white p-5">
          <h2 className="mb-1 text-lg font-semibold text-blue-950">ปัจจัยราคาเสนอ (โหมดเอกชน)</h2>
          <p className="mb-3 text-xs text-slate-500">
            ลำดับการคิด: ต้นทุนรวม → +เงินเผื่อจำเป็น → +กำไรและโอเวอร์เฮด → +ค่าดำเนินงาน (S.W.C.) → +VAT — ตั้งเป็น 0 เพื่อข้ามปัจจัยใด ๆ
            ผลลัพธ์เป็นการประมาณการของคุณ ไม่ใช่ราคากลางตามหลักเกณฑ์
          </p>
          <div className="grid gap-3 sm:grid-cols-4">
            {([
              { key: "contingencyPct", label: "เงินเผื่อจำเป็น (%)", hint: "เช่น 3–5" },
              { key: "profitPct", label: "กำไร + โอเวอร์เฮด (%)", hint: "เช่น 10–20" },
              { key: "swcPct", label: "ค่าดำเนินงาน S.W.C. (%)", hint: "เช่น 5–10" },
              { key: "vatPct", label: "VAT (%)", hint: "เช่น 7" },
            ] as const).map((f) => (
              <label key={f.key} className="block text-sm">
                <span className="mb-1 block text-slate-600">{f.label}</span>
                <input
                  type="number" step="any" min="0"
                  value={project.factors?.[f.key] ?? ""}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    update({ ...project, factors: { ...(project.factors ?? {}), [f.key]: isFinite(v) && v > 0 ? v : 0 } });
                  }}
                  placeholder={f.hint}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right"
                />
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-blue-950">สรุปตามหมวดงาน</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {totals.map((t) => (
            <div key={t.section} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
              <span className="text-sm text-slate-700">{t.section}</span>
              <span className="text-sm font-medium text-green-700">{thb(t.total)}</span>
            </div>
          ))}
          {totals.length === 0 && <p className="text-sm text-slate-500">ยังไม่มีข้อมูลหมวดงาน</p>}
        </div>
      </div>

      {pickerOpen && (
        <div
          className="no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/70 p-4"
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="mt-10 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-blue-950">เลือกรายการจากคลังราคา</h2>
              <button onClick={() => setPickerOpen(false)} className="text-slate-400 hover:text-red-600" aria-label="ปิด">✕</button>
            </div>

            {/* แท็บแหล่งราคา — ราคา สนค. (TPSO) / คลังราคาของฉัน (F2.1) */}
            <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1">
              <button onClick={() => setPTab("tpso")}
                className={`flex-1 rounded px-3 py-1.5 text-sm ${pTab === "tpso" ? "bg-white font-medium text-blue-950 shadow" : "text-slate-600 hover:text-slate-800"}`}>
                ราคา สนค. (TPSO)
              </button>
              <button onClick={() => setPTab("mine")}
                className={`flex-1 rounded px-3 py-1.5 text-sm ${pTab === "mine" ? "bg-white font-medium text-blue-950 shadow" : "text-slate-600 hover:text-slate-800"}`}>
                คลังราคาของฉัน ({mine.length})
              </button>
            </div>

            {pTab === "tpso" && (
              <p className="mb-3 text-xs text-slate-500">
                ราคาอ้างอิงจากสำนักงานนโยบายและแผนการขนส่ง (สนค.) — ไม่ใช่ราคามาตรฐานของกรมบัญชีกลางหรือหน่วยงานใด
                ควรปรับตามราคาจริงของพื้นที่ก่อนใช้ประกอบการจัดซื้อจัดจ้าง
              </p>
            )}

            {pTab === "mine" && (
              <p className="mb-3 text-xs text-slate-500">
                ราคาส่วนตัวที่คุณบันทึกเอง (ค่าแรง อุปกรณ์ วัสดุท้องถิ่น) — ไม่ใช่ราคากลางตามหลักเกณฑ์
                จัดการรายการได้ที่{" "}
                <a href="/my-prices" className="underline" target="_blank" rel="noopener noreferrer">คลังราคาของฉัน</a>
              </p>
            )}

            {pTab === "tpso" && (
              <div className="mb-3 flex flex-wrap gap-2">
              <select value={pProv} onChange={(e) => setPProv(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
                {meta ? (
                  meta.provinces.map((p) => (
                    <option key={p.type} value={p.type}>{p.name}</option>
                  ))
                ) : (
                  <option>{metaErr ? "โหลดจังหวัดไม่สำเร็จ" : "กำลังโหลดจังหวัด…"}</option>
                )}
              </select>
              <select value={pYear} onChange={(e) => setPYear(parseInt(e.target.value, 10))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
                {PICKER_YEARS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <select value={pCat} onChange={(e) => setPCat(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
                <option value="">ทุกหมวด</option>
                {(meta?.heads ?? []).map((h) => (
                  <option key={h.code} value={h.code}>{h.code} {h.name}</option>
                ))}
              </select>
              <input value={pQ} onChange={(e) => setPQ(e.target.value)} placeholder="ค้นหา เช่น คอนกรีต, อิฐ, เหล็ก"
                className="min-w-48 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800" />
              </div>
            )}

            {pTab === "tpso" && pProv === "10" && (
              <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                หมายเหตุ: สนค. มีประกาศยกเลิกการเผยแพร่ราคาส่วนกลางหลายช่วงเดือน — แนะนำเลือกจังหวัดเพื่อใช้ราคารายจังหวัด
              </div>
            )}

            {pTab === "tpso" && metaErr && (
              <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                โหลดรายชื่อจังหวัด/หมวดไม่สำเร็จ ({metaErr}) — ลองปิดหน้าต่างนี้แล้วเปิดใหม่ หรือตรวจข้อมูลที่{" "}
                <a href="https://index.tpso.go.th/construction-material-prices" target="_blank" rel="noopener noreferrer" className="underline">index.tpso.go.th ↗</a>
              </div>
            )}

            {pTab === "tpso" && pLoading && (
              <div className="py-12 text-center text-sm text-slate-500">
                กำลังดึงราคาจาก สนค. … (ครั้งแรกของจังหวัด/ปีที่เลือกอาจใช้เวลาถึง 30 วินาที)
              </div>
            )}

            {pTab === "tpso" && !pLoading && pErr && (
              <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                ดึงข้อมูลราคาไม่สำเร็จ ({pErr}) — ลองอีกครั้ง หรือตรวจข้อมูลที่{" "}
                <a href="https://index.tpso.go.th/construction-material-prices" target="_blank" rel="noopener noreferrer" className="underline">index.tpso.go.th ↗</a>
              </div>
            )}

            {pTab === "tpso" && !pLoading && !pErr && (
              <>
                <p className="mb-2 text-xs text-slate-500">
                  พบ {pTotal.toLocaleString("th-TH")} รายการ — แสดง {rows.length} รายการแรก (พิมพ์คำค้นเพิ่มเพื่อกรอง) · คลิกแถวเพื่อเพิ่มลง BOQ
                </p>
                <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 text-left text-slate-600">
                      <tr>
                        <th className="px-3 py-2 font-medium">รายการ</th>
                        <th className="px-3 py-2 font-medium">หน่วย</th>
                        <th className="px-3 py-2 text-right font-medium">ราคา (บาท, ไม่รวม VAT)</th>
                        <th className="px-3 py-2 text-center font-medium">อ้างอิงเดือน</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.code} onClick={() => pickRow(r)} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-2">
                            <div className="text-slate-800">{r.name}</div>
                            <div className="text-xs text-slate-500">{r.headCategoryName}</div>
                          </td>
                          <td className="px-3 py-2 text-slate-600">{r.unit}</td>
                          <td className="px-3 py-2 text-right font-medium text-green-700">
                            {typeof r.price === "number" && isFinite(r.price)
                              ? r.price.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-center text-xs text-slate-500">
                            {r.month ? `${THAI_MONTHS[r.month]} ${r.year}` : "—"}
                          </td>
                        </tr>
                      ))}
                      {rows.length === 0 && (
                        <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-500">ไม่พบรายการ — ลองเปลี่ยนคำค้น หมวด จังหวัด หรือปี</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {pTab === "mine" && (
              <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 text-left text-slate-600">
                    <tr>
                      <th className="px-3 py-2 font-medium">รายการ</th>
                      <th className="px-3 py-2 font-medium">หมวด</th>
                      <th className="px-3 py-2 font-medium">หน่วย</th>
                      <th className="px-3 py-2 text-right font-medium">ราคา (บาท)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mine
                      .filter((e) => { const qq = pQ.trim(); return !qq || e.name.includes(qq) || (e.note ?? "").includes(qq); })
                      .map((e) => (
                        <tr key={e.id} onClick={() => pickMine(e)} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-2">
                            <div className="text-slate-800">{e.name}</div>
                            {e.note && <div className="text-xs text-slate-500">{e.note}</div>}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{e.category}</td>
                          <td className="px-3 py-2 text-slate-600">{e.unit}</td>
                          <td className="px-3 py-2 text-right font-medium text-green-700">
                            {e.price.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    {mine.filter((e) => { const qq = pQ.trim(); return !qq || e.name.includes(qq) || (e.note ?? "").includes(qq); }).length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
                          ยังไม่มีรายการในคลังของฉัน (หรือไม่ตรงคำค้น) — เพิ่มได้ที่{" "}
                          <a href="/my-prices" target="_blank" rel="noopener noreferrer" className="underline">หน้า คลังราคาของฉัน</a>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
