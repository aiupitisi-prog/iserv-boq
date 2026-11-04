"use client";

import { useEffect, useState } from "react";
import { BoqItem, BoqProject, itemTotal, newId, projectTotal, sectionTotals, thb } from "@/lib/boq";
import { loadProjects, saveProjects } from "@/lib/storage";

export default function BoqEditor({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<BoqProject | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const list = loadProjects();
    setProject(list.find((p) => p.id === projectId) ?? null);
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

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
            {project.items.map((it) => (
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
            ))}
            {project.items.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-500">ยังไม่มีรายการ BOQ — กด เพิ่มรายการ เพื่อเริ่ม</td></tr>
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
    </div>
  );
}
