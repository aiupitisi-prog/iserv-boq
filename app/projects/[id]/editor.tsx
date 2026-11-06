"use client";

import { useEffect, useState } from "react";
import { BoqItem, BoqProject, PriceSource, itemTotal, newId, projectTotal, sectionTotals, thb } from "@/lib/boq";
import { loadProjects, saveProjects } from "@/lib/storage";

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
// ถ้าไม่รู้เดือนอ้างอิง (month = null) นับจากปีอย่างเดียวแบบ conservative
function priceAgeMonths(src: PriceSource): number | null {
  const now = new Date();
  const nowM = (now.getFullYear() + 543) * 12 + (now.getMonth() + 1);
  if (!src.month) return (now.getFullYear() + 543 - src.year) * 12;
  return nowM - (src.year * 12 + src.month);
}

export default function BoqEditor({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<BoqProject | null>(null);
  const [loaded, setLoaded] = useState(false);

  // state ของ picker "เลือกจากคลังราคา"
  const [pickerOpen, setPickerOpen] = useState(false);
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

  useEffect(() => {
    const list = loadProjects();
    setProject(list.find((p) => p.id === projectId) ?? null);
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // debounce ช่องค้นหาใน picker
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(pQ), 400);
    return () => clearTimeout(t);
  }, [pQ]);

  // ค้นหาราคาเมื่อเงื่อนไขใน picker เปลี่ยน (เรียกผ่าน API ฝั่งเซิร์ฟเวอร์ — TPSO ไม่มี CORS)
  useEffect(() => {
    if (!pickerOpen) return;
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
  }, [pickerOpen, pProv, pYear, pCat, debouncedQ]);

  function update(next: BoqProject | null) {
    setProject(next);
    if (next) {
      const list = loadProjects().map((p) => (p.id === projectId ? next : p));
      saveProjects(list);
    }
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
    setPickerOpen(true);
    if (!meta) {
      setMetaErr(null);
      fetch("/api/prices/meta")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("โหลดรายชื่อจังหวัดไม่สำเร็จ (สถานะ " + r.status + ")"))))
        .then((m: Meta) => setMeta(m))
        .catch((e) => setMetaErr(e instanceof Error ? e.message : "โหลดรายชื่อจังหวัดไม่สำเร็จ"));
    }
  }

  // เลือกรายการจากคลังราคา → เพิ่มแถว BOQ พร้อมบันทึก PriceEvidence
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

  function removeItem(id: string) {
    if (!project) return;
    update({ ...project, items: project.items.filter((it) => it.id !== id) });
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <input
        value={project.name}
        onChange={(e) => update({ ...project, name: e.target.value })}
        className="mb-1 w-full rounded-lg border border-transparent bg-transparent text-2xl font-bold text-blue-950 hover:border-slate-300 focus:border-blue-400"
      />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <input
          value={project.address}
          onChange={(e) => update({ ...project, address: e.target.value })}
          placeholder="ที่ตั้งงาน"
          className="rounded-lg border border-transparent bg-transparent text-sm text-slate-600 hover:border-slate-300 focus:border-blue-400"
        />
        <div className="no-print flex gap-2">
          <button onClick={openPicker} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">เลือกจากคลังราคา</button>
          <button onClick={addItem} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">เพิ่มรายการ</button>
          <button onClick={downloadJson} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">ส่งออก JSON</button>
          <button onClick={() => window.print()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">พิมพ์เอกสาร</button>
          <a href="/projects" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">กลับ</a>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-slate-600">
            <tr>
              <th className="px-3 py-3 font-medium">รายการงาน</th>
              <th className="px-3 py-3 font-medium">หน่วย</th>
              <th className="w-28 px-3 py-3 text-right font-medium">ปริมาณ</th>
              <th className="w-32 px-3 py-3 text-right font-medium">ราคา/หน่วย</th>
              <th className="w-32 px-3 py-3 text-right font-medium">รวมเงิน</th>
              <th className="no-print w-10 px-2 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {project.items.map((it) => {
              const age = it.source ? priceAgeMonths(it.source) : null;
              const stale = age !== null && age > 12;
              const edited = it.source !== undefined && typeof it.price === "number" && it.price !== it.source.priceAtPick;
              return (
                <tr key={it.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td colSpan={1}>
                    <div className="flex items-baseline gap-2 px-0 py-2">
                      <span className="hidden rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500 sm:inline">{it.section}</span>
                      <input
                        value={it.name}
                        onChange={(e) => patchItem(it.id, { name: e.target.value })}
                        placeholder="ชื่อรายการงาน"
                        className="w-full rounded border border-transparent bg-transparent px-1 py-1 hover:border-slate-200 focus:border-blue-400"
                      />
                    </div>
                    {it.source && (
                      <span
                        className={`ml-1 inline-block rounded px-1.5 py-0.5 text-[11px] sm:ml-[calc(5rem+0.5rem)] ${stale ? "bg-amber-100 text-amber-900" : "bg-blue-100 text-blue-800"}`}
                        title={`ราคา สนค. ณ ตอนเลือก: ${thb(it.source.priceAtPick)}${edited ? " — ผู้ใช้แก้ราคาเองแล้ว" : ""}`}
                      >
                        สนค. {it.source.provName} · {it.source.month ? `${THAI_MONTHS[it.source.month]} ${it.source.year}` : it.source.year}
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
                  <td className="px-3 py-2 text-right font-medium text-slate-800">{thb(itemTotal(it))}</td>
                  <td className="no-print px-2 py-2 text-center">
                    <button onClick={() => removeItem(it.id)} className="text-slate-400 hover:text-red-600" aria-label="ลบรายการ">✕</button>
                  </td>
                </tr>
              );
            })}
            {project.items.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-500">ยังไม่มีรายการ BOQ — กด เลือกจากคลังราคา หรือ เพิ่มรายการ เพื่อเริ่ม</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 font-semibold text-blue-950">
              <td colSpan={4} className="px-3 py-3 text-right">รวมทั้งโครงการ</td>
              <td colSpan={2} className="px-3 py-3 text-right text-lg text-green-700">{thb(projectTotal(project))}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Disclaimer ถาวร — ห้ามลบ (แสดงตอนพิมพ์ด้วย เพราะเอกสารพิมพ์ติด badge ที่มาราคา) */}
      <p className="mt-4 text-xs text-slate-500">
        ราคาที่อ้างอิงจากคลังราคา สนค. (สำนักงานนโยบายและแผนการขนส่ง) เป็นราคากลางท้องถิ่นเพื่อประกอบการประมาณการ —
        ไม่ใช่ราคามาตรฐานของกรมบัญชีกลางหรือหน่วยงานใด ควรปรับตามราคาจริงของพื้นที่ก่อนใช้ประกอบการจัดซื้อจัดจ้าง
      </p>

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
              <h2 className="text-lg font-semibold text-blue-950">เลือกรายการจากคลังราคา สนค. (TPSO)</h2>
              <button onClick={() => setPickerOpen(false)} className="text-slate-400 hover:text-red-600" aria-label="ปิด">✕</button>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              ราคาอ้างอิงจากสำนักงานนโยบายและแผนการขนส่ง (สนค.) — ไม่ใช่ราคามาตรฐานของกรมบัญชีกลางหรือหน่วยงานใด
              ควรปรับตามราคาจริงของพื้นที่ก่อนใช้ประกอบการจัดซื้อจัดจ้าง
            </p>

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

            {pProv === "10" && (
              <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                หมายเหตุ: สนค. มีประกาศยกเลิกการเผยแพร่ราคาส่วนกลางหลายช่วงเดือน — แนะนำเลือกจังหวัดเพื่อใช้ราคารายจังหวัด
              </div>
            )}

            {metaErr && (
              <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                โหลดรายชื่อจังหวัด/หมวดไม่สำเร็จ ({metaErr}) — ลองปิดหน้าต่างนี้แล้วเปิดใหม่ หรือตรวจข้อมูลที่{" "}
                <a href="https://index.tpso.go.th/construction-material-prices" target="_blank" rel="noopener noreferrer" className="underline">index.tpso.go.th ↗</a>
              </div>
            )}

            {pLoading && (
              <div className="py-12 text-center text-sm text-slate-500">
                กำลังดึงราคาจาก สนค. … (ครั้งแรกของจังหวัด/ปีที่เลือกอาจใช้เวลาถึง 30 วินาที)
              </div>
            )}

            {!pLoading && pErr && (
              <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                ดึงข้อมูลราคาไม่สำเร็จ ({pErr}) — ลองอีกครั้ง หรือตรวจข้อมูลที่{" "}
                <a href="https://index.tpso.go.th/construction-material-prices" target="_blank" rel="noopener noreferrer" className="underline">index.tpso.go.th ↗</a>
              </div>
            )}

            {!pLoading && !pErr && (
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
          </div>
        </div>
      )}
    </div>
  );
}
