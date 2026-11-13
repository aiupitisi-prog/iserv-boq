"use client";

// ชุดเอกสารรายงาน 9 ชิ้นตามข้อ 11 เล่ม 2 — หลักเกณฑ์การคำนวณราคากลางงานก่อสร้าง พ.ศ. 2569 (มีผล 9 มิ.ย. 2569)
// (1) แบบ ปร.1(ก) · (2) แบบ ปร.1 ต่องาน/กลุ่มงาน · (3) แบบ ปร.2(ก) · (4) แบบ ปร.2 · (5) แบบ ปร.3 (ถ้ามี)
// (6) แบบแสดงการคำนวณและเหตุผลความจำเป็นสำหรับค่าใช้จ่ายพิเศษ · (7) แบบ ปร.4
// (8) รายละเอียดการหาค่า Factor F · (9) แบบบันทึกแสดงเหตุผลการสืบราคาวัสดุก่อสร้าง
//
// โครงแบบฟอร์มเลียนจากต้นฉบับเล่ม 2 จริง (docs/xy.pdf หน้า 6–13 — สกัดเก็บไว้เพื่อตรวจย้อนหลัง)
// ตัวเลขทั้งหมดมาจาก lib/report2569 (pure builder) → lib/calc (เครื่องยนต์, สตางค์ integer)
// พิมพ์ A4 ขาวดำ · แต่ละ .doc-sheet ขึ้นหน้าใหม่เอง · ฟอร์มกรอกข้อมูลประกอบเป็น no-print

import { useEffect, useState } from "react";
import type { BoqItem, BoqProject, Committee, SpecialExpense } from "@/lib/boq";
import { loadProjects, saveProject } from "@/lib/storage";
import { loadRulesets, rulesetStatus, Ruleset } from "@/lib/ruleset";
import { computeGovBOQSafe } from "@/lib/calc/compute";
import { buildReg2569Report, type Reg2569Report } from "@/lib/report2569";
import { formatSatang, satangToBaht } from "@/lib/calc/money";
import { bahtText } from "@/lib/bahttext";

function thDate(d: Date): string {
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
}
const fmt = (s: number): string => formatSatang(s); // สตางค์ → ข้อความเงิน
const fmtBaht = (n: number): string =>
  isFinite(n) ? n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
const fmtQty = (n: number): string => (isFinite(n) ? n.toLocaleString("th-TH", { maximumFractionDigits: 4 }) : "—");
const thb = (s: number): number => satangToBaht(s);

const td = "border border-slate-300 px-2 py-1 align-top";
const tdr = "border border-slate-300 px-2 py-1 text-right align-top";
const inputCls = "mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm";
const lbl = "text-xs text-slate-700";

// — หัวแบบฟอร์มราชการ (ตามต้นฉบับ: งานหรือกลุ่มงาน / ชื่อโครงการ / สถานที่ / แบบเลขที่ / หน่วยงาน / วันที่คำนวณ) —
function FormHead({
  project,
  committee,
  groupLabel,
  extra,
}: {
  project: BoqProject;
  committee?: Committee;
  groupLabel?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="mb-2 text-sm leading-7">
      {groupLabel !== undefined && (
        <p><b>งานหรือกลุ่มงาน</b> {groupLabel || "……………………………………"}</p>
      )}
      <p><b>ชื่อโครงการงานก่อสร้าง</b> {project.name || "……………………………………"}</p>
      <div className="flex flex-wrap justify-between gap-x-6">
        <span><b>สถานที่ก่อสร้าง</b> {project.address || "………………………"}</span>
        <span><b>แบบเลขที่</b> {committee?.formNo || "……………"}</span>
      </div>
      <p><b>หน่วยงานเจ้าของโครงการงานก่อสร้าง</b> {committee?.agency || "……………………………………"}</p>
      {extra}
      <div className="flex flex-wrap justify-between gap-x-6">
        <span><b>คำนวณราคากลาง เมื่อวันที่</b> {committee?.calcDate || "……………"}</span>
        <span>หน่วย : บาท</span>
      </div>
    </div>
  );
}

// — ช่องลงนาม: ประธานกรรมการกำหนดราคากลาง / กรรมการกำหนดราคากลาง ×2 (ตามต้นฉบับแบบสรุป) —
function CommitteeSig({ committee }: { committee?: Committee }) {
  const cols: [string, string | undefined][] = [
    ["ประธานกรรมการกำหนดราคากลาง", committee?.chairman],
    ["กรรมการกำหนดราคากลาง", committee?.member1],
    ["กรรมการกำหนดราคากลาง", committee?.member2],
  ];
  return (
    <div className="doc-sign-row mt-10 grid grid-cols-3 gap-4 text-center text-sm">
      {cols.map(([role, name]) => (
        <div key={role}>
          <div className="h-16"></div>
          <div className="border-t border-slate-400 pt-1 text-slate-700">({name || "…………"})</div>
          <div className="mt-1 text-xs text-slate-500">{role}</div>
          <div className="text-xs text-slate-500">วันที่ ……………… / ……………… / ………………</div>
        </div>
      ))}
    </div>
  );
}

// — ช่องลงนามผู้จัดทำ/ผู้ตรวจสอบ (แผ่นรายละเอียด ปร.1/ปร.2 — เสริมตามข้อความ "แบบฟอร์มปรับปรุงได้" ของต้นฉบับ) —
function PreparedSig() {
  return (
    <div className="doc-sign-row mt-8 grid grid-cols-2 gap-4 text-center text-sm">
      {["ผู้จัดทำราคากลาง", "ผู้ตรวจสอบราคากลาง"].map((role) => (
        <div key={role}>
          <div className="h-14"></div>
          <div className="mx-8 border-t border-slate-400 pt-1 text-slate-700">( ……………… )</div>
          <div className="mt-1 text-xs text-slate-500">{role}</div>
        </div>
      ))}
    </div>
  );
}

function FormNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-xs leading-5 text-slate-600">{children}</p>;
}

// ป้ายแจ้งเตือนที่พิมพ์ออกมาด้วย (กฎเหล็ก: unverified ต้องมองเห็นในเอกสาร — F3: ขอบชัดตอนพิมพ์)
function PrintWarnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="print-warn mt-3 rounded border border-amber-400 p-2 text-xs leading-5 text-amber-900">
      <b>คำเตือน (unverified):</b>
      <ul className="ml-4 list-disc">
        {warnings.map((w, i) => <li key={i}>{w}</li>)}
      </ul>
    </div>
  );
}

// — กล่องเงื่อนไขการใช้ตาราง Factor F (ในแบบ ปร.1(ก) — อัตราทั้ง 4 จากตารางที่เลือก เท่านั้น) —
function FactorFCondBox({ info }: { info: Reg2569Report["factorFDetail"] }) {
  return (
    <div className="mt-3 inline-block rounded border border-slate-300 px-4 py-2 text-sm leading-7">
      <b>เงื่อนไขการใช้ตาราง Factor F</b>
      {info.table ? (
        <>
          <p>อัตราเงินค่าจ้างล่วงหน้า {info.table.advancePct}%</p>
          <p>อัตราเงินประกันผลงาน {info.table.retentionPct}%</p>
          <p>อัตราดอกเบี้ยเงินกู้ {info.table.interestPct}%</p>
          <p>อัตราภาษีมูลค่าเพิ่ม {info.table.vatPct}%</p>
        </>
      ) : (
        <p className="print-warn rounded border border-amber-400 px-2 py-1">ยังไม่มีตาราง Factor F ที่เลือกได้ — ยังไม่ปรับ (F = 1) — unverified: ต้องนำเข้าตารางจากเอกสารทางการก่อนใช้จริง</p>
      )}
    </div>
  );
}

export default function Reg2569Client({ projectId }: { projectId: string }) {
  const [loaded, setLoaded] = useState(false);
  const [project, setProject] = useState<BoqProject | null>(null);
  const [rulesets, setRulesets] = useState<Ruleset[]>([]);
  const [only, setOnly] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const list = await loadProjects();
      setProject(list.find((p) => p.id === projectId) ?? null);
      setRulesets(loadRulesets());
      setLoaded(true);
    })();
  }, [projectId]);

  useEffect(() => {
    const reset = () => setOnly(null);
    window.addEventListener("afterprint", reset);
    return () => window.removeEventListener("afterprint", reset);
  }, []);

  function printOne(i: number) {
    setOnly(i);
    setTimeout(() => window.print(), 80);
  }

  if (!loaded) return <div className="mx-auto max-w-4xl px-4 py-10 text-slate-500">กำลังโหลด…</div>;

  if (!project) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="mb-2 text-xl font-semibold text-slate-700">ไม่พบโครงการนี้ในอุปกรณ์</h1>
        <a href="/projects" className="rounded-lg bg-blue-700 px-4 py-2 text-sm text-white hover:bg-blue-800">กลับหน้าโครงการ</a>
      </div>
    );
  }

  if (project.mode === "private") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="mb-2 text-xl font-semibold text-slate-700">ชุด 9 ชิ้นสำหรับโหมดราชการ (ราคากลาง) เท่านั้น</h1>
        <p className="mb-4 text-sm text-slate-500">โปรเจกต์นี้เป็นโหมดเอกชน (ใบเสนอราคา) — ไม่ใช่ราคากลางตามหลักเกณฑ์</p>
        <a href={`/projects/${projectId}`} className="rounded-lg bg-blue-700 px-4 py-2 text-sm text-white hover:bg-blue-800">กลับ editor</a>
      </div>
    );
  }

  // F5 — โปรเจกต์ยังไม่มีรายการงานใด ๆ → ไม่พิมพ์ (ชุด 9 ชิ้นจะว่างเปล่าทั้งชุด)
  if (project.items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="mb-2 text-xl font-semibold text-slate-700">โปรเจกต์ยังไม่มีรายการงาน</h1>
        <p className="mb-4 text-sm text-slate-500">
          ชุดเอกสาร 9 ชิ้นต้องมีรายการงานก่อสร้าง (ปร.1) หรือครุภัณฑ์ (ปร.2) อย่างน้อยหนึ่งรายการ —
          ถอดแบบและใส่รายการงานใน editor ก่อน
        </p>
        <a href={`/projects/${projectId}`} className="rounded-lg bg-blue-700 px-4 py-2 text-sm text-white hover:bg-blue-800">ไป editor</a>
      </div>
    );
  }

  const pinnedRs = rulesets.find((r) => r.id === project.rulesetId) ?? null;
  const { calc, err: calcErr } = computeGovBOQSafe(project, pinnedRs);
  const rep = calc ? buildReg2569Report(project, pinnedRs, calc) : null;
  const superseded = rulesetStatus(pinnedRs ?? undefined) === "superseded"; // B4 — ชุดกฎที่ pin ถูกแทนที่แล้ว

  if (!rep) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="mb-2 text-xl font-semibold text-slate-700">ไม่สามารถคำนวณราคากลางได้</h1>
        <p className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{calcErr}</p>
        <a href={`/projects/${projectId}`} className="rounded-lg bg-blue-700 px-4 py-2 text-sm text-white hover:bg-blue-800">กลับ editor</a>
      </div>
    );
  }

  const committee = project.committee;
  const area = project.buildingAreaSqm;
  const avgPerSqm = area && area > 0 ? thb(rep.constructionTotalSat) / area : null;
  const p1Pages = rep.p1Sheets.length;
  const today = thDate(new Date());

  const SHEETS = buildSheets({ project, committee, rep, area, avgPerSqm, p1Pages });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* ————— แถบเครื่องมือ ————— */}
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <a href={`/projects/${projectId}`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">← กลับ editor</a>
        <a href={`/projects/${projectId}/docs`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">ชุดเอกสารโครงเดิม (10 ฉบับ)</a>
        <button onClick={() => window.print()} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">พิมพ์ทั้งชุด (9 ชิ้น)</button>
        <span className="text-xs text-slate-500">รายงานการคำนวณราคากลางงานก่อสร้างอาคาร ตามข้อ 11 เล่ม 2 · หลักเกณฑ์ พ.ศ. 2569</span>
      </div>
      {rep.warnings.length > 0 && (
        <div className="no-print mb-4 rounded border border-amber-400 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          <b>คำเตือนก่อนพิมพ์ ({rep.warnings.length} ข้อ):</b>
          <ul className="ml-4 list-disc">
            {rep.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
      {superseded && (
        <div className="no-print mb-4 rounded border border-red-300 bg-red-50 p-3 text-xs leading-5 text-red-900">
          <b>ชุดกฎที่ pin ถูกแทนที่แล้ว:</b> โปรเจกต์อ้างชุดกฎ (id {project.rulesetId}) ที่มีชุดกฎใหม่มาแทน — ตัวเลขอัตราอาจไม่ตรงประกาศฉบับล่าสุด
          ไปย้ายที่ <a href="/rulesets" className="underline">หน้า ชุดกฎราคากลาง</a> ก่อนพิมพ์ใช้จริง
        </div>
      )}

      <InfoForms project={project} onSaved={setProject} />

      {/* ————— แผ่นทั้งหมด + ปุ่มพิมพ์เฉพาะชิ้น ————— */}
      {SHEETS.map((sh, i) => (
        <div key={sh.id}>
          <div className="no-print mt-6 flex items-center gap-3">
            <span className="text-xs text-slate-500">ชิ้นที่ {i + 1}/{SHEETS.length}</span>
            <span className="text-sm font-medium text-slate-700">{sh.title}</span>
            <button onClick={() => printOne(i)} className="text-xs text-blue-700 underline">พิมพ์เฉพาะชิ้นที่ {i + 1}</button>
          </div>
          <section className={`doc-sheet bg-white p-8 ${only !== null && only !== i ? "no-print" : ""}`}>
            {sh.body}
          </section>
        </div>
      ))}

      {/* ————— หัว-ท้ายกระดาษซ้ำทุกหน้าตอนพิมพ์ ————— */}
      <div className="print-header">{project.name} · รายงานราคากลาง 9 ชิ้น (ระเบียบ 2569)</div>
      <div className="print-footer">
        จัดทำด้วยระบบ iserv BOQ — ไม่ใช่ราคามาตรฐานของกรมบัญชีกลาง · พิมพ์ {today}
      </div>
    </div>
  );
}

// ————— สร้างแผ่นทั้ง 9 ชิ้นตามข้อ 11 — โครงตามต้นฉบับเล่ม 2 หน้า 6–13 —————
function buildSheets({
  project,
  committee,
  rep,
  area,
  avgPerSqm,
  p1Pages,
}: {
  project: BoqProject;
  committee?: Committee;
  rep: Reg2569Report;
  area?: number;
  avgPerSqm: number | null;
  p1Pages: number;
}): { id: string; title: string; body: React.ReactNode }[] {
  const sheets: { id: string; title: string; body: React.ReactNode }[] = [];

  // ——— ชิ้น 1: แบบ ปร.1 (ก) — แบบสรุปค่าก่อสร้าง ค่างานต้นทุน ———
  sheets.push({
    id: "p1g",
    title: "แบบ ปร.1(ก) — แบบสรุปค่าก่อสร้าง ค่างานต้นทุน (ใบปะหน้า)",
    body: (
      <>
        <div className="text-center">
          <h2 className="text-lg font-bold text-slate-900">แบบ ปร.1 (ก) แผ่นที่ ……/……</h2>
          <h3 className="font-bold text-slate-900">แบบสรุปค่าก่อสร้าง ค่างานต้นทุน</h3>
        </div>
        <FormHead
          project={project}
          committee={committee}
          extra={<p><b>แบบ ปร.1 ที่แนบ</b> จำนวน {p1Pages} หน้า</p>}
        />
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-100 text-left">
              <th className={td}>ลำดับที่</th>
              <th className={td}>รายการ</th>
              <th className={`${tdr} w-28`}>ค่างานต้นทุน</th>
              <th className={`${tdr} w-24`}>Factor F</th>
              <th className={`${tdr} w-28`}>ค่าก่อสร้าง</th>
              <th className={td}>หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {rep.groups.map((g, i) => (
              <tr key={g.section + i}>
                <td className={td}>{i + 1}.</td>
                <td className={td}>{g.section}</td>
                <td className={tdr}>{fmt(g.costSat)}</td>
                <td className={tdr}>{g.factor.toFixed(6)}</td>
                <td className={tdr}>{fmt(g.constructionSat)}</td>
                <td className={td}></td>
              </tr>
            ))}
            {rep.roundingAdjSat !== 0 && (
              <tr>
                <td className={td}></td>
                <td className={td}>ปรับปัดเศษ (ผลรวมรายกลุ่มกับการคำนวณทั้งโครงการ)</td>
                <td className={tdr}></td>
                <td className={tdr}></td>
                <td className={tdr}>{fmt(rep.roundingAdjSat)}</td>
                <td className={td}>ปัดเศษ half-up — ยอดทั้งโครงการ (ปร.4) ใช้ยอดรวมค่าก่อสร้างสุดท้ายข้างล่าง</td>
              </tr>
            )}
            <tr className="font-semibold">
              <td className={td}></td>
              <td className={td}>รวมค่างานต้นทุน / รวมค่าก่อสร้าง</td>
              <td className={tdr}>{fmt(rep.groups.reduce((a, g) => a + g.costSat, 0))}</td>
              <td className={tdr}></td>
              <td className={tdr}>{fmt(rep.constructionTotalSat)}</td>
              <td className={td}></td>
            </tr>
          </tbody>
        </table>
        <FactorFCondBox info={rep.factorFDetail} />
        <p className="mt-2 text-sm">
          ขนาดหรือเนื้อที่อาคาร จำนวน {area != null && area > 0 ? fmtQty(area) : "………"} ตารางเมตร เฉลี่ย {avgPerSqm !== null ? fmtBaht(avgPerSqm) : "………"} บาทต่อตารางเมตร
        </p>
        <FormNote>หมายเหตุ: แสดงแบบสรุปค่าก่อสร้าง รวม {fmt(rep.constructionTotalSat)} บาทต่อ 1 หน่วย</FormNote>
        <CommitteeSig committee={committee} />
        <FormNote>
          หมายเหตุ: แบบฟอร์มนี้ ผู้มีหน้าที่คำนวณราคากลางสามารถปรับปรุง เปลี่ยนแปลง และปรับใช้ได้ตามความเหมาะสม
          และสอดคล้องกับข้อเท็จจริงของโครงการงานก่อสร้างที่คำนวณราคากลาง
        </FormNote>
      </>
    ),
  });

  // ——— ชิ้น 2: แบบ ปร.1 ต่องานหรือกลุ่มงาน (หมวดงาน) ———
  rep.p1Sheets.forEach((sh, si) => {
    sheets.push({
      id: "p1-" + si,
      title: `แบบ ปร.1 ฉบับที่ ${si + 1}/${p1Pages} — ${sh.section}`,
      body: (
        <>
          <div className="text-center">
            <h2 className="text-lg font-bold text-slate-900">แบบ ปร.1 แผ่นที่ ……/……</h2>
            <h3 className="font-bold text-slate-900">แบบแสดงรายการ ปริมาณงาน และราคา ค่างานต้นทุน</h3>
          </div>
          <FormHead project={project} committee={committee} groupLabel={sh.section} />
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100 text-left">
                <th className={td}>ลำดับที่</th>
                <th className={td}>รายการ</th>
                <th className={`${tdr} w-20`}>จำนวน</th>
                <th className={td}>หน่วย</th>
                <th className={td} colSpan={2}>ค่าวัสดุ</th>
                <th className={td} colSpan={2}>ค่าแรงงาน</th>
                <th className={td}>รวมค่าวัสดุและค่าแรงงาน</th>
                <th className={td}>หมายเหตุ</th>
              </tr>
              <tr className="bg-slate-50 text-xs">
                <th className={td} colSpan={4}></th>
                <th className={tdr}>ราคาต่อหน่วย</th>
                <th className={tdr}>จำนวนเงิน</th>
                <th className={tdr}>ราคาต่อหน่วย</th>
                <th className={tdr}>จำนวนเงิน</th>
                <th className={tdr} colSpan={2}></th>
              </tr>
            </thead>
            <tbody>
              {sh.rows.map((r) => (
                <tr key={r.no}>
                  <td className={td}>{r.no}</td>
                  <td className={td}>{r.name}</td>
                  <td className={tdr}>{fmtQty(r.qty)}</td>
                  <td className={td}>{r.unit}</td>
                  <td className={tdr}>{r.matUnit !== null ? fmtBaht(r.matUnit) : "—"}</td>
                  <td className={tdr}>{r.matUnit !== null ? fmt(r.matSat) : "—"}</td>
                  <td className={tdr}>{r.labUnit !== null ? fmtBaht(r.labUnit) : "—"}</td>
                  <td className={tdr}>{r.labUnit !== null ? fmt(r.labSat) : "—"}</td>
                  <td className={tdr}>{fmt(r.totalSat)}</td>
                  <td className={td}>{r.note || ""}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className={td} colSpan={5}>รวม</td>
                <td className={tdr}>{fmt(sh.rows.reduce((a, r) => a + r.matSat, 0))}</td>
                <td className={tdr} colSpan={2}>{fmt(sh.rows.reduce((a, r) => a + r.labSat, 0))}</td>
                <td className={tdr}>{fmt(sh.sumSat)}</td>
                <td className={td}></td>
              </tr>
            </tbody>
          </table>
          <FormNote>หมายเหตุ: แสดงรายการ ปริมาณ และราคารวม …………… บาท ต่อ 1 หน่วย</FormNote>
          <FormNote>
            ราคาต่อหน่วยของแต่ละรายการปัดเศษ half-up เป็นสตางค์ก่อนคูณด้วยปริมาณ (บันทึกจุดปัดเศษของเครื่องยนต์คำนวณ)
          </FormNote>
          <PreparedSig />
        </>
      ),
    });
  });

  // ——— ชิ้น 3: แบบ ปร.2 (ก) — แบบสรุปค่าครุภัณฑ์จัดซื้อ (เฉพาะเมื่อมีครุภัณฑ์) ———
  if (rep.p2) {
    const p2 = rep.p2;
    const vatNote = p2.vatPct === null ? "ยังไม่ทราบอัตรา VAT (unverified)" : `อัตรา VAT ${p2.vatPct}% จากตาราง Factor F`;
    sheets.push({
      id: "p2g",
      title: "แบบ ปร.2(ก) — แบบสรุปค่าครุภัณฑ์จัดซื้อ (ใบปะหน้า)",
      body: (
        <>
          <div className="text-center">
            <h2 className="text-lg font-bold text-slate-900">แบบ ปร.2 (ก) แผ่นที่ ……/……</h2>
            <h3 className="font-bold text-slate-900">แบบสรุปค่าครุภัณฑ์จัดซื้อ</h3>
          </div>
          <FormHead project={project} committee={committee} extra={<p><b>แบบ ปร.2 ที่แนบ</b> จำนวน 1 หน้า</p>} />
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100 text-left">
                <th className={td}>ลำดับที่</th>
                <th className={td}>รายการ</th>
                <th className={td} colSpan={3}>ค่าครุภัณฑ์</th>
                <th className={td} colSpan={3}>ค่าติดตั้ง</th>
                <th className={td}>รวมค่าครุภัณฑ์จัดซื้อ</th>
                <th className={td}>หมายเหตุ</th>
              </tr>
              <tr className="bg-slate-50 text-xs">
                <th className={td} colSpan={2}></th>
                <th className={tdr}>ค่าครุภัณฑ์</th>
                <th className={tdr}>ค่าภาษีมูลค่าเพิ่ม</th>
                <th className={tdr}>จำนวนเงิน</th>
                <th className={tdr}>ค่าติดตั้ง</th>
                <th className={tdr}>ค่าภาษีมูลค่าเพิ่ม</th>
                <th className={tdr}>จำนวนเงิน</th>
                <th className={tdr} colSpan={2}></th>
              </tr>
            </thead>
            <tbody>
              {p2.groups.map((g, i) => (
                <tr key={g.section + i}>
                  <td className={td}>{i + 1}.</td>
                  <td className={td}>{g.section}</td>
                  <td className={tdr}>{fmt(g.equipSat)}</td>
                  <td className={tdr}>{g.equipVatSat !== null ? fmt(g.equipVatSat) : "—"}</td>
                  <td className={tdr}>{fmt(g.equipSat + (g.equipVatSat ?? 0))}</td>
                  <td className={tdr}>{g.installSat !== 0 || g.installVatSat !== null ? fmt(g.installSat) : "—"}</td>
                  <td className={tdr}>{g.installVatSat !== null ? fmt(g.installVatSat) : "—"}</td>
                  <td className={tdr}>{g.installSat !== 0 || g.installVatSat !== null ? fmt(g.installSat + (g.installVatSat ?? 0)) : "—"}</td>
                  <td className={tdr}>{fmt(g.totalSat)}</td>
                  <td className={td}>
                    {g.installMissing ? "ค่าติดตั้งยังไม่ระบุ (สืบราคาแยก)" : ""}
                    {g.installReasonMissing ? `${g.installMissing ? " · " : ""}unverified: มีรายการไม่ครบเหตุผลความจำเป็นหรือรายละเอียดการสืบราคาค่าติดตั้ง` : ""}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className={td} colSpan={2}>รวม</td>
                <td className={tdr}>{fmt(p2.rows.reduce((a, r) => a + r.equipSat, 0))}</td>
                <td className={tdr}>{p2.vatPct !== null ? fmt(p2.rows.reduce((a, r) => a + (r.equipVatSat ?? 0), 0)) : "—"}</td>
                <td className={tdr}>{fmt(p2.rows.reduce((a, r) => a + r.equipSat + (r.equipVatSat ?? 0), 0))}</td>
                <td className={tdr}>{fmt(p2.rows.reduce((a, r) => a + r.installSat, 0))}</td>
                <td className={tdr}>{p2.vatPct !== null ? fmt(p2.rows.reduce((a, r) => a + (r.installVatSat ?? 0), 0)) : "—"}</td>
                <td className={tdr}>{fmt(p2.rows.reduce((a, r) => a + r.installSat + (r.installVatSat ?? 0), 0))}</td>
                <td className={tdr}>{fmt(p2.sumSat)}</td>
                <td className={td}>{vatNote}</td>
              </tr>
            </tbody>
          </table>
          <FormNote>{vatNote} · ราคาครุภัณฑ์เป็นราคาผู้ผลิตหรือผู้จำหน่าย (ยังไม่รวมค่าภาษีมูลค่าเพิ่ม) ตามเล่ม 2 ข้อ 2.2 — ราคาครุภัณฑ์ต้องไม่มีองค์ประกอบค่าติดตั้ง</FormNote>
          <CommitteeSig committee={committee} />
          <FormNote>หมายเหตุ: แบบฟอร์มนี้ ผู้มีหน้าที่คำนวณราคากลางสามารถปรับปรุง เปลี่ยนแปลง และปรับใช้ได้ตามความเหมาะสม</FormNote>
        </>
      ),
    });

    // ——— ชิ้น 4: แบบ ปร.2 — รายละเอียดค่าครุภัณฑ์จัดซื้อ ———
    sheets.push({
      id: "p2",
      title: "แบบ ปร.2 — แบบแสดงรายการ ปริมาณงาน และราคา ค่าครุภัณฑ์จัดซื้อ",
      body: (
        <>
          <div className="text-center">
            <h2 className="text-lg font-bold text-slate-900">แบบ ปร.2 แผ่นที่ ……/……</h2>
            <h3 className="font-bold text-slate-900">แบบแสดงรายการ ปริมาณงาน และราคา ค่าครุภัณฑ์จัดซื้อ</h3>
          </div>
          <FormHead project={project} committee={committee} />
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100 text-left">
                <th className={td}>ลำดับที่</th>
                <th className={td}>รายการ</th>
                <th className={`${tdr} w-20`}>จำนวน</th>
                <th className={td}>หน่วย</th>
                <th className={td} colSpan={2}>ค่าครุภัณฑ์</th>
                <th className={td} colSpan={2}>ค่าติดตั้ง</th>
                <th className={td}>รวมค่าครุภัณฑ์</th>
                <th className={td}>หมายเหตุ</th>
              </tr>
              <tr className="bg-slate-50 text-xs">
                <th className={td} colSpan={4}></th>
                <th className={tdr}>ราคาต่อหน่วย</th>
                <th className={tdr}>จำนวนเงิน</th>
                <th className={tdr}>ราคาต่อหน่วย</th>
                <th className={tdr}>จำนวนเงิน</th>
                <th className={tdr} colSpan={2}></th>
              </tr>
            </thead>
            <tbody>
              {p2.rows.map((r) => (
                <tr key={r.no}>
                  <td className={td}>{r.no}</td>
                  <td className={td}>{r.name}</td>
                  <td className={tdr}>{fmtQty(r.qty)}</td>
                  <td className={td}>{r.unit}</td>
                  <td className={tdr}>{fmtBaht(r.equipUnit)}</td>
                  <td className={tdr}>{fmt(r.equipSat)}</td>
                  <td className={tdr}>{r.installUnit !== null ? fmtBaht(r.installUnit) : "………"}</td>
                  <td className={tdr}>{r.installUnit !== null ? fmt(r.installSat) : "………"}</td>
                  <td className={tdr}>{fmt(r.equipSat + r.installSat)}</td>
                  <td className={td}>
                    {[r.note, r.installReason && `เหตุผลค่าติดตั้ง: ${r.installReason}`, r.installSourcing && `การสืบราคาค่าติดตั้ง: ${r.installSourcing}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className={td} colSpan={5}>รวม</td>
                <td className={tdr}>{fmt(p2.rows.reduce((a, r) => a + r.equipSat, 0))}</td>
                <td className={tdr} colSpan={2}>{fmt(p2.rows.reduce((a, r) => a + r.installSat, 0))}</td>
                <td className={tdr}>{fmt(p2.rows.reduce((a, r) => a + r.equipSat + r.installSat, 0))}</td>
                <td className={td}>ยังไม่รวม VAT (แสดงที่ ปร.2(ก))</td>
              </tr>
            </tbody>
          </table>
          <FormNote>
            ราคาครุภัณฑ์เป็นราคาผู้ผลิตหรือผู้จำหน่าย (ยังไม่รวมค่าภาษีมูลค่าเพิ่ม) · กรณีที่มีความจำเป็นต้องมีค่าติดตั้ง ให้สืบราคาค่าติดตั้ง
            พร้อมแสดงเหตุผลความจำเป็นและรายละเอียดประกอบการสืบราคา (เล่ม 2 ข้อ 2.2)
          </FormNote>
          <PreparedSig />
        </>
      ),
    });
  }

  // ——— ชิ้น 5: แบบ ปร.3 — ค่าใช้จ่ายพิเศษตามข้อกำหนด (เฉพาะเมื่อมี) ———
  if (rep.p3) {
    const p3 = rep.p3;
    sheets.push({
      id: "p3",
      title: "แบบ ปร.3 — แบบแสดงรายการ ปริมาณงาน และราคา ค่าใช้จ่ายพิเศษตามข้อกำหนด",
      body: (
        <>
          <div className="text-center">
            <h2 className="text-lg font-bold text-slate-900">แบบ ปร.3 แผ่นที่ ……/……</h2>
            <h3 className="font-bold text-slate-900">แบบแสดงรายการ ปริมาณงาน และราคา ค่าใช้จ่ายพิเศษตามข้อกำหนด</h3>
          </div>
          <FormHead project={project} committee={committee} />
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100 text-left">
                <th className={td}>ลำดับที่</th>
                <th className={td}>รายการ</th>
                <th className={`${tdr} w-20`}>จำนวน</th>
                <th className={td}>หน่วย</th>
                <th className={`${tdr} w-32`}>ค่าใช้จ่ายรวม (ค่าก่อสร้าง)</th>
                <th className={td}>หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {p3.rows.map((r) => (
                <tr key={r.no}>
                  <td className={td}>{r.no}</td>
                  <td className={td}>{r.name}</td>
                  <td className={tdr}>{fmtQty(r.qty)}</td>
                  <td className={td}>{r.unit}</td>
                  <td className={tdr}>{fmt(r.amountSat)}</td>
                  <td className={td}>{r.note}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className={td} colSpan={4}>รวมค่าใช้จ่ายพิเศษตามข้อกำหนดทุกรายการ</td>
                <td className={tdr}>{fmt(p3.sumSat)}</td>
                <td className={td}></td>
              </tr>
            </tbody>
          </table>
          <FormNote>
            รายการใดที่ต้องชำระค่าภาษีมูลค่าเพิ่ม ให้รวมค่าภาษีมูลค่าเพิ่มไว้ด้วย (ข้อ 9 เล่ม 2)
            {p3.vatPct !== null ? ` — อัตรา VAT ${p3.vatPct}% จากตาราง Factor F` : " — อัตรา VAT ยังไม่ทราบ (unverified)"}
          </FormNote>
          <CommitteeSig committee={committee} />
        </>
      ),
    });

    // ——— ชิ้น 6: แบบแสดงการคำนวณและเหตุผลความจำเป็น สำหรับค่าใช้จ่ายพิเศษ (ต่อรายการ) ———
    p3.reasons.forEach((rs, ri) => {
      sheets.push({
        id: "exp-" + ri,
        title: `แบบแสดงการคำนวณและเหตุผลความจำเป็น สำหรับค่าใช้จ่ายพิเศษ — รายการ ${rs.name}`,
        body: (
          <>
            <div className="text-center">
              <h2 className="text-lg font-bold text-slate-900">หน้าที่ ……/……</h2>
              <h3 className="font-bold text-slate-900">
                แบบแสดงการคำนวณและเหตุผลความจำเป็น
                <br />
                สำหรับค่าใช้จ่ายพิเศษตามข้อกำหนด
              </h3>
            </div>
            <FormHead project={project} committee={committee} extra={<p><b>รายการ</b> {rs.name}</p>} />
            <p className="mt-2 text-sm font-semibold">1. เหตุผลและความจำเป็นที่ต้องมีค่าใช้จ่ายพิเศษตามข้อกำหนด</p>
            <p className="whitespace-pre-line rounded border border-slate-300 p-2 text-sm leading-6">
              {rs.reason || "………………………………………………………………………………………………"}
            </p>
            <p className="mt-3 text-sm font-semibold">2. รายละเอียดการคำนวณ <span className="float-right">หน่วย : บาท</span></p>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-left">
                  <th className={`${td} w-12`}>ที่</th>
                  <th className={td}>รายการค่าใช้จ่าย</th>
                  <th className={`${tdr} w-32`}>จำนวน</th>
                  <th className={td}>หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {rs.lines.map((ln, li) => (
                  <tr key={li}>
                    <td className={td}>{li + 1}</td>
                    <td className={td}>{ln.label}</td>
                    <td className={tdr}>{fmt(ln.sat)}</td>
                    <td className={td}></td>
                  </tr>
                ))}
                <tr>
                  <td className={td} colSpan={2}>รวมค่าใช้จ่าย</td>
                  <td className={tdr}>{fmt(rs.sumSat)}</td>
                  <td className={td}></td>
                </tr>
                <tr>
                  <td className={td} colSpan={2}>ค่าภาษีมูลค่าเพิ่ม (สำหรับรายการที่มีค่าภาษีมูลค่าเพิ่ม)</td>
                  <td className={tdr}>{rs.vatSat !== null ? fmt(rs.vatSat) : "………"}</td>
                  <td className={td}>{rs.vatSat !== null ? (rs.vatSat > 0 ? "มีค่าภาษีมูลค่าเพิ่ม" : "ไม่มีค่าภาษีมูลค่าเพิ่ม") : "อัตรายังไม่ทราบ (unverified)"}</td>
                </tr>
                <tr className="font-semibold">
                  <td className={td} colSpan={2}>ค่าใช้จ่ายรวมค่าภาษีมูลค่าเพิ่ม (สำหรับรายการที่มีค่าภาษีมูลค่าเพิ่ม)</td>
                  <td className={tdr}>{rs.vatSat !== null ? fmt(rs.totalSat) : fmt(rs.sumSat) + " + ………"}</td>
                  <td className={td}></td>
                </tr>
              </tbody>
            </table>
            <CommitteeSig committee={committee} />
            <FormNote>
              หมายเหตุ: 1. แบบฟอร์มนี้ ผู้มีหน้าที่คำนวณราคากลางสามารถปรับปรุง เปลี่ยนแปลง และปรับใช้ได้ตามความเหมาะสม
              และสอดคล้องกับข้อเท็จจริงสำหรับค่าใช้จ่ายพิเศษตามข้อกำหนดแต่ละรายการ
              <br />
              2. การคำนวณค่าใช้จ่ายพิเศษตามข้อกำหนด ให้ผู้มีหน้าที่คำนวณราคากลางคำนวณตามข้อเท็จจริง
              รายการใดต้องชำระค่าภาษีมูลค่าเพิ่ม ให้รวมค่าภาษีมูลค่าเพิ่มด้วย
            </FormNote>
          </>
        ),
      });
    });
  }

  // ——— ชิ้น 7: แบบ ปร.4 — แบบสรุปราคากลางงานก่อสร้างอาคาร ———
  sheets.push({
    id: "p4",
    title: "แบบ ปร.4 — แบบสรุปราคากลางงานก่อสร้างอาคาร",
    body: (
      <>
        <div className="text-center">
          <h2 className="text-lg font-bold text-slate-900">แบบ ปร.4 แผ่นที่ ……/……</h2>
          <h3 className="font-bold text-slate-900">แบบสรุปราคากลางงานก่อสร้างอาคาร</h3>
        </div>
        <FormHead
          project={project}
          committee={committee}
          extra={
            <p>
              <b>แบบ ปร.1 (ก) ปร.2 (ก) และ ปร.3 (ถ้ามี) ที่แนบ</b> จำนวน {1 + (rep.p2 ? 1 : 0) + (rep.p3 ? 1 : 0)} ชุด
              {rep.p3 ? "" : " (ไม่มี ปร.3 — ไม่มีค่าใช้จ่ายพิเศษ)"}
            </p>
          }
        />
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-100 text-left">
              <th className={`${td} w-10`}>ลำดับที่</th>
              <th className={td}>รายการ</th>
              <th className={`${tdr} w-32`}>ค่าก่อสร้าง</th>
              <th className={td}>หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={td}>1</td>
              <td className={td}><b>ค่างานต้นทุน</b></td>
              <td className={tdr}>{fmt(rep.summary.constructionSat)}</td>
              <td className={td}></td>
            </tr>
            {rep.groups.map((g, i) => (
              <tr key={g.section + i}>
                <td className={td}></td>
                <td className={td}>- {g.section}</td>
                <td className={tdr}>{fmt(g.constructionSat)}</td>
                <td className={td}></td>
              </tr>
            ))}
            {rep.roundingAdjSat !== 0 && (
              <tr>
                <td className={td}></td>
                <td className={td}>- ปรับปัดเศษ (จากแบบ ปร.1(ก))</td>
                <td className={tdr}>{fmt(rep.roundingAdjSat)}</td>
                <td className={td}></td>
              </tr>
            )}
            <tr>
              <td className={td}>2</td>
              <td className={td}><b>ค่าครุภัณฑ์จัดซื้อ</b></td>
              <td className={tdr}>{rep.p2 ? fmt(rep.p2.sumSat) : "ไม่มี"}</td>
              <td className={td}>{rep.p2 ? (rep.p2.vatPct !== null ? "รวม VAT + ค่าติดตั้งที่สืบราคา" : "รวมค่าติดตั้งที่สืบราคา — VAT ยังไม่ทราบอัตรา (unverified)") : "ไม่มีรายการครุภัณฑ์"}</td>
            </tr>
            <tr>
              <td className={td}>3</td>
              <td className={td}><b>ค่าใช้จ่ายพิเศษตามข้อกำหนด (ถ้ามี)</b></td>
              <td className={tdr}>{rep.p3 ? fmt(rep.p3.sumSat) : "ไม่มี"}</td>
              <td className={td}></td>
            </tr>
            <tr>
              <td className={td} colSpan={4}></td>
            </tr>
            <tr>
              <td className={td}></td>
              <td className={td}><b>สรุป</b></td>
              <td className={tdr}></td>
              <td className={td}></td>
            </tr>
            <tr>
              <td className={td}></td>
              <td className={td}>รวมค่าก่อสร้างทั้งโครงการงานก่อสร้าง</td>
              <td className={tdr}>{fmt(rep.summary.totalSat)}</td>
              <td className={td}></td>
            </tr>
            <tr>
              <td className={td}></td>
              <td className={td}><b>ราคากลาง</b></td>
              <td className={tdr}>{fmt(rep.summary.totalSat)}</td>
              <td className={td}>ราคากลาง = ค่าก่อสร้าง + ค่าครุภัณฑ์จัดซื้อ + ค่าใช้จ่ายพิเศษ (ข้อ 10 เล่ม 2)</td>
            </tr>
            <tr>
              <td className={td}></td>
              <td className={td} colSpan={2}>ราคากลาง ( <span className="italic">{bahtText(rep.summary.totalSat)}</span> ตัวอักษร )</td>
              <td className={td}></td>
            </tr>
          </tbody>
        </table>
        <CommitteeSig committee={committee} />
        <FormNote>หมายเหตุ: แบบฟอร์มนี้ สามารถปรับปรุงและเปลี่ยนแปลงได้ตามความเหมาะสมและสอดคล้องกับโครงการงานก่อสร้างที่คำนวณราคากลาง</FormNote>
        <PrintWarnings warnings={rep.warnings} />
      </>
    ),
  });

  // ——— ชิ้น 8: รายละเอียดการหาค่า Factor F ———
  const fd = rep.factorFDetail;
  sheets.push({
    id: "factorf",
    title: "รายละเอียดการหาค่า Factor F (ชิ้นที่ 8)",
    body: (
      <>
        <div className="text-center">
          <h2 className="text-lg font-bold text-slate-900">หน้าที่ ……/……</h2>
          <h3 className="font-bold text-slate-900">รายละเอียดการหาค่า Factor F</h3>
          <p className="text-xs text-slate-500">
            ตามข้อ 6 เล่ม 2 (นำค่างานต้นทุนทั้งโครงการไปเทียบหาค่า Factor F จากตาราง Factor F ที่เกี่ยวข้อง)
          </p>
        </div>
        <FormHead project={project} committee={committee} />
        <div className="text-sm leading-7">
          <p><b>1. ค่างานต้นทุนทั้งโครงการ (A):</b> {fmt(fd.A)} บาท ({(thb(fd.A) / 1_000_000).toLocaleString("th-TH", { maximumFractionDigits: 6 })} ล้านบาท)</p>
          <p><b>2. เงื่อนไขการใช้ตาราง Factor F</b> (ตารางที่เลือกจากชุดกฎที่ pin: {pinnedSourceLabel(project)})</p>
          <FactorFCondBox info={fd} />
          {fd.row && (
            <>
              <p className="mt-2"><b>3. แถวตารางที่ใช้:</b> ช่วงต้นทุนโดยตรง {fd.row.rangeLabel}</p>
              <p>ค่าที่ขอบล่าง ({fd.row.colLo}) = {fd.row.D} · ค่าที่ขอบบน ({fd.row.colHi}) = {fd.row.E} (คอลัมน์ที่ใช้จริง ตามข้อ 4)</p>
              <p>
                <b>วิธีหาค่า:</b>{" "}
                {fd.row.open
                  ? "ช่วงปลายเปิด — ใช้ค่าคงที่ตามประกาศ (ไม่ interpolate)"
                  : fd.row.interpolated
                    ? `Interpolate ในช่วง: F = ${fd.row.colLo} − (${fd.row.colLo} − ${fd.row.colHi}) × (A − B) / (C − B) = ${fd.row.D} − (${fd.row.D} − ${fd.row.E}) × (A − ${fd.row.B}) / (${fd.row.C} − ${fd.row.B})`
                    : fd.row.D === fd.row.E
                      ? "ช่วงค่าคงที่ — ใช้ค่าตรง"
                      : "A ตรงขอบตารางพอดี — ใช้ค่าตรง (ไม่ interpolate)"}
              </p>
              <p><b>4. คอลัมน์ที่ใช้:</b> {fd.columnLabel} (ขอบล่าง {fd.row.colLo} / ขอบบน {fd.row.colHi} ของคอลัมน์นี้)</p>
              <p>
                <b>5. ผลการคำนวณ:</b> Factor F = {fd.factor?.toFixed(6) ?? "1.000000 (ยังไม่ปรับ)"} → A × F = {fmt(fd.afterFactor)} บาท (ปัดเศษ half-up เป็นสตางค์)
              </p>
            </>
          )}
          {fd.notes.length > 0 && (
            <div className="mt-2">
              <b>บันทึกการคำนวณ (trace จากเครื่องยนต์):</b>
              <ul className="ml-4 list-disc text-xs leading-5">
                {fd.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          )}
        </div>
        <CommitteeSig committee={committee} />
        <PrintWarnings warnings={rep.warnings} />
      </>
    ),
  });

  // ——— ชิ้น 9: แบบบันทึกแสดงเหตุผลและความจำเป็นหรือรายละเอียดในการสืบและการกำหนดราคาวัสดุก่อสร้าง ———
  sheets.push({
    id: "evidence",
    title: "แบบบันทึกเหตุผลและความจำเป็นการสืบราคาวัสดุก่อสร้าง (ชิ้นที่ 9)",
    body: (
      <>
        <div className="text-center">
          <h2 className="text-lg font-bold text-slate-900">หน้าที่ ……/……</h2>
          <h3 className="font-bold text-slate-900">
            แบบบันทึกแสดงเหตุผลและความจำเป็นหรือรายละเอียด
            <br />
            ในการสืบและการกำหนดราคาวัสดุก่อสร้าง
          </h3>
        </div>
        <FormHead project={project} committee={committee} />
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-100 text-left">
              <th className={`${td} w-12`}>ลำดับที่</th>
              <th className={td}>รายการ</th>
              <th className={td}>หน่วย</th>
              <th className={`${tdr} w-24`}>ราคาที่กำหนด/หน่วย</th>
              <th className={td}>ที่มาและหลักฐานของราคา</th>
              <th className={td}>เหตุผล/หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {rep.priceEvidence.map((r) => (
              <tr key={r.no}>
                <td className={td}>{r.no}</td>
                <td className={td}>{r.name}</td>
                <td className={td}>{r.unit}</td>
                <td className={tdr}>{fmtBaht(r.unitPrice)}</td>
                <td className={td}>
                  {r.origin}
                  {r.stale && <div>⚠ {r.staleDetail} — unverified</div>}
                  {r.notYetPublished && <div>⚠ เดือนอ้างอิงเท่ากับหรือหลังเดือนที่พิมพ์ — ณ วันพิมพ์ยังไม่ปรากฏราคาส่วนกลางของ สนค. ในระบบ — unverified</div>}
                </td>
                <td className={td}>{r.reason || (r.unstated ? "ต้องกรอกเหตุผลการสืบราคา" : "")}</td>
              </tr>
            ))}
            {rep.priceEvidence.length === 0 && (
              <tr>
                <td className={td} colSpan={6}>ไม่มีรายการงานก่อสร้าง</td>
              </tr>
            )}
          </tbody>
        </table>
        {/* B1 — บันทึกเหตุผล/รายละเอียดการสืบราคา "ค่าติดตั้งครุภัณฑ์" (แยกจากราคาครุภัณฑ์ — เล่ม 2 ข้อ 2.2/ข้อ 8) */}
        {rep.installEvidence.length > 0 && (
          <>
            <p className="mt-4 text-sm font-semibold">ภาคท้าย — การสืบและการกำหนดราคาค่าติดตั้งครุภัณฑ์ (แยกจากราคาครุภัณฑ์)</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-left">
                  <th className={`${td} w-12`}>ลำดับที่</th>
                  <th className={td}>รายการ</th>
                  <th className={`${tdr} w-16`}>จำนวน</th>
                  <th className={td}>หน่วย</th>
                  <th className={`${tdr} w-24`}>ค่าติดตั้ง/หน่วย</th>
                  <th className={td}>เหตุผลความจำเป็น</th>
                  <th className={td}>รายละเอียดประกอบการสืบราคา</th>
                </tr>
              </thead>
              <tbody>
                {rep.installEvidence.map((r) => (
                  <tr key={r.no}>
                    <td className={td}>{r.no}</td>
                    <td className={td}>{r.name}</td>
                    <td className={tdr}>{fmtQty(r.qty)}</td>
                    <td className={td}>{r.unit}</td>
                    <td className={tdr}>{r.installUnit !== null ? fmtBaht(r.installUnit) : "………"}</td>
                    <td className={td}>
                      {r.reason || "…………………"}
                      {r.missingPrice && <div>⚠ ยังไม่ระบุค่าติดตั้ง — ต้องสืบราคาแยกจากราคาครุภัณฑ์ (ข้อ 8)</div>}
                    </td>
                    <td className={td}>
                      {r.sourcing || "…………………"}
                      {r.reasonMissing && (
                        <div>
                          ⚠ unverified — มีค่าติดตั้งแต่ยังไม่บันทึก
                          {!r.reason && !r.sourcing ? "เหตุผลและรายละเอียดการสืบราคา" : !r.reason ? "เหตุผลความจำเป็น" : "รายละเอียดการสืบราคา"}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <FormNote>
          ราคาครุภัณฑ์และค่าติดตั้งที่สืบราคาแยก แสดงในแบบ ปร.2/ปร.2(ก) · ราคา สนค. อ้างอิงเดือน/ปี/เขตตามหลักฐานที่บันทึก ณ ตอนเลือกราคา
          · จัดทำด้วยระบบ iserv BOQ — ไม่ใช่ราคามาตรฐานของกรมบัญชีกลาง
        </FormNote>
        <CommitteeSig committee={committee} />
        <PrintWarnings warnings={rep.warnings.filter((w) => w.includes("แหล่งที่มาราคา") || w.includes("สืบราคา"))} />
      </>
    ),
  });

  return sheets;
}

function pinnedSourceLabel(project: BoqProject): string {
  return `rulesetId ${project.rulesetId ?? "— (ยังไม่ pin ชุดกฎ)"}`;
}

// ————— ฟอร์มกรอกข้อมูลประกอบ (no-print): คณะกรรมการ/แบบเลขที่/วันที่/เนื้อที่อาคาร · ค่าใช้จ่ายพิเศษ · ค่าติดตั้งครุภัณฑ์ —
// บันทึกลงโปรเจกต์ของเครื่องนี้เท่านั้น — ฟิลด์ใหม่ optional + backward compatible (โปรเจกต์เก่าไม่มีช่องนี้ยังใช้ได้ปกติ)
function InfoForms({ project, onSaved }: { project: BoqProject; onSaved: (p: BoqProject) => void }) {
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <div className="no-print mb-6 rounded border border-blue-300 bg-blue-50 p-4 text-sm">
      <p className="mb-3 text-xs text-slate-600">
        ข้อมูลประกอบชุด 9 ชิ้น (เก็บในโปรเจกต์ของเครื่องนี้เท่านั้น) — ช่องข้อมูลจะปรากฏในแบบฟอร์มพิมพ์โดยอัตโนมัติ
      </p>
      <CommitteeForm project={project} onSaved={onSaved} busy={busy} setBusy={setBusy} />
      <SpecialExpenseForm project={project} onSaved={onSaved} busy={busy} setBusy={setBusy} />
      <InstallPriceForm project={project} onSaved={onSaved} busy={busy} setBusy={setBusy} />
    </div>
  );
}

function CommitteeForm({ project, onSaved, busy, setBusy }: {
  project: BoqProject; onSaved: (p: BoqProject) => void; busy: string | null; setBusy: (v: string | null) => void;
}) {
  const c = project.committee ?? {};
  const [agency, setAgency] = useState(c.agency ?? "");
  const [chairman, setChairman] = useState(c.chairman ?? "");
  const [member1, setMember1] = useState(c.member1 ?? "");
  const [member2, setMember2] = useState(c.member2 ?? "");
  const [formNo, setFormNo] = useState(c.formNo ?? "");
  const [calcDate, setCalcDate] = useState(c.calcDate ?? "");
  const [area, setArea] = useState(project.buildingAreaSqm != null ? String(project.buildingAreaSqm) : "");
  const [saved, setSaved] = useState<string | null>(null);
  const areaNum = parseFloat(area.replace(/,/g, ""));
  const valid = area === "" || isFinite(areaNum);

  async function save() {
    if (!valid || busy) return;
    setBusy("committee");
    try {
      const next: BoqProject = {
        ...project,
        committee: {
          agency: agency.trim() || undefined,
          chairman: chairman.trim() || undefined,
          member1: member1.trim() || undefined,
          member2: member2.trim() || undefined,
          formNo: formNo.trim() || undefined,
          calcDate: calcDate.trim() || undefined,
          savedAt: new Date().toISOString(),
        },
        buildingAreaSqm: area.trim() !== "" && isFinite(areaNum) ? areaNum : undefined,
      };
      await saveProject(next);
      onSaved(next);
      setSaved(new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mb-4 rounded border border-slate-200 bg-white p-3">
      <p className="mb-2 font-medium text-slate-800">คณะกรรมการกำหนดราคากลาง · แบบเลขที่ · วันที่คำนวณ · เนื้อที่อาคาร</p>
      <div className="grid gap-2 md:grid-cols-3">
        <label className={`${lbl} md:col-span-3`}>หน่วยงานเจ้าของโครงการงานก่อสร้าง (แสดงหัวทุกแบบฟอร์ม)
          <input value={agency} onChange={(e) => setAgency(e.target.value)} className={inputCls} />
        </label>
        <label className={lbl}>ประธานกรรมการกำหนดราคากลาง
          <input value={chairman} onChange={(e) => setChairman(e.target.value)} className={inputCls} />
        </label>
        <label className={lbl}>กรรมการกำหนดราคากลาง (คนที่ 1)
          <input value={member1} onChange={(e) => setMember1(e.target.value)} className={inputCls} />
        </label>
        <label className={lbl}>กรรมการกำหนดราคากลาง (คนที่ 2)
          <input value={member2} onChange={(e) => setMember2(e.target.value)} className={inputCls} />
        </label>
        <label className={lbl}>แบบเลขที่
          <input value={formNo} onChange={(e) => setFormNo(e.target.value)} className={inputCls} />
        </label>
        <label className={lbl}>คำนวณราคากลาง เมื่อวันที่ (เช่น 12 พฤศจิกายน 2569)
          <input value={calcDate} onChange={(e) => setCalcDate(e.target.value)} className={inputCls} />
        </label>
        <label className={lbl}>ขนาดหรือเนื้อที่อาคาร (ตร.ม.) — ใช้ที่ ปร.1(ก)
          <input type="number" step="0.01" min="0" inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} className={inputCls} />
        </label>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button onClick={save} disabled={busy !== null} className="rounded bg-blue-700 px-3 py-1 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50">
          บันทึก
        </button>
        {saved && <span className="text-xs text-emerald-700">บันทึกแล้ว {saved}</span>}
      </div>
    </div>
  );
}

function SpecialExpenseForm({ project, onSaved, busy, setBusy }: {
  project: BoqProject; onSaved: (p: BoqProject) => void; busy: string | null; setBusy: (v: string | null) => void;
}) {
  const [rows, setRows] = useState<SpecialExpense[]>(project.specialExpenses ?? []);
  const [saved, setSaved] = useState<string | null>(null);

  function update(i: number, over: Partial<SpecialExpense>) {
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...over } : x)));
  }
  function add() {
    setRows((r) => [...r, { id: "se_" + Math.random().toString(36).slice(2), name: "", qty: 1, unit: "งาน", amount: 0, vatIncluded: false }]);
  }
  function remove(i: number) {
    setRows((r) => r.filter((_, j) => j !== i));
  }
  async function save() {
    if (busy) return;
    setBusy("expenses");
    try {
      const next: BoqProject = { ...project, specialExpenses: rows.filter((r) => r.name.trim() !== "") };
      await saveProject(next);
      onSaved(next);
      setSaved(new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mb-4 rounded border border-slate-200 bg-white p-3">
      <p className="mb-2 font-medium text-slate-800">ค่าใช้จ่ายพิเศษตามข้อกำหนด (แบบ ปร.3) — ไม่มีรายการ = ไม่ต้องออก ปร.3</p>
      {rows.length === 0 && <p className="text-xs text-slate-500">ยังไม่มีรายการ — กด “เพิ่มรายการ” เพื่อกรอก</p>}
      {rows.map((r, i) => (
        <div key={r.id} className="mb-2 rounded border border-slate-200 p-2">
          <div className="grid gap-2 md:grid-cols-6">
            <label className={`${lbl} md:col-span-2`}>รายการ
              <input value={r.name} onChange={(e) => update(i, { name: e.target.value })} className={inputCls} />
            </label>
            <label className={lbl}>จำนวน
              <input type="number" step="0.01" min="0" value={r.qty} onChange={(e) => update(i, { qty: parseFloat(e.target.value) || 0 })} className={inputCls} />
            </label>
            <label className={lbl}>หน่วย
              <input value={r.unit} onChange={(e) => update(i, { unit: e.target.value })} className={inputCls} />
            </label>
            <label className={lbl}>ค่าใช้จ่าย (บาท — ยังไม่รวม VAT)
              <input type="number" step="0.01" min="0" value={r.amount} onChange={(e) => update(i, { amount: parseFloat(e.target.value) || 0 })} className={inputCls} />
            </label>
            <label className={lbl}>ต้องชำระ VAT
              <select value={r.vatIncluded ? "yes" : "no"} onChange={(e) => update(i, { vatIncluded: e.target.value === "yes" })} className={inputCls}>
                <option value="no">ไม่มี VAT</option>
                <option value="yes">มี VAT (อัตราจากตาราง Factor F)</option>
              </select>
            </label>
          </div>
          <div className="mt-1 grid gap-2 md:grid-cols-2">
            <label className={lbl}>1. เหตุผลและความจำเป็น
              <textarea value={r.reason ?? ""} onChange={(e) => update(i, { reason: e.target.value })} className={`${inputCls} h-16`} />
            </label>
            <label className={lbl}>2. รายละเอียดการคำนวณ
              <textarea value={r.calcDetail ?? ""} onChange={(e) => update(i, { calcDetail: e.target.value })} className={`${inputCls} h-16`} />
            </label>
          </div>
          <button onClick={() => remove(i)} className="mt-1 text-xs text-red-600 underline">ลบรายการนี้</button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <button onClick={add} className="rounded border border-slate-300 bg-white px-3 py-1 text-xs hover:bg-slate-50">เพิ่มรายการ</button>
        <button onClick={save} disabled={busy !== null} className="rounded bg-blue-700 px-3 py-1 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50">บันทึกค่าใช้จ่ายพิเศษ</button>
        {saved && <span className="text-xs text-emerald-700">บันทึกแล้ว {saved}</span>}
      </div>
    </div>
  );
}

function InstallPriceForm({ project, onSaved, busy, setBusy }: {
  project: BoqProject; onSaved: (p: BoqProject) => void; busy: string | null; setBusy: (v: string | null) => void;
}) {
  const equipment = project.items.filter((it: BoqItem) => it.part === "equipment");
  const [vals, setVals] = useState<Record<string, string>>(
    Object.fromEntries(equipment.map((it) => [it.id, it.installPrice != null ? String(it.installPrice) : ""])),
  );
  const [reasons, setReasons] = useState<Record<string, string>>(
    Object.fromEntries(equipment.map((it) => [it.id, it.installPriceReason ?? ""])),
  );
  const [sourcings, setSourcings] = useState<Record<string, string>>(
    Object.fromEntries(equipment.map((it) => [it.id, it.installSourcingDetail ?? ""])),
  );
  const [saved, setSaved] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    setBusy("install");
    try {
      const next: BoqProject = {
        ...project,
        items: project.items.map((it) => {
          if (it.part !== "equipment") return it;
          const v = vals[it.id];
          const n = v === undefined || v.trim() === "" ? undefined : parseFloat(v.replace(/,/g, ""));
          return {
            ...it,
            installPrice: n !== undefined && isFinite(n) ? n : undefined,
            installPriceReason: reasons[it.id]?.trim() || undefined,
            installSourcingDetail: sourcings[it.id]?.trim() || undefined,
          };
        }),
      };
      await saveProject(next);
      onSaved(next);
      setSaved(new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }));
    } finally {
      setBusy(null);
    }
  }

  if (equipment.length === 0) return null;
  return (
    <div className="rounded border border-slate-200 bg-white p-3">
      <p className="mb-2 font-medium text-slate-800">
        ค่าติดตั้งครุภัณฑ์ (ต่อหน่วย) — ตามเล่ม 2 ข้อ 2.2/ข้อ 8: ค่าติดตั้งมาจากการสืบราคา แยกจากราคาครุภัณฑ์ (ราคาครุภัณฑ์ห้ามแฝงค่าติดตั้ง)
        ต้องแสดง <b>เหตุผลความจำเป็น</b> และ <b>รายละเอียดประกอบการสืบราคา</b> ใน ปร.2/ปร.2(ก)/ชิ้นที่ 9 ด้วย
      </p>
      {equipment.map((it) => {
        const hasPrice = vals[it.id] !== undefined && vals[it.id].trim() !== "";
        // เงื่อนไขเดียวกับ builder (OR): ขาดเหตุผล "หรือ" รายละเอียดการสืบราคาส่วนใดส่วนหนึ่ง → เตือน
        const noReason = !(reasons[it.id] ?? "").trim();
        const noSourcing = !(sourcings[it.id] ?? "").trim();
        const reasonMissing = hasPrice && (noReason || noSourcing);
        const reasonMissingMsg = noReason && noSourcing
          ? "เหตุผลและรายละเอียดการสืบราคา"
          : noReason
            ? "เหตุผลความจำเป็น"
            : "รายละเอียดการสืบราคา";
        return (
          <div key={it.id} className="mb-2 rounded border border-slate-200 p-2">
            <div className="grid gap-2 md:grid-cols-3">
              <label className={lbl}>
                {it.name || "รายการไม่มีชื่อ"} ({fmtQty(it.qty)} {it.unit}) — ค่าติดตั้ง/หน่วย (บาท)
                <input
                  type="number" step="0.01" min="0" inputMode="decimal"
                  value={vals[it.id] ?? ""}
                  onChange={(e) => setVals((v) => ({ ...v, [it.id]: e.target.value }))}
                  className={inputCls}
                />
              </label>
              <label className={lbl}>เหตุผลความจำเป็นที่ต้องมีค่าติดตั้ง
                <textarea value={reasons[it.id] ?? ""} onChange={(e) => setReasons((r) => ({ ...r, [it.id]: e.target.value }))} className={`${inputCls} h-16`} />
              </label>
              <label className={lbl}>รายละเอียดประกอบการสืบราคา (แหล่งราคา/วันที่/หลักฐาน)
                <textarea value={sourcings[it.id] ?? ""} onChange={(e) => setSourcings((r) => ({ ...r, [it.id]: e.target.value }))} className={`${inputCls} h-16`} />
              </label>
            </div>
            {reasonMissing && (
              <p className="mt-1 text-xs text-amber-800">
                unverified: มีค่าติดตั้งแต่ยังไม่บันทึก{reasonMissingMsg} — จะปรากฏป้ายเตือนบนเอกสารพิมพ์
              </p>
            )}
          </div>
        );
      })}
      <div className="mt-2 flex items-center gap-2">
        <button onClick={save} disabled={busy !== null} className="rounded bg-blue-700 px-3 py-1 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50">บันทึกค่าติดตั้ง</button>
        {saved && <span className="text-xs text-emerald-700">บันทึกแล้ว {saved}</span>}
      </div>
    </div>
  );
}
