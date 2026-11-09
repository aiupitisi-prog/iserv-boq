"use client";

import { useEffect, useState } from "react";
import { BoqItem, BoqProject, itemTotal, proposalSummary, thb } from "@/lib/boq";
import { loadProjects } from "@/lib/storage";
import { loadRulesets, Ruleset } from "@/lib/ruleset";
import { computeGovBOQSafe } from "@/lib/calc/compute";
import { formatSatang, mulQty, satangToBaht, type Satang } from "@/lib/calc/money";
import { bahtText } from "@/lib/bahttext";
import { sourceLabel } from "@/lib/export";

// ชุดเอกสารงานราชการ 9 ฉบับ (F3.6) / ใบเสนอราคาเอกชน (โหมด private)
// ทุกฉบับพิมพ์ A4 ขาวดำ ขึ้นหน้าใหม่เอง (.doc-sheet) มีช่องลงนาม ผู้จัดทำ/ตรวจสอบ/อนุมัติ
// ตัวเงินทั้งหมดมาจากเครื่องยนต์ lib/calc (สตางค์ integer) — หน้านี้แค่แสดงผล

function thDate(d: Date): string {
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
}

// แยก ก./ข. ระดับแสดงผล — เงื่อนไขเดียวกับ splitItem ใน lib/calc/compute.ts ต้องตรงกันเป๊ะ
function splitSatang(it: BoqItem): { mat: Satang; lab: Satang; unsplit: boolean } {
  const total = mulQty(it.qty, it.price);
  if (it.matPrice !== undefined && it.laborPrice !== undefined) {
    return { mat: mulQty(it.qty, it.matPrice), lab: mulQty(it.qty, it.laborPrice), unsplit: false };
  }
  if (it.source?.kind === "private" && it.source.category === "ค่าแรง") {
    return { mat: 0, lab: total, unsplit: false };
  }
  return { mat: total, lab: 0, unsplit: total !== 0 };
}

function SigBlock({ roles }: { roles: string[] }) {
  const active = roles.filter((r) => r !== "");
  return (
    <div className={`doc-sign-row mt-10 grid gap-4 text-center text-sm ${active.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
      {active.map((role) => (
        <div key={role}>
          <div className="h-16"></div>
          <div className="mx-4 border-t border-slate-400 pt-1 text-slate-700">({role})</div>
          <div className="mt-1 text-xs text-slate-500">วันที่ ……………… / ……………… / ………………</div>
        </div>
      ))}
    </div>
  );
}

function DocTitle({ no, total, title }: { no: number; total: number; title: string }) {
  return (
    <div className="mb-1 text-center">
      <p className="text-xs text-slate-500">ฉบับที่ {no}/{total}</p>
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
    </div>
  );
}

function ProjectHead({ project }: { project: BoqProject }) {
  return (
    <div className="mb-4 rounded border border-slate-300 p-3 text-sm">
      <p><b>โครงการ:</b> {project.name || "—"} &nbsp;·&nbsp; <b>แบบฟอร์ม:</b> {project.boqType}</p>
      <p><b>ที่ตั้งงาน:</b> {project.address || "—"}</p>
    </div>
  );
}

function WarningNote({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 rounded border border-amber-400 p-2 text-xs text-amber-900">{children}</div>;
}

const DOC_ROLES: [string, string, string] = ["ผู้จัดทำราคา", "ผู้ตรวจสอบราคา", "ผู้อนุมัติราคา"];

export default function DocsClient({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<BoqProject | null>(null);
  const [rulesets, setRulesets] = useState<Ruleset[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [only, setOnly] = useState<number | null>(null); // พิมพ์เฉพาะฉบับ — index ของฉบับ (null = ทั้งชุด)

  useEffect(() => {
    setProject(loadProjects().find((p) => p.id === projectId) ?? null);
    setRulesets(loadRulesets());
    setLoaded(true);
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

  const isPrivate = project.mode === "private";
  const pinnedRs = rulesets.find((r) => r.id === project.rulesetId) ?? null;
  const gov = !isPrivate ? computeGovBOQSafe(project, pinnedRs) : null;
  const calc = gov?.calc ?? null;

  const construction = project.items.filter((it) => it.part !== "equipment");
  const equipment = project.items.filter((it) => it.part === "equipment");
  const unsplitNames = construction.filter((it) => splitSatang(it).unsplit).map((it) => it.name || "รายการไม่มีชื่อ");
  const staleItems = project.items.filter((it) => {
    if (!it.source) return false;
    const now = new Date();
    const nowM = (now.getFullYear() + 543) * 12 + (now.getMonth() + 1);
    const s = it.source;
    const age = s.kind === "private"
      ? nowM - ((new Date(s.priceAgeRef).getFullYear() + 543) * 12 + new Date(s.priceAgeRef).getMonth() + 1)
      : s.month ? nowM - (s.year * 12 + s.month) : (now.getFullYear() + 543 - s.year) * 12;
    return age > 12;
  });

  const today = new Date();
  const printDate = thDate(today);

  // ---------- โหมดเอกชน: ใบเสนอราคาฉบับเดียว ----------
  if (isPrivate) {
    const proposal = proposalSummary(project.items, project.factors);
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="no-print mb-4 flex flex-wrap items-center gap-2">
          <a href={`/projects/${projectId}`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">← กลับ editor</a>
          <button onClick={() => window.print()} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">พิมพ์ใบเสนอราคา</button>
          <span className="text-xs text-amber-900">ประมาณการ — ไม่ใช่ราคากลางตามหลักเกณฑ์ (ติดป้ายในเอกสารเสมอ)</span>
        </div>

        <section className="doc-sheet bg-white p-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-slate-900">ใบเสนอราคา</h2>
            <p className="mt-1 text-sm text-slate-600">QUOTATION — วันที่ {printDate}</p>
            <p className="mt-1 rounded bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 inline-block">
              ประมาณการจากปัจจัยที่ผู้เสนอราคาตั้งเอง — ไม่ใช่ราคากลางตามหลักเกณฑ์การคำนวณราคากลาง
            </p>
          </div>
          <div className="mt-4 text-sm">
            <p><b>เรียน:</b> ………………………………………………</p>
            <p><b>โครงการ:</b> {project.name} &nbsp;·&nbsp; <b>สถานที่:</b> {project.address || "—"}</p>
          </div>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="bg-slate-100 text-left">
                <th className="border border-slate-300 px-2 py-1">ลำดับ</th>
                <th className="border border-slate-300 px-2 py-1">รายการ</th>
                <th className="border border-slate-300 px-2 py-1">หน่วย</th>
                <th className="border border-slate-300 px-2 py-1 text-right">ปริมาณ</th>
                <th className="border border-slate-300 px-2 py-1 text-right">ราคา/หน่วย</th>
                <th className="border border-slate-300 px-2 py-1 text-right">รวมเงิน</th>
              </tr>
            </thead>
            <tbody>
              {project.items.map((it, i) => (
                <tr key={it.id}>
                  <td className="border border-slate-300 px-2 py-1">{i + 1}</td>
                  <td className="border border-slate-300 px-2 py-1">{it.name}{it.note ? ` (${it.note})` : ""}</td>
                  <td className="border border-slate-300 px-2 py-1">{it.unit}</td>
                  <td className="border border-slate-300 px-2 py-1 text-right">{it.qty.toLocaleString("th-TH", { maximumFractionDigits: 4 })}</td>
                  <td className="border border-slate-300 px-2 py-1 text-right">{it.price.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="border border-slate-300 px-2 py-1 text-right">{thb(itemTotal(it))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="mt-3 w-full text-sm">
            <tbody>
              <tr>
                <td className="px-2 py-1 text-right">รวมราคาวัสดุ-แรงงาน (ต้นทุน)</td>
                <td className="w-40 px-2 py-1 text-right">{thb(proposal.base)}</td>
              </tr>
              {proposal.lines.map((ln, i) => (
                <tr key={i} className="text-slate-600">
                  <td className="px-2 py-1 text-right text-xs">
                    {ln.label} <span className="text-slate-500">({ln.formula})</span>
                  </td>
                  <td className="px-2 py-1 text-right">{thb(ln.amount)}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td className="px-2 py-1 text-right">
                  ราคาเสนอรวม (รวม VAT)
                  <span className="block text-xs font-normal text-amber-900">ประมาณการ — ไม่ใช่ราคากลางตามหลักเกณฑ์</span>
                </td>
                <td className="px-2 py-1 text-right text-base text-green-700">{thb(proposal.proposalTotal)}</td>
              </tr>
              <tr>
                <td className="px-2 py-1 text-right text-xs text-slate-500" colSpan={2}>( {bahtText(Math.round(proposal.proposalTotal * 100))} )</td>
              </tr>
            </tbody>
          </table>
          <SigBlock roles={["ผู้เสนอราคา", "ผู้รับข้อเสนอ", ""]} />
        </section>
      </div>
    );
  }

  // ---------- โหมดราชการ: ชุดเอกสาร 9 ฉบับ ----------
  const TOTAL_DOCS = 9;

  const sheets: { title: string; body: React.ReactNode }[] = [
    // 1) บันทึกข้อความขออนุมัติจัดทำราคากลาง
    {
      title: "บันทึกข้อความขออนุมัติจัดทำราคากลาง",
      body: (
        <>
          <div className="text-center"><h3 className="text-xl font-bold text-slate-900">บันทึกข้อความ</h3></div>
          <div className="mt-4 text-sm leading-7">
            <p>ที่ ……………………………………… วันที่ {printDate}</p>
            <p>ส่วนราชการ ……………………………………………………………</p>
            <p>สิ่งที่ส่ง ……………………………………………………………</p>
            <p><b>เรื่อง</b> ขออนุมัติจัดทำราคากลาง {project.name}</p>
            <p>เรียน ……………………………………………………………</p>
            <p className="text-indent-8">ด้วยหน่วยงานมีความประสงค์จะดำเนินการ <b>{project.name}</b> ที่ตั้งงาน {project.address || "……………"} ประเภทแบบฟอร์ม {project.boqType}
              {" "}ตามรายละเอียดรายการงาน (BOQ) ที่แนบมาพร้อมฉบับนี้ จำนวน {project.items.length} รายการ
              {calc ? <> โดยมีราคากลางโดยประมาณ (ดูรายละเอียดฉบับที่ 7/{TOTAL_DOCS}) {thb(satangToBaht(calc.total))} บาท</> : " — ยังไม่สามารถสรุปราคากลางได้ (ตรวจชุดกฎ/ช่วงตาราง Factor F)"}</p>
            <p className="text-indent-8">จึงเรียนมาเพื่อโปรดพิจารณาอนุมัติจัดทำราคากลางตามรายละเอียดจะเห็นว่าเป็นการเหมาะสมและถูกต้องตามหลักเกณฑ์</p>
          </div>
          <SigBlock roles={["ผู้เสนอ", "ผู้ตรวจสอบ", "ผู้อนุมัติ"]} />
        </>
      ),
    },

    // 2) รายงานผลการพิจารณาจัดทำราคากลาง
    {
      title: "รายงานผลการพิจารณาจัดทำราคากลาง",
      body: (
        <>
          <div className="text-center"><h3 className="text-xl font-bold text-slate-900">รายงานผลการพิจารณาจัดทำราคากลาง</h3></div>
          <div className="mt-4 text-sm leading-7">
            <p>ที่ ……………………………………… วันที่ {printDate}</p>
            <p><b>เรื่อง</b> รายงานผลการพิจารณาจัดทำราคากลาง {project.name}</p>
            <p className="text-indent-8">ตามที่ได้รับอนุมัติให้จัดทำราคากลางนั้น คณะผู้จัดทำได้ดำเนินการสำรวจและวิเคราะห์ราคา
              โดยอ้างอิงราคากลางท้องถิ่นจากสำนักงานนโยบายและแผนการขนส่ง (สนค.) และราคาที่ผู้ขาย/ผู้รับจ้างเสนอ
              พร้อมคำนวณตามหลักเกณฑ์การคำนวณราคากลางที่เกี่ยวข้อง{pinnedRs ? ` (ชุดกฎที่ใช้: ${pinnedRs.name} — ${pinnedRs.sourceDoc})` : " — ยังไม่ได้ระบุชุดกฎที่ใช้"}</p>
            <p className="text-indent-8">ผลการพิจารณา{calc ? <> ปรากฏราคากลาง {thb(satangToBaht(calc.total))} บาท ({bahtText(calc.total)})</> : " — ดูหมายเหตุความไม่พร้อมในฉบับที่ 7"}</p>
          </div>
          <WarningNote>
            ความถูกต้องของตัวเลขกฎหมาย (ตาราง Factor F, อัตรา %) ต้องตรวจกับเอกสารที่มีผลบังคับ — ระบบคำนวณตามชุดกฎที่ผู้ใช้นำเข้าเท่านั้น
          </WarningNote>
          <SigBlock roles={DOC_ROLES} />
        </>
      ),
    },

    // 3) ร่างประมาณราคาส่วน ก. — ค่าวัสดุอย่างน้อยที่สุด
    {
      title: "ร่างประมาณราคาส่วน ก. — ค่าวัสดุอย่างน้อยที่สุด",
      body: (() => {
        const rows = construction.map((it) => ({ it, s: splitSatang(it) }));
        const matTotal = rows.reduce((a, x) => a + x.s.mat, 0);
        return (
          <>
            <DocTitle no={3} total={TOTAL_DOCS} title="ร่างประมาณราคาส่วน ก. — ค่าวัสดุอย่างน้อยที่สุด" />
            <ProjectHead project={project} />
            {unsplitNames.length > 0 && (
              <WarningNote>รายการต่อไปนี้ยังไม่ได้แยกค่าวัสดุ/ค่าแรง จึงรวมอยู่ในส่วน ก. ทั้งจำนวน — ควรแยกใน editor ก่อนใช้เอกสาร: {unsplitNames.slice(0, 6).join(", ")}{unsplitNames.length > 6 ? " ฯลฯ" : ""}</WarningNote>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-left">
                  <th className="border border-slate-300 px-2 py-1">ลำดับ</th>
                  <th className="border border-slate-300 px-2 py-1">รายการ</th>
                  <th className="border border-slate-300 px-2 py-1">หน่วย</th>
                  <th className="border border-slate-300 px-2 py-1 text-right">ปริมาณ</th>
                  <th className="border border-slate-300 px-2 py-1 text-right">ราคาวัสดุ/หน่วย</th>
                  <th className="border border-slate-300 px-2 py-1 text-right">เงินรวม</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ it, s }, i) => (
                  s.mat > 0 ? (
                    <tr key={it.id}>
                      <td className="border border-slate-300 px-2 py-1">{i + 1}</td>
                      <td className="border border-slate-300 px-2 py-1">{it.name}{it.note ? ` (${it.note})` : ""}</td>
                      <td className="border border-slate-300 px-2 py-1">{it.unit}</td>
                      <td className="border border-slate-300 px-2 py-1 text-right">{it.qty.toLocaleString("th-TH", { maximumFractionDigits: 4 })}</td>
                      <td className="border border-slate-300 px-2 py-1 text-right">{it.matPrice !== undefined ? it.matPrice.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : it.price.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="border border-slate-300 px-2 py-1 text-right">{formatSatang(s.mat)}</td>
                    </tr>
                  ) : null
                ))}
                <tr className="font-semibold">
                  <td className="border border-slate-300 px-2 py-1 text-right" colSpan={5}>รวมส่วน ก. ค่าวัสดุอย่างน้อยที่สุด</td>
                  <td className="border border-slate-300 px-2 py-1 text-right">{formatSatang(matTotal)}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">( {bahtText(matTotal)} )</p>
            <SigBlock roles={DOC_ROLES} />
          </>
        );
      })(),
    },

    // 4) ร่างประมาณราคาส่วน ข. — ค่าแรงอย่างน้อยที่สุด
    {
      title: "ร่างประมาณราคาส่วน ข. — ค่าแรงอย่างน้อยที่สุด",
      body: (() => {
        const rows = construction.map((it) => ({ it, s: splitSatang(it) })).filter((x) => x.s.lab > 0);
        const labTotal = rows.reduce((a, x) => a + x.s.lab, 0);
        return (
          <>
            <DocTitle no={4} total={TOTAL_DOCS} title="ร่างประมาณราคาส่วน ข. — ค่าแรงอย่างน้อยที่สุด" />
            <ProjectHead project={project} />
            {rows.length === 0 && (
              <WarningNote>ยังไม่มีรายการที่ระบุค่าแรง — ใส่ช่อง "วัสดุ / แรงงาน" ใน editor หรือเลือกราคาจากคลังของฉันหมวด ค่าแรง ก่อนพิมพ์ฉบับนี้</WarningNote>
            )}
            {pinnedRs?.labor && (
              <p className="mb-2 text-xs text-slate-500">เกณฑ์ % ค่าแรงตามชุดกฎ: {pinnedRs.labor.minPct}–{pinnedRs.labor.maxPct}% ของต้นทุนโดยตรง — ตรวจว่าอัตราค่าแรงต่อหน่วยที่ใช้อยู่ในช่วงนี้</p>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-left">
                  <th className="border border-slate-300 px-2 py-1">ลำดับ</th>
                  <th className="border border-slate-300 px-2 py-1">รายการ</th>
                  <th className="border border-slate-300 px-2 py-1">หน่วย</th>
                  <th className="border border-slate-300 px-2 py-1 text-right">ปริมาณ</th>
                  <th className="border border-slate-300 px-2 py-1 text-right">ราคาแรงงาน/หน่วย</th>
                  <th className="border border-slate-300 px-2 py-1 text-right">เงินรวม</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ it, s }, i) => (
                  <tr key={it.id}>
                    <td className="border border-slate-300 px-2 py-1">{i + 1}</td>
                    <td className="border border-slate-300 px-2 py-1">{it.name}{it.note ? ` (${it.note})` : ""}</td>
                    <td className="border border-slate-300 px-2 py-1">{it.unit}</td>
                    <td className="border border-slate-300 px-2 py-1 text-right">{it.qty.toLocaleString("th-TH", { maximumFractionDigits: 4 })}</td>
                    <td className="border border-slate-300 px-2 py-1 text-right">{(it.laborPrice ?? it.price).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="border border-slate-300 px-2 py-1 text-right">{formatSatang(s.lab)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="border border-slate-300 px-2 py-1 text-right" colSpan={5}>รวมส่วน ข. ค่าแรงอย่างน้อยที่สุด</td>
                  <td className="border border-slate-300 px-2 py-1 text-right">{formatSatang(labTotal)}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">( {bahtText(labTotal)} )</p>
            <SigBlock roles={DOC_ROLES} />
          </>
        );
      })(),
    },

    // 5) ส่วน ค. — เงินเผื่อจำเป็น
    {
      title: "ร่างประมาณราคาส่วน ค. — เงินเผื่อจำเป็น",
      body: (
        <>
          <DocTitle no={5} total={TOTAL_DOCS} title="ร่างประมาณราคาส่วน ค. — เงินเผื่อจำเป็น" />
          <ProjectHead project={project} />
          {calc?.contingency !== null && calc ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-left">
                  <th className="border border-slate-300 px-2 py-1">รายการ</th>
                  <th className="border border-slate-300 px-2 py-1 text-right">จำนวนเงิน</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-slate-300 px-2 py-1">
                    เงินเผื่อจำเป็น {pinnedRs?.contingencyPct}% ของยอดหลังปรับ Factor F
                    <span className="block text-xs text-slate-500">ฐานคำนวณ: {formatSatang(calc.afterFactor ?? 0)} บาท · อัตราจาก: {pinnedRs?.sourceDoc}</span>
                  </td>
                  <td className="border border-slate-300 px-2 py-1 text-right">{formatSatang(calc.contingency)}</td>
                </tr>
                <tr className="font-semibold">
                  <td className="border border-slate-300 px-2 py-1 text-right">รวมส่วน ค.</td>
                  <td className="border border-slate-300 px-2 py-1 text-right">{formatSatang(calc.contingency)}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <WarningNote>
              ยังคำนวณส่วน ค. ไม่ได้ — {gov?.err ? `คำนวณไม่สำเร็จ: ${gov.err}` : "ชุดกฎที่ pin ไม่ได้ระบุ % เงินเผื่อจำเป็น (unverified: ตรวจอัตราจากเอกสารที่มีผลบังคับแล้วนำเข้าที่หน้าชุดกฎ)"}
            </WarningNote>
          )}
          <SigBlock roles={DOC_ROLES} />
        </>
      ),
    },

    // 6) ส่วน ง. — ค่าดำเนินงาน
    {
      title: "ร่างประมาณราคาส่วน ง. — ค่าดำเนินงาน (S.W.C.)",
      body: (
        <>
          <DocTitle no={6} total={TOTAL_DOCS} title="ร่างประมาณราคาส่วน ง. — ค่าดำเนินงาน (S.W.C.)" />
          <ProjectHead project={project} />
          {calc?.swc !== null && calc ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-left">
                  <th className="border border-slate-300 px-2 py-1">รายการ</th>
                  <th className="border border-slate-300 px-2 py-1 text-right">จำนวนเงิน</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-slate-300 px-2 py-1">
                    ค่าดำเนินงาน {pinnedRs?.swcPct}% ของยอดรวมก่อนค่าดำเนินงาน
                    <span className="block text-xs text-slate-500">ฐานคำนวณ: {formatSatang((calc.afterFactor ?? 0) + (calc.contingency ?? 0))} บาท · อัตราจาก: {pinnedRs?.sourceDoc}</span>
                  </td>
                  <td className="border border-slate-300 px-2 py-1 text-right">{formatSatang(calc.swc)}</td>
                </tr>
                {calc.equipmentAmount !== null && (
                  <tr>
                    <td className="border border-slate-300 px-2 py-1">
                      ค่าดำเนินงานครุภัณฑ์ {pinnedRs?.durableHandlingPct}% ของราคาครุภัณฑ์ (แยกฐาน — ไม่เข้า Factor F)
                      <span className="block text-xs text-slate-500">ฐานคำนวณ: {formatSatang(calc.equipmentAmount)} บาท</span>
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-right">{calc.installAmount !== null ? formatSatang(calc.installAmount) : "—"}</td>
                  </tr>
                )}
                <tr className="font-semibold">
                  <td className="border border-slate-300 px-2 py-1 text-right">รวมส่วน ง.</td>
                  <td className="border border-slate-300 px-2 py-1 text-right">{formatSatang((calc.swc ?? 0) + (calc.installAmount ?? 0))}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <WarningNote>
              ยังคำนวณส่วน ง. ไม่ได้ — {gov?.err ? `คำนวณไม่สำเร็จ: ${gov.err}` : "ชุดกฎที่ pin ไม่ได้ระบุ % ค่าดำเนินงาน (unverified: ตรวจอัตราจากเอกสารที่มีผลบังคับแล้วนำเข้าที่หน้าชุดกฎ)"}
            </WarningNote>
          )}
          <SigBlock roles={DOC_ROLES} />
        </>
      ),
    },

    // 7) สรุปราคากลาง + Factor F + บาทถ้วน + trace
    {
      title: "สรุปการคำนวณราคากลาง",
      body: (
        <>
          <DocTitle no={7} total={TOTAL_DOCS} title="สรุปการคำนวณราคากลาง" />
          <ProjectHead project={project} />
          {gov?.err && <WarningNote>คำนวณไม่สำเร็จ: {gov.err} — ราคากลางรวมยังไม่พร้อมใช้ (ห้ามนำตัวเลขนอกตารางไปอ้างอิง)</WarningNote>}
          {calc && (
            <>
              {pinnedRs ? (
                <p className="mb-2 text-xs text-slate-500">
                  ชุดกฎ: {pinnedRs.name} · ที่มา: {pinnedRs.sourceDoc} · มีผล {pinnedRs.effectiveFrom} · checksum {pinnedRs.checksum.slice(0, 8)}…
                  {pinnedRs.factorF && <> · พารามิเตอร์ตาราง: ทดรองจ่าย {pinnedRs.factorF.advancePct}% / ประกันผลงาน {pinnedRs.factorF.retentionPct}% / ดอกเบี้ย {pinnedRs.factorF.interestPct}% / VAT {pinnedRs.factorF.vatPct}%</>}
                </p>
              ) : (
                <WarningNote>ยังไม่ได้ pin ชุดกฎ — ตัวเลขด้านล่างคำนวณแบบไม่ปรับ Factor F (F = 1)</WarningNote>
              )}
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-100 text-left">
                    <th className="border border-slate-300 px-2 py-1">ขั้นตอน</th>
                    <th className="border border-slate-300 px-2 py-1">สูตร / หมายเหตุ</th>
                    <th className="border border-slate-300 px-2 py-1 text-right">จำนวนเงิน (บาท)</th>
                  </tr>
                </thead>
                <tbody>
                  {calc.steps.map((s, i) => (
                    <tr key={i} className={s.kind === "total" ? "font-bold" : ""}>
                      <td className="border border-slate-300 px-2 py-1">{s.label}</td>
                      <td className="border border-slate-300 px-2 py-1 text-xs text-slate-600">
                        {s.formula ?? ""}
                        {s.notes?.length ? <span className="block">{s.notes.join(" · ")}</span> : null}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-right">{formatSatang(s.satang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-sm font-semibold text-slate-800">
                ราคากลางรวม {formatSatang(calc.total)} บาท &nbsp;( {bahtText(calc.total)} )
              </p>
              {calc.warnings.length > 0 && (
                <div className="mt-3 rounded border border-amber-400 p-2 text-xs text-amber-900">
                  <b>ข้อสังเกต/คำเตือน (แสดงในเอกสารตามหลักความโปร่งใส):</b>
                  <ul className="mt-1 list-disc pl-5">
                    {calc.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
            </>
          )}
          <SigBlock roles={DOC_ROLES} />
        </>
      ),
    },

    // 8) รายละเอียดราคาวัสดุพร้อม PriceEvidence
    {
      title: "รายละเอียดราคาและหลักฐานที่มาราคา (PriceEvidence)",
      body: (
        <>
          <DocTitle no={8} total={TOTAL_DOCS} title="รายละเอียดราคาและหลักฐานที่มาราคา" />
          <ProjectHead project={project} />
          {staleItems.length > 0 && (
            <WarningNote>{staleItems.length} รายการใช้ราคาอ้างอิงเก่าเกิน 12 เดือน — ควรสำรวจราคาใหม่ก่อนใช้เอกสาร</WarningNote>
          )}
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 text-left">
                <th className="border border-slate-300 px-2 py-1">ลำดับ</th>
                <th className="border border-slate-300 px-2 py-1">รายการ</th>
                <th className="border border-slate-300 px-2 py-1">ที่มาราคา</th>
                <th className="border border-slate-300 px-2 py-1 text-right">ราคา ณ ตอนเลือก</th>
                <th className="border border-slate-300 px-2 py-1 text-right">ราคาปัจจุบัน</th>
                <th className="border border-slate-300 px-2 py-1">วันที่เลือกราคา</th>
              </tr>
            </thead>
            <tbody>
              {project.items.map((it, i) => (
                <tr key={it.id}>
                  <td className="border border-slate-300 px-2 py-1">{i + 1}</td>
                  <td className="border border-slate-300 px-2 py-1">{it.name || "—"}</td>
                  <td className="border border-slate-300 px-2 py-1">{sourceLabel(it)}</td>
                  <td className="border border-slate-300 px-2 py-1 text-right">{it.source ? it.source.priceAtPick.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</td>
                  <td className="border border-slate-300 px-2 py-1 text-right">{it.price.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="border border-slate-300 px-2 py-1">{it.source ? new Date(it.source.pickedAt).toLocaleDateString("th-TH") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">
            ราคา สนค. = ราคากลางท้องถิ่นเพื่อประกอบการประมาณการ — ไม่ใช่ราคามาตรฐานของกรมบัญชีกลางหรือหน่วยงานใด ควรปรับตามราคาจริงของพื้นที่ก่อนใช้ประกอบการจัดซื้อจัดจ้าง
          </p>
          <SigBlock roles={DOC_ROLES} />
        </>
      ),
    },

    // 9) บันทึกเปรียบเทียบราคาผู้ขาย (แบบฟอร์มกรอกภายหลัง)
    {
      title: "บันทึกเปรียบเทียบราคาเสนอจากผู้ขาย/ผู้รับจ้าง",
      body: (
        <>
          <DocTitle no={9} total={TOTAL_DOCS} title="บันทึกเปรียบเทียบราคาเสนอจากผู้ขาย/ผู้รับจ้าง" />
          <ProjectHead project={project} />
          <p className="mb-2 text-xs text-slate-500">แบบฟอร์มเปรียบเทียบ — กรอกราคาที่ผู้ขายเสนอจริงอย่างน้อย 2–3 ราย แล้วเปรียบเทียบกับราคา สนค. ก่อนตัดสินใจ</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 text-left">
                <th className="border border-slate-300 px-2 py-1">ลำดับ</th>
                <th className="border border-slate-300 px-2 py-1">รายการ</th>
                <th className="border border-slate-300 px-2 py-1 text-right">ราคา สนค.</th>
                <th className="border border-slate-300 px-2 py-1">ผู้ขายที่ 1</th>
                <th className="border border-slate-300 px-2 py-1">ผู้ขายที่ 2</th>
                <th className="border border-slate-300 px-2 py-1">ผู้ขายที่ 3</th>
              </tr>
            </thead>
            <tbody>
              {project.items.slice(0, 40).map((it, i) => (
                <tr key={it.id}>
                  <td className="border border-slate-300 px-2 py-1">{i + 1}</td>
                  <td className="border border-slate-300 px-2 py-1">{it.name || "—"} ({it.unit})</td>
                  <td className="border border-slate-300 px-2 py-1 text-right">{it.price.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="border border-slate-300 px-2 py-1"></td>
                  <td className="border border-slate-300 px-2 py-1"></td>
                  <td className="border border-slate-300 px-2 py-1"></td>
                </tr>
              ))}
            </tbody>
          </table>
          {project.items.length > 40 && <p className="mt-1 text-xs text-slate-500">แสดง 40 รายการแรกจาก {project.items.length} รายการ — หน้าถัดไปให้ทำสำเนาตารางต่อท้าย</p>}
          <div className="mt-4 text-sm leading-7">
            <p><b>ข้อสรุป:</b> ………………………………………………………………………………………………</p>
          </div>
          <SigBlock roles={["ผู้เปรียบเทียบราคา 1", "ผู้เปรียบเทียบราคา 2", "ผู้อนุมัติ"]} />
        </>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* หัว-ท้ายกระดาษซ้ำทุกหน้าตอนพิมพ์ (F3.2) — ซ่อนบนหน้าจอ */}
      <div className="print-header">
        {project.name} · แบบฟอร์ม {project.boqType} · {isPrivate ? "ใบเสนอราคา" : "ชุดเอกสารราคากลาง"}
      </div>
      <div className="print-footer">
        พิมพ์จากระบบ iserv BOQ — วันที่พิมพ์ {printDate} · เปิดเลขหน้าจากตัวเลือก &quot;ส่วนหัวและส่วนท้าย&quot; ของเบราว์เซอร์
      </div>

      <div className="no-print mb-6 flex flex-wrap items-center gap-2">
        <a href={`/projects/${projectId}`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">← กลับ editor</a>
        <button onClick={() => window.print()} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">พิมพ์ทั้งชุด (9 ฉบับ)</button>
        {unsplitNames.length > 0 && (
          <span className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            ⚠ {unsplitNames.length} รายการยังไม่แยก ก./ข. — ดูเตือนในฉบับที่ 3 และ 4
          </span>
        )}
        {gov?.err && (
          <span className="rounded-lg border border-red-400 bg-red-50 px-3 py-2 text-xs text-red-800">คำนวณราคากลางไม่สำเร็จ: {gov.err}</span>
        )}
      </div>

      {sheets.map((s, i) => (
        <div key={i}>
          <div className="no-print mb-1 flex justify-end">
            <button onClick={() => printOne(i)} className="text-xs text-blue-700 underline">พิมพ์เฉพาะฉบับที่ {i + 1}</button>
          </div>
          <section className={`doc-sheet bg-white p-8 ${only !== null && only !== i ? "no-print" : ""}`}>
            {s.body}
          </section>
        </div>
      ))}
    </div>
  );
}
