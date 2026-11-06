"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BoqProject, BOQ_TYPES, newId, SAMPLES, thb, projectTotal } from "@/lib/boq";
import { loadProjects, saveProjects } from "@/lib/storage";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<BoqProject[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [mode, setMode] = useState<"gov" | "private">("gov");
  const [boqType, setBoqType] = useState<BoqProject["boqType"]>("ปร.1");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setProjects(loadProjects());
    // รับ ?mode=private จากลิงก์ "เริ่ม BOQ เอกชน" (อ่านผ่าน location ตรง ๆ กันปัญหา Suspense)
    if (typeof window !== "undefined" && window.location.search.includes("mode=private")) {
      setMode("private");
      setCreating(true);
    }
    setLoaded(true);
  }, []);

  function persist(next: BoqProject[]) {
    setProjects(next);
    saveProjects(next);
  }

  function createProject() {
    const p: BoqProject = {
      id: newId(),
      name: name.trim() || "โครงการใหม่",
      address: address.trim(),
      boqType: mode === "gov" ? boqType : "ปร.1", // boqType ใช้กับแบบฟอร์มราชการ — โหมดเอกชนแสดง badge แยกจาก mode
      createdAt: new Date().toISOString(),
      items: [],
      mode,
    };
    persist([p, ...projects]);
    setCreating(false);
    setName("");
    setAddress("");
  }

  function addSample(key: "small" | "large") {
    const s = SAMPLES.find((x) => x.key === key);
    if (!s) return;
    const p: BoqProject = {
      id: newId(),
      name: key === "small" ? "ตัวอย่าง BOQ เล็ก" : "ตัวอย่าง BOQ ใหญ่",
      address: "ตัวอย่าง — แก้ไขได้ภายหลัง",
      boqType: "ปร.1",
      createdAt: new Date().toISOString(),
      items: s.items.map((it) => ({ ...it, id: newId() })),
      mode: "gov",
    };
    persist([p, ...projects]);
  }

  // คัดลอกโปรเจกต์ (F2.3) — ทำซ้ำ BOQ เดิมมาแก้ (รวม factors/จังหวัด/ปี — ไม่คัดลอก id)
  function duplicateProject(p: BoqProject) {
    const copy: BoqProject = {
      ...p,
      id: newId(),
      name: `${p.name} (คัดลอก)`,
      createdAt: new Date().toISOString(),
      items: p.items.map((it) => ({ ...it, id: newId() })),
    };
    persist([copy, ...projects]);
  }

  function remove(id: string) {
    persist(projects.filter((p) => p.id !== id));
  }

  function exportJson(p: BoqProject) {
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `boq-${p.name}-${p.id.slice(0, 6)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(file: File) {
    file.text().then((text) => {
      try {
        const data = JSON.parse(text) as BoqProject;
        const p: BoqProject = { ...data, id: newId(), name: data.name + " (นำเข้า)" };
        persist([p, ...projects]);
      } catch {
        alert("ไฟล์ JSON ไม่ถูกต้อง");
      }
    });
  }

  if (!loaded) return <div className="mx-auto max-w-6xl px-4 py-10 text-slate-500">กำลังโหลด…</div>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-blue-950">โครงการราคากลาง</h1>
          <p className="text-sm text-slate-600">BOQ งานก่อสร้าง · เก็บข้อมูลในอุปกรณ์เป็นค่าเริ่มต้น</p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <button onClick={() => setCreating((v) => !v)} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">
            สร้างโปรเจกต์
          </button>
          <button onClick={() => addSample("small")} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">
            โหลด BOQ เล็ก (ตัวอย่าง)
          </button>
          <button onClick={() => addSample("large")} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">
            โหลด BOQ ใหญ่ (ตัวอย่าง)
          </button>
          <button onClick={() => fileRef.current?.click()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">
            นำเข้า JSON
          </button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ""; }} />
        </div>
      </div>

      {creating && (
        <div className="no-print mb-6 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 font-semibold">สร้างโปรเจกต์ BOQ</h2>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">โหมดโปรเจกต์</span>
              <select value={mode} onChange={(e) => setMode(e.target.value as "gov" | "private")}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
                <option value="gov">ราชการ — แบบฟอร์ม ปร.1–ปร.4 (ราคาวัสดุ-แรงงาน)</option>
                <option value="private">เอกชน — ใบเสนอราคา (ประมาณการ เปิดปัจจัย % ได้)</option>
              </select>
            </label>
            {mode === "gov" && (
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">แบบฟอร์ม</span>
                <select value={boqType} onChange={(e) => setBoqType(e.target.value as BoqProject["boqType"])}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
                  {BOQ_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">ชื่อโครงการ</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น อาคารสำนักงานสาขาภูเก็ต"
                className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">ที่ตั้งงาน</span>
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="เช่น ต.สามพัน อ.เมือง จ.สุราษฎร์ธานี"
                className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
          </div>
          {mode === "private" && (
            <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              โหมดเอกชน: สรุปท้ายตารางจะมีปัจจัยราคาเสนอ (เงินเผื่อจำเป็น กำไร+โอเวอร์เฮด S.W.C. VAT) ที่คุณตั้งเอง —
              ผลลัพธ์เป็น "ประมาณการ" เท่านั้น ไม่ใช่ราคากลางตามหลักเกณฑ์
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button onClick={createProject} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
              ยืนยันสร้างโปรเจกต์
            </button>
            <button onClick={() => setCreating(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-16 text-center">
          <h2 className="mb-2 text-lg font-medium text-slate-700">ยังไม่มีโครงการ</h2>
          <p className="mb-4 text-sm text-slate-500">สร้างโปรเจกต์แรกเพื่อเริ่มจัดทำ BOQ และเอกสารประมาณราคา</p>
          <button onClick={() => setCreating(true)} className="rounded-lg bg-blue-700 px-5 py-2 text-sm font-medium text-white hover:bg-blue-800">
            สร้างโปรเจกต์แรก
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <div key={p.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-2 flex items-start justify-between gap-2">
                {p.mode === "private" ? (
                  <span className="rounded bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800">เอกชน · ประมาณการ</span>
                ) : (
                  <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800">{p.boqType}</span>
                )}
                <button onClick={() => remove(p.id)} className="no-print text-xs text-slate-400 hover:text-red-600">ลบ</button>
              </div>
              <h3 className="font-semibold text-blue-950">{p.name}</h3>
              <p className="mb-1 text-sm text-slate-500">{p.address || "—"}</p>
              <p className="mb-1 text-xs text-slate-400">{p.items.length} รายการ · สร้าง {new Date(p.createdAt).toLocaleDateString("th-TH")}</p>
              <p className="mb-4 text-lg font-semibold text-green-700">{thb(projectTotal(p))}</p>
              <div className="mt-auto flex gap-2">
                <Link href={`/projects/${p.id}`} className="no-print flex-1 rounded-lg bg-slate-100 px-3 py-2 text-center text-sm hover:bg-slate-200">
                  เปิดจัดทำ BOQ
                </Link>
                <button onClick={() => duplicateProject(p)} className="no-print rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50" title="คัดลอกโปรเจกต์นี้มาแก้ต่อ">คัดลอก</button>
                <button onClick={() => exportJson(p)} className="no-print rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
                  ส่งออก
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
