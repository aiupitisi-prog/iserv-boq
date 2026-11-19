"use client";

// แนบท้ายสัญญา — แบบแสดงรายการ ปริมาณงาน และราคา (จัดทำโดยเจ้าหน้าที่พัสดุ)
//
// แยกจากชุดเอกสารราคากลาง 9 ชิ้นโดยเจตนา:
// - ราคากลาง (ปร.1–ปร.4 ฯลฯ) จัดทำโดยคณะกรรมการกำหนดราคากลาง
// - เอกสารนี้จัดทำหลังทราบผลคัดเลือก — เจ้าหน้าที่พัสดุกรอกราคาตามคำเสนอของผู้ได้รับคัดเลือก
//   ระบบคำนวณอัตราปรับลดเดียวกันทุกรายการและกระจายลง BOQ (computePriceReduction, สตางค์ integer)
// - ไม่ใช่ราคากลาง/ไม่ใช่ราคามาตรฐานของกรมบัญชีกลาง — มีป้ายบนเอกสารเสมอ

import { Fragment, useEffect, useMemo, useState } from "react";
import type { BoqProject } from "@/lib/boq";
import { loadProjects, saveProject } from "@/lib/storage";
import { loadRulesets, rulesetBeYear, rulesetStatus, Ruleset } from "@/lib/ruleset";
import { computeGovBOQSafe } from "@/lib/calc/compute";
import { computePriceReduction, type PriceReductionResult, type ReducedPriceLine } from "@/lib/calc/reduce";
import { buildReg2569Report, type Reg2569Report } from "@/lib/report2569";
import { formatSatang } from "@/lib/calc/money";
import { bahtText } from "@/lib/bahttext";
import { EXPORT_MIME, downloadBlob } from "@/lib/export";
import { CONTRACT_DISCLAIMER, contractFilename, toContractWorkbookArray } from "@/lib/export-contract";

const fmt = (s: number): string => formatSatang(s);
const fmtBaht = (n: number): string =>
  isFinite(n) ? n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
const fmtQty = (n: number): string => (isFinite(n) ? n.toLocaleString("th-TH", { maximumFractionDigits: 4 }) : "—");
const unitBaht = (sat: number, qty: number): string => (qty > 0 ? fmtBaht(sat / 100 / qty) : "—");

const td = "border border-slate-300 px-2 py-1 align-top";
const tdr = "border border-slate-300 px-2 py-1 text-right align-top";
const inputCls = "mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm";
const lbl = "text-xs text-slate-700";

function groupLines(lines: ReducedPriceLine[]): { section: string; lines: ReducedPriceLine[] }[] {
  const out: { section: string; lines: ReducedPriceLine[] }[] = [];
  for (const l of lines) {
    const last = out[out.length - 1];
    if (last && last.section === l.section) last.lines.push(l);
    else out.push({ section: l.section, lines: [l] });
  }
  return out;
}

// — ฟอร์มข้อมูลสัญญา (no-print) — เก็บในโปรเจกต์ของเครื่องนี้เท่านั้น —
function AwardForm({
  project,
  calc,
  base,
  onSaved,
}: {
  project: BoqProject;
  calc: ReturnType<typeof computeGovBOQSafe>["calc"];
  base: Reg2569Report["contractBase"] | null;
  onSaved: (p: BoqProject) => void;
}) {
  const a = project.award;
  const [price, setPrice] = useState(a?.winningPrice != null ? String(a.winningPrice) : "");
  const [contract, setContract] = useState(a?.contractNoteDate ?? "");
  const [contractor, setContractor] = useState(a?.contractor ?? "");
  const [signer, setSigner] = useState(a?.contractorSigner ?? "");
  const [officer, setOfficer] = useState(a?.procurementOfficer ?? "");
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const num = parseFloat(price.replace(/,/g, ""));
  const valid = isFinite(num) && num > 0;
  const preview = useMemo<PriceReductionResult | null>(
    () => (valid && calc ? computePriceReduction(project, calc, num, base ?? undefined) : null),
    [valid, num, calc, project, base],
  );

  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const next: BoqProject = {
        ...project,
        award: {
          ...a,
          winningPrice: num,
          contractNoteDate: contract.trim() || undefined,
          contractor: contractor.trim() || undefined,
          contractorSigner: signer.trim() || undefined,
          procurementOfficer: officer.trim() || undefined,
          savedAt: new Date().toISOString(),
        },
      };
      await saveProject(next);
      onSaved(next);
      setSaved(new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="no-print mb-4 rounded border border-emerald-300 bg-emerald-50 p-3 text-sm">
      <p className="mb-2 text-xs text-slate-600">
        ข้อมูลสำหรับแนบท้ายสัญญา — กรอกเฉพาะ <b>ราคาตามคำเสนอของผู้ได้รับคัดเลือก</b> แล้วระบบคำนวณ % ปรับลด
        และกระจายลงทุกรายการให้อัตโนมัติ (เก็บในโปรเจกต์ของเครื่องนี้เท่านั้น) ·{" "}
        <b>เอกสารพิมพ์/ส่งออกจะใช้ค่าที่บันทึกแล้ว — กดบันทึกก่อนพิมพ์</b>
      </p>
      <div className="grid gap-2 md:grid-cols-4">
        <label className={lbl}>
          ราคาตามคำเสนอของผู้ได้รับคัดเลือก (บาท) *
          <input
            type="number" step="0.01" min="0" inputMode="decimal"
            value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls}
          />
        </label>
        <label className={lbl}>สัญญาเลขที่ / ลงวันที่
          <input value={contract} onChange={(e) => setContract(e.target.value)} className={inputCls} />
        </label>
        <label className={lbl}>ชื่อผู้รับจ้าง
          <input value={contractor} onChange={(e) => setContractor(e.target.value)} className={inputCls} />
        </label>
        <label className={lbl}>ผู้ลงนามฝ่ายผู้รับจ้าง
          <input value={signer} onChange={(e) => setSigner(e.target.value)} className={inputCls} />
        </label>
        <label className={`${lbl} md:col-span-2`}>เจ้าหน้าที่พัสดุผู้จัดทำแนบท้ายสัญญา
          <input value={officer} onChange={(e) => setOfficer(e.target.value)} className={inputCls} />
        </label>
      </div>
      {preview && (
        <p className={`mt-2 text-xs ${preview.ok ? "text-emerald-800" : "text-red-700"}`}>
          {preview.ok
            ? `อัตราปรับลด ${preview.reducePct?.toFixed(4)}% · ราคารวมรายการ BOQ ตามสัญญา ${fmt(preview.winItemsSat)} บาท · วงเงินตามสัญญา ${fmt(preview.winningSat)} บาท`
            : `ยังใช้ไม่ได้: ${preview.error}`}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          onClick={save}
          disabled={!valid || busy}
          className="rounded bg-emerald-700 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          บันทึกข้อมูลสัญญา
        </button>
        {saved && <span className="text-xs text-emerald-700">บันทึกแล้ว {saved}</span>}
        {!valid && <span className="text-xs text-amber-700">กรอกราคาตามคำเสนอเป็นจำนวนเงินมากกว่า 0</span>}
      </div>
    </div>
  );
}

export default function ContractClient({ projectId }: { projectId: string }) {
  const [loaded, setLoaded] = useState(false);
  const [project, setProject] = useState<BoqProject | null>(null);
  const [rulesets, setRulesets] = useState<Ruleset[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const list = await loadProjects();
      setProject(list.find((p) => p.id === projectId) ?? null);
      setRulesets(loadRulesets());
      setLoaded(true);
    })();
  }, [projectId]);

  const pinnedRs = project ? rulesets.find((r) => r.id === project.rulesetId) ?? null : null;
  const gov = project && (project.mode ?? "gov") !== "private" ? computeGovBOQSafe(project, pinnedRs) : null;
  const calc = gov?.calc ?? null;
  // ฐานราคากลางส่วนรายการต้องมาจากชุด 9 ชิ้น (ปร.4) — ใช้ตัวเดียวกับหน้าพิมพ์/export
  const rep = useMemo<Reg2569Report | null>(
    () => (project && calc ? buildReg2569Report(project, pinnedRs, calc) : null),
    [project, calc, pinnedRs],
  );
  const base = rep?.contractBase ?? null;
  const winning =
    project && typeof project.award?.winningPrice === "number" && project.award.winningPrice > 0
      ? project.award.winningPrice
      : null;
  const reduce =
    project && calc && winning !== null && base ? computePriceReduction(project, calc, winning, base) : null;
  const printable = reduce?.ok === true;
  const superseded = rulesetStatus(pinnedRs ?? undefined) === "superseded";
  const regYear = rulesetBeYear(pinnedRs);

  async function exportXlsx() {
    if (!project || !calc || winning === null || !printable || !base || exporting) return;
    setExporting(true);
    setExportErr(null);
    try {
      const data = await toContractWorkbookArray(project, calc, winning, { base, ruleset: pinnedRs });
      downloadBlob(data, EXPORT_MIME.xlsx, contractFilename(project));
    } catch (e) {
      setExportErr(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
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

  if ((project.mode ?? "gov") === "private") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="mb-2 text-xl font-semibold text-slate-700">แนบท้ายสัญญาสำหรับโหมดราชการเท่านั้น</h1>
        <p className="mb-4 text-sm text-slate-500">
          โปรเจกต์นี้เป็นโหมดเอกชน (ใบเสนอราคา) — ไม่มีสัญญาตามหลักเกณฑ์ราคากลาง
        </p>
        <div className="flex justify-center gap-2">
          <a href={`/projects/${project.id}/docs`} className="rounded-lg bg-blue-700 px-4 py-2 text-sm text-white hover:bg-blue-800">ชุดเอกสารของโครงการ</a>
          <a href={`/projects/${project.id}`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">กลับ editor</a>
        </div>
      </div>
    );
  }

  const groups = reduce?.ok ? groupLines(reduce.lines) : [];
  // ลำดับที่ต่อเนื่องทั้งเอกสาร (ไม่รีเซ็ตตามหมวด) — ให้ตรงกับไฟล์ xlsx
  let seq = 0;
  const groupStarts = groups.map((g) => {
    const start = seq;
    seq += g.lines.length;
    return start;
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="print-header">
        {project.name} · แนบท้ายสัญญา · เอกสารของเจ้าหน้าที่พัสดุ (ไม่ใช่ราคากลาง)
      </div>
      <div className="print-footer">
        เอกสารแนบท้ายสัญญาของเจ้าหน้าที่พัสดุ — ไม่ใช่ราคากลางและไม่ใช่ราคามาตรฐานของกรมบัญชีกลาง · พิมพ์จากระบบ iserv BOQ — วันที่พิมพ์ {new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })}
      </div>

      <div className="no-print mb-6 flex flex-wrap items-center gap-2">
        <a href={`/projects/${project.id}`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">← กลับ editor</a>
        <a href={`/projects/${project.id}/docs/reg2569`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">ชุดราคากลาง 9 ชิ้น (กรรมการ)</a>
        <a href={`/projects/${project.id}/docs`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">ชุดเอกสารโครงเดิม</a>
        <button
          onClick={() => window.print()}
          disabled={!printable}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          พิมพ์แนบท้ายสัญญา
        </button>
        <button
          onClick={exportXlsx}
          disabled={!printable || exporting}
          className="rounded-lg border border-emerald-500 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
        >
          {exporting ? "กำลังสร้างไฟล์…" : "ดาวน์โหลด xlsx"}
        </button>
        <span className="text-xs text-amber-900">
          จัดทำโดยเจ้าหน้าที่พัสดุ — ไม่ใช่ราคากลาง/ไม่ใช่ราคามาตรฐานของกรมบัญชีกลาง
        </span>
      </div>

      {exportErr && (
        <p className="no-print mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          ส่งออกไม่สำเร็จ: {exportErr}
        </p>
      )}

      {superseded && (
        <div className="no-print mb-4 rounded border border-red-300 bg-red-50 p-3 text-xs leading-5 text-red-900">
          <b>ชุดกฎที่ pin ถูกแทนที่แล้ว:</b> โปรเจกต์อ้างชุดกฎ (id {project.rulesetId}) ที่มีชุดกฎใหม่มาแทน — ตัวเลขอัตราอาจไม่ตรงประกาศฉบับล่าสุด
          ไปย้ายที่ <a href="/rulesets" className="underline">หน้า ชุดกฎราคากลาง</a> ก่อนใช้ยื่นหน่วยงาน
        </div>
      )}

      <AwardForm project={project} calc={calc} base={base} onSaved={setProject} />

      {gov?.err && (
        <p className="no-print mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          คำนวณราคากลางไม่ได้: {gov.err} — ตรวจชุดกฎที่ pin / ช่วงตาราง Factor F ก่อนจัดทำแนบท้ายสัญญา
        </p>
      )}

      {!reduce?.ok && (
        <div className="no-print rounded border border-amber-400 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">ยังพิมพ์แนบท้ายสัญญาไม่ได้</p>
          <p className="mt-1 text-xs">
            {reduce?.error ??
              (winning === null
                ? "ยังไม่ได้กรอกราคาตามคำเสนอของผู้ได้รับคัดเลือก"
                : "ยังคำนวณราคากลางไม่ได้ (ตรวจชุดกฎ/ช่วงตาราง Factor F)")}
          </p>
          <p className="mt-2 text-xs">
            เอกสารนี้จะแสดงเมื่อมีราคากลางที่คำนวณได้ และราคาที่ชนะต่ำกว่าราคากลางส่วนรายการ BOQ
          </p>
        </div>
      )}

      {reduce?.ok && (
        <section className="doc-sheet bg-white p-8">
          <div className="text-center">
            <h1 className="text-lg font-bold text-slate-900">แบบแสดงรายการ ปริมาณงาน และราคา</h1>
            <h2 className="font-bold text-slate-900">(แนบท้ายสัญญา)</h2>
            <p className="mt-1 inline-block rounded bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-900">
              จัดทำโดยเจ้าหน้าที่พัสดุ — เอกสารแนบท้ายสัญญา ไม่ใช่ราคากลาง
            </p>
          </div>

          <div className="mt-3 text-sm leading-7">
            <div className="flex flex-wrap justify-between gap-x-6">
              <span><b>งานก่อสร้าง</b> {project.name || "……………………………………"}</span>
              <span>หน่วย : บาท</span>
            </div>
            <div className="flex flex-wrap justify-between gap-x-6">
              <span><b>สถานที่ก่อสร้าง</b> {project.address || "………………………"}</span>
              <span><b>จังหวัด</b> {project.committee?.province || "……………"}</span>
            </div>
            <p><b>หน่วยงานเจ้าของโครงการงานก่อสร้าง</b> {project.committee?.agency || "……………………………………"}</p>
            <div className="flex flex-wrap justify-between gap-x-6">
              <span><b>สัญญาเลขที่ / ลงวันที่</b> {project.award?.contractNoteDate?.trim() || "………………………………"}</span>
              <span><b>ผู้รับจ้าง</b> {project.award?.contractor?.trim() || "………………………………"}</span>
            </div>
            <p><b>จัดทำโดยเจ้าหน้าที่พัสดุ</b> {project.award?.procurementOfficer?.trim() || "……………………………………"}</p>
            <p className="text-xs text-slate-600">
              <b>ชุดกฎราคากลาง</b>{" "}
              {pinnedRs
                ? `${pinnedRs.name} (id ${pinnedRs.id}) · มีผลตั้งแต่ ${pinnedRs.effectiveFrom}${regYear ? ` (พ.ศ. ${regYear})` : ""}`
                : "ไม่ได้ pin ชุดกฎ — ตัวเลขอัตราอาจไม่ครบ (unverified)"}
            </p>
            {superseded && (
              <p className="mt-1 rounded border border-red-400 px-2 py-1 text-xs font-medium text-red-900">
                ⚠ ชุดกฎนี้ถูกแทนที่แล้ว{pinnedRs?.supersededBy ? ` (supersededBy ${pinnedRs.supersededBy})` : ""} —
                ตัวเลขอัตราอาจไม่ตรงประกาศฉบับล่าสุด; ตรวจก่อนใช้ยื่นหน่วยงาน
              </p>
            )}
          </div>

          <div className="mt-4 text-sm">
            <p className="font-semibold">สรุปการปรับลดราคา</p>
            <table className="mt-1 w-full text-sm">
              <tbody>
                <tr>
                  <td className={td}>ราคากลางส่วนรายการ BOQ</td>
                  <td className={tdr}>{fmt(reduce.reducibleBaseSat)}</td>
                </tr>
                {reduce.fixedLines.map((f) => (
                  <tr key={f.label}>
                    <td className={td}>{f.label}</td>
                    <td className={tdr}>{fmt(f.satang)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className={td}>ราคาตามคำเสนอของผู้ได้รับคัดเลือก (วงเงินตามสัญญา)</td>
                  <td className={tdr}>{fmt(reduce.winningSat)}</td>
                </tr>
                <tr>
                  <td className={td}>อัตราปรับลดจากราคากลางส่วนรายการ</td>
                  <td className={tdr}>{reduce.reducePct !== null ? `${reduce.reducePct.toFixed(4)}%` : "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="bg-slate-100 text-left">
                <th className={`${td} w-12`}>ลำดับที่</th>
                <th className={td}>รายการ</th>
                <th className={`${tdr} w-16`}>จำนวน</th>
                <th className={`${td} w-14`}>หน่วย</th>
                <th className={`${tdr} w-24`}>ราคากลาง/หน่วย</th>
                <th className={`${tdr} w-28`}>ราคาตามสัญญา/หน่วย</th>
                <th className={`${tdr} w-28`}>จำนวนเงินตามสัญญา</th>
                <th className={`${td} w-16`}>หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g, gi) => (
                <Fragment key={`sec-${gi}`}>
                  <tr className="bg-slate-50">
                    <td className={td} colSpan={8}><b>หมวดงาน: {g.section || "—"}</b></td>
                  </tr>
                  {g.lines.map((l, li) => (
                    <tr key={l.itemId}>
                      <td className={td}>{groupStarts[gi] + li + 1}</td>
                      <td className={td}>{l.name}</td>
                      <td className={tdr}>{fmtQty(l.qty)}</td>
                      <td className={td}>{l.unit}</td>
                      <td className={tdr}>{unitBaht(l.medianSat, l.qty)}</td>
                      <td className={tdr}>{fmtBaht(l.reducedUnitBaht)}</td>
                      <td className={tdr}>{fmt(l.reducedSat)}</td>
                      <td className={td}>{l.part === "equipment" ? "ครุภัณฑ์" : ""}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              <tr className="font-semibold">
                <td className={td} colSpan={6}>รวมรายการ BOQ ตามสัญญา</td>
                <td className={tdr}>{fmt(reduce.winItemsSat)}</td>
                <td className={td}></td>
              </tr>
              {reduce.fixedLines.map((f) => (
                <tr key={`fix-${f.label}`}>
                  <td className={td} colSpan={6}>{f.label}</td>
                  <td className={tdr}>{fmt(f.satang)}</td>
                  <td className={td}></td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className={td} colSpan={6}>รวมวงเงินตามสัญญา</td>
                <td className={tdr}>{fmt(reduce.winningSat)}</td>
                <td className={td}></td>
              </tr>
              <tr>
                <td className={td} colSpan={8}>
                  รวมวงเงินตามสัญญา ( <span className="italic">{bahtText(reduce.winningSat)}</span> )
                </td>
              </tr>
            </tbody>
          </table>

          <p className="mt-2 text-xs leading-5 text-slate-600">
            หมายเหตุ: ราคาต่อหน่วยแสดงเพื่อตรวจเทียบ — จำนวนเงินรวมรายการคือค่าที่ใช้จริง และผลรวมทุกบรรทัดเท่ากับวงเงินตามสัญญา
            · ส่วนคงเดิมไม่เข้าการปรับลดราคารายการ (unverified: ตรวจแนวทางที่มีผลบังคับก่อนใช้จริง)
          </p>
          {reduce.lines.some((l) => l.part === "equipment") && (
            <p className="mt-1 text-xs leading-5 text-slate-600">
              รายการครุภัณฑ์: “ราคากลาง/หน่วย” รวม VAT และค่าติดตั้งตามแบบ ปร.2 (แยกฐานจาก Factor F) — ใช้ยอดเดียวกับ ปร.4
            </p>
          )}

          {rep && rep.warnings.length > 0 && (
            <div className="print-warn mt-3 rounded border border-amber-400 p-2 text-xs leading-5 text-amber-900">
              <b>คำเตือนจากชุด 9 ชิ้น (โปรดตรวจก่อนใช้):</b>
              <ul className="ml-4 list-disc">
                {rep.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {reduce.warnings.length > 0 && (
            <div className="print-warn mt-3 rounded border border-amber-400 p-2 text-xs leading-5 text-amber-900">
              <b>คำเตือน (unverified):</b>
              <ul className="ml-4 list-disc">
                {reduce.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          <div className="doc-sign-row mt-10 grid grid-cols-3 gap-4 text-center text-sm">
            <div>
              <div className="h-16"></div>
              <div className="border-t border-slate-400 pt-1 text-slate-700">
                ( {project.award?.procurementOfficer?.trim() || "………………………………"} )
              </div>
              <div className="mt-1 text-xs text-slate-500">เจ้าหน้าที่พัสดุผู้จัดทำแนบท้ายสัญญา</div>
            </div>
            <div>
              <div className="h-16"></div>
              <div className="border-t border-slate-400 pt-1 text-slate-700">
                ( {project.award?.contractorSigner?.trim() || "………………………………"} )
              </div>
              <div className="mt-1 text-xs text-slate-500">{project.award?.contractor?.trim() || "ผู้รับจ้าง"}</div>
            </div>
            <div>
              <div className="h-16"></div>
              <div className="border-t border-slate-400 pt-1 text-slate-700">( ……………………………… )</div>
              <div className="mt-1 text-xs text-slate-500">พยาน</div>
            </div>
          </div>

          <p className="mt-4 text-xs text-amber-900">{CONTRACT_DISCLAIMER}</p>
          <p className="mt-1 text-xs text-slate-500">
            เอกสารนี้แนบท้ายสัญญาตามราคาที่ผู้ได้รับคัดเลือกเสนอ — ไม่ใช่ราคากลางและไม่ใช่ราคามาตรฐานของกรมบัญชีกลาง
          </p>
        </section>
      )}
    </div>
  );
}
