"use client";

import { useEffect, useRef, useState } from "react";
import { newId } from "@/lib/boq";
import { downloadPricelistJson, importPricelist, loadPricelist, PRICE_CATEGORIES, PrivatePrice, PrivatePriceCategory, savePricelist } from "@/lib/pricelist";

export default function MyPricesPage() {
  const [entries, setEntries] = useState<PrivatePrice[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", unit: "วัน", price: "", category: "ค่าแรง" as PrivatePriceCategory, note: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadPricelist().then(setEntries);
    setLoaded(true);
  }, []);

  function persist(next: PrivatePrice[]) {
    setEntries(next);
    savePricelist(next);
  }

  function patchEntry(id: string, patch: Partial<PrivatePrice>) {
    persist(entries.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e)));
  }

  function addEntry() {
    if (!draft.name.trim()) return;
    const e: PrivatePrice = {
      id: newId(),
      name: draft.name.trim(),
      unit: draft.unit.trim() || "หน่วย",
      price: parseFloat(draft.price) || 0,
      category: draft.category,
      note: draft.note.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    persist([e, ...entries]);
    setDraft({ name: "", unit: e.unit, price: "", category: draft.category, note: "" });
  }

  function remove(id: string) {
    persist(entries.filter((e) => e.id !== id));
  }

  function importJson(file: File) {
    file.text().then(async (text) => {
      const res = await importPricelist(text);
      setEntries(await loadPricelist());
      setMsg(res.ok ? `นำเข้าสำเร็จ — เพิ่ม ${res.added} รายการ, อัปเดต ${res.updated} รายการ` : `นำเข้าไม่สำเร็จ: ${res.error}`);
    });
  }

  if (!loaded) return <div className="mx-auto max-w-6xl px-4 py-10 text-slate-500">กำลังโหลด…</div>;

  const filtered = entries.filter((e) => {
    if (cat && e.category !== cat) return false;
    if (q && !(e.name.includes(q) || (e.note ?? "").includes(q))) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-blue-950">คลังราคาของฉัน</h1>
          <p className="text-sm text-slate-600">ราคาส่วนตัวที่ไม่มีใน สนค. เช่น ค่าแรง อุปกรณ์ วัสดุท้องถิ่น — เก็บในอุปกรณ์เครื่องนี้</p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <a href="/projects" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">กลับหน้าโครงการ</a>
          <button onClick={() => void downloadPricelistJson()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">ส่งออก JSON</button>
          <button onClick={() => fileRef.current?.click()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">นำเข้า JSON</button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ""; }} />
        </div>
      </div>

      {msg && <div className="no-print mb-4 rounded-lg border border-blue-300 bg-blue-50 p-3 text-xs text-blue-900">{msg}</div>}

      {/* ฟอร์มเพิ่มรายการ */}
      <div className="no-print mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 font-semibold">เพิ่มรายการใหม่</h2>
        <div className="grid gap-3 sm:grid-cols-12">
          <label className="block text-sm sm:col-span-4">
            <span className="mb-1 block text-slate-600">ชื่อรายการ *</span>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="เช่น ค่าแรงช่างไม้ (วันละ)" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-slate-600">หน่วย</span>
            <input value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
              placeholder="วัน / ลบ.ม. / งาน" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-slate-600">ราคา (บาท)</span>
            <input type="number" step="any" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right" />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-slate-600">หมวด</span>
            <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as PrivatePriceCategory })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
              {PRICE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-slate-600">ที่มาของราคา (แนะนำ)</span>
            <input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              placeholder="เช่น ค่าแรงจริง ต.ค. 69" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
        </div>
        <button onClick={addEntry} className="mt-3 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">เพิ่มรายการ</button>
      </div>

      {/* กรอง/ค้นหา */}
      <div className="no-print mb-3 flex flex-wrap gap-2">
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">ทุกหมวด</option>
          {PRICE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาในคลังของฉัน"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-slate-600">
            <tr>
              <th className="px-3 py-3 font-medium">รายการ</th>
              <th className="px-3 py-3 font-medium">หมวด</th>
              <th className="px-3 py-3 font-medium">หน่วย</th>
              <th className="px-3 py-3 text-right font-medium">ราคา (บาท)</th>
              <th className="px-3 py-3 font-medium">ที่มา / หมายเหตุ</th>
              <th className="no-print w-10 px-2 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2">
                  <input value={e.name} onChange={(ev) => patchEntry(e.id, { name: ev.target.value })}
                    className="w-full rounded border border-transparent bg-transparent px-1 py-1 hover:border-slate-200 focus:border-blue-400" />
                </td>
                <td className="px-3 py-2">
                  <select value={e.category} onChange={(ev) => patchEntry(e.id, { category: ev.target.value as PrivatePriceCategory })}
                    className="rounded border border-transparent bg-transparent px-1 py-1 text-slate-600 hover:border-slate-200">
                    {PRICE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input value={e.unit} onChange={(ev) => patchEntry(e.id, { unit: ev.target.value })}
                    className="w-20 rounded border border-transparent bg-transparent px-1 py-1 hover:border-slate-200 focus:border-blue-400" />
                </td>
                <td className="px-3 py-2 text-right">
                  <input type="number" step="any" value={e.price} onChange={(ev) => patchEntry(e.id, { price: parseFloat(ev.target.value) || 0 })}
                    className="w-28 rounded border border-transparent bg-transparent px-1 py-1 text-right hover:border-slate-200 focus:border-blue-400" />
                </td>
                <td className="px-3 py-2">
                  <input value={e.note ?? ""} onChange={(ev) => patchEntry(e.id, { note: ev.target.value })} placeholder="ที่มาของราคา"
                    className="w-full rounded border border-transparent bg-transparent px-1 py-1 hover:border-slate-200 focus:border-blue-400" />
                </td>
                <td className="no-print px-2 py-2 text-center">
                  <button onClick={() => remove(e.id)} className="text-slate-400 hover:text-red-600" aria-label="ลบรายการ">✕</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-slate-500">
                  {entries.length === 0 ? "ยังไม่มีรายการในคลังของฉัน — เพิ่มรายการแรกด้านบน (เช่น ค่าแรงช่าง, เครน, วัสดุท้องถิ่น)" : "ไม่พบรายการที่ตรงกับเงื่อนไข"}
                </td>
              </tr>
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-300 font-semibold text-blue-950">
                <td colSpan={3} className="px-3 py-3 text-right">{filtered.length} รายการ</td>
                <td colSpan={3} className="px-3 py-3 text-left text-sm font-normal text-slate-500">ราคาในตารางเป็นราคาต่อหน่วย — ใช้คลิกเพิ่มลง BOQ ได้จากปุ่ม เลือกจากคลังราคา ในหน้าจัดทำ BOQ</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        ราคาในคลังนี้เป็นข้อมูลของผู้ใช้ป้อนเอง — ไม่ใช่ราคามาตรฐานของกรมบัญชีกลางหรือหน่วยงานใด
        และไม่ใช่ราคากลางตามหลักเกณฑ์ ควรบันทึกที่มาของราคา (note) ทุกครั้งเพื่อความโปร่งใส
      </p>
    </div>
  );
}
