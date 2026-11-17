"use client";

// เครื่องคิดค่าแรงงาน/ค่าดำเนินการตามบัญชี กค 0433.2/ว 480 — หน้าจออ้างอิง
// กฎ: ระบบไม่เลือก variant/ช่วงจำนวนงานให้ — ผู้ใช้ต้องเลือกแถวราคาจากต้นฉบับเอง
//      (ช่วงจำนวนในบัญชีทับกันที่ขอบ และบางแถวต้นฉบับไม่ได้พิมพ์ชื่อแยก)
//      ราคาเป็นบาทเต็มตามประกาศ → คำนวณเป็นสตางค์ integer และปัด half-up ครั้งเดียว

import { useMemo, useState } from "react";
import type { WageSchedule } from "@/lib/ruleset";
import { countWageRates, listWageRates, wageCost } from "@/lib/calc/wage";
import { formatSatang } from "@/lib/calc/money";
import { decimalPlaces, parseDecimal } from "./decimal-input";

type Provenance = {
  rulesetId?: string;
  rulesetChecksum?: string;
  sourceDoc?: string;
  sourceKind?: "official" | "mirror-unverified";
  verifiedAgainstGazette?: boolean;
};

export default function WageCalculator({
  schedule,
  provenance,
}: {
  schedule: WageSchedule;
  provenance?: Provenance;
}) {
  const [query, setQuery] = useState("");
  const [entryNo, setEntryNo] = useState("");
  const [rateKey, setRateKey] = useState("");
  const [qty, setQty] = useState("");

  const all = useMemo(
    () =>
      schedule.entries
        .map((entry) => ({ entry, rates: listWageRates(entry) }))
        .filter((x) => x.rates.length > 0),
    [schedule],
  );
  const rateCount = useMemo(() => countWageRates(schedule), [schedule]);

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return all;
    return all.filter(
      (x) =>
        x.entry.no.toLowerCase().includes(q) ||
        (x.entry.noPrinted ?? "").toLowerCase().includes(q) ||
        x.entry.name.toLowerCase().includes(q) ||
        x.rates.some((r) => r.label.toLowerCase().includes(q)),
    );
  }, [all, q]);
  const shown = matches.slice(0, 80);
  const selected = all.find((x) => x.entry.no === entryNo) ?? null;
  const options = selected && !shown.some((x) => x.entry.no === selected.entry.no) ? [selected, ...shown] : shown;

  const selectedRate = selected?.rates.find((r) => r.key === rateKey) ?? null;

  const qtyText = qty.trim();
  const qtyParsed = qtyText === "" ? undefined : parseDecimal(qtyText);
  const qtyNum = qtyParsed ?? undefined;
  const qtyDecimals = decimalPlaces(qtyText);
  const qtyMalformed = qtyText !== "" && qtyParsed === null;
  const qtyTooPrecise = qtyText !== "" && qtyDecimals !== null && qtyDecimals > 4;
  const qtyNonPositive = qtyNum !== undefined && qtyNum <= 0;
  const qtyInvalid = qtyMalformed || qtyTooPrecise || qtyNonPositive;

  const result =
    selectedRate && !qtyInvalid
      ? wageCost(schedule, {
          entryNo: selectedRate.entryNo,
          variantPath: selectedRate.variantPath,
          priceIndex: selectedRate.priceIndex,
          quantity: qtyNum,
          provenance,
        })
      : null;

  function chooseEntry(no: string) {
    setEntryNo(no);
    setRateKey("");
  }

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-xs text-slate-500">
        บัญชีค่าแรงงาน/ดำเนินการ ว 480 — {all.length} รายการที่มีราคา · {rateCount.toLocaleString("th-TH")} แถวราคา
        (ราคาเป็นบาทเต็มต่อหน่วยตามที่พิมพ์)
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-slate-600">
          ค้นหารายการ (เลขลำดับ/ชื่องาน/ขนาด)
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="เช่น 1.1 หรือ เสาเข็ม หรือ Dia 2"
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
          />
        </label>

        <label className="block text-xs text-slate-600">
          รายการค่าแรง
          <select
            value={entryNo}
            onChange={(e) => chooseEntry(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
          >
            <option value="">— เลือกรายการ —</option>
            {options.map((x) => (
              <option key={x.entry.no} value={x.entry.no}>
                {x.entry.no}
                {x.entry.noPrinted ? ` (พิมพ์ ${x.entry.noPrinted})` : ""} — {x.entry.name}
              </option>
            ))}
          </select>
          {matches.length > shown.length && (
            <span className="mt-1 block text-xs text-slate-500">
              แสดง {shown.length} จาก {matches.length} รายการ — พิมพ์คำค้นเพิ่มเพื่อจำกัด (เช่น เลขลำดับหรือชื่องาน)
            </span>
          )}
        </label>

        <label className="block text-xs text-slate-600 sm:col-span-2">
          แถวราคา/ขนาด/ช่วงจำนวนงาน
          <select
            value={rateKey}
            onChange={(e) => setRateKey(e.target.value)}
            disabled={!selected}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 disabled:bg-slate-100"
          >
            <option value="">
              {!selected
                ? "— เลือกรายการก่อน —"
                : selected.rates.length === 1
                  ? "— เลือกแถวราคา (มีแถวเดียว) —"
                  : "— เลือกแถวราคา —"}
            </option>
            {selected?.rates.map((r) => (
              <option key={r.key} value={r.key}>
                #{r.ordinal} {r.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs text-slate-600">
          ปริมาณ {selectedRate ? `(${selectedRate.unit})` : ""} — เว้นว่างเพื่อดูอัตราต่อหน่วย
          <input
            type="text"
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder={selectedRate ? `เช่น 12.5 (${selectedRate.unit})` : "เช่น 12.5"}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
          />
        </label>
      </div>

      {selected && selected.rates.length > 1 && (
        <p className="mt-2 text-xs text-amber-900">
          ⚠ รายการนี้มี {selected.rates.length} แถวราคา (ขนาด/ช่วงจำนวนงาน/ตัวเลือก) — ระบบ<u>ไม่เลือกให้</u>
          ต้องเลือกแถวให้ตรงกับงานจริงตามต้นฉบับ
        </p>
      )}

      {selected?.entry.anomaly && (
        <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          ⚠ ข้อมูลต้นฉบับมีข้อสังเกต: {selected.entry.anomaly} — ตรวจต้นฉบับก่อนใช้เลขลำดับ/ราคานี้
        </p>
      )}

      {selectedRate?.ambiguous && (
        <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          ⚠ แถวราคาที่เลือกมีคำอธิบายซ้ำกับแถวอื่นในรายการเดียวกัน — ต้นฉบับอาจมีรายละเอียดที่แยกไม่ได้จากข้อมูลนี้
          ต้องตรวจต้นฉบับก่อนใช้
        </p>
      )}

      {qtyMalformed && (
        <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          ปริมาณไม่ถูกต้อง — ใช้ตัวเลขทศนิยมฐาน 10 และจุด "." (เช่น 12.5) ระบบไม่รับเครื่องหมายจุลภาค
        </p>
      )}
      {qtyTooPrecise && (
        <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          ปริมาณรองรับทศนิยมไม่เกิน 4 ตำแหน่ง (เช่น 12.375) — ระบบไม่ปัดปริมาณให้
        </p>
      )}
      {qtyNonPositive && (
        <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          ปริมาณต้องมากกว่า 0
        </p>
      )}

      {!selectedRate && !qtyInvalid && (
        <p className="mt-3 rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
          เลือกรายการและแถวราคาเพื่อคำนวณ — ระบบใช้ราคาตามที่พิมพ์ในบัญชีเท่านั้น ไม่ประมาณค่า และไม่เลือกช่วงจำนวนงานแทนผู้ใช้
        </p>
      )}

      {result && !result.ok && (
        <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          คำนวณไม่ได้: {result.error}
        </p>
      )}

      {result && result.ok && (
        <div className="mt-3 rounded border border-blue-200 bg-white px-3 py-2 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-slate-600">{result.entry.no} — {result.entry.name}</span>
            <b className="text-blue-950">
              {formatSatang(result.perUnitSatang)} บาท/{result.unit}
            </b>
          </div>
          {result.amountSatang !== null ? (
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2 border-t border-slate-100 pt-1">
              <span className="text-slate-600">
                รวม {qty} {result.unit}
              </span>
              <b className="text-blue-950">{formatSatang(result.amountSatang)} บาท</b>
            </div>
          ) : (
            <p className="mt-1 border-t border-slate-100 pt-1 text-xs text-slate-500">
              ยังไม่ระบุปริมาณ — แสดงเฉพาะอัตราต่อหน่วย
            </p>
          )}
          {result.amountSatang !== null && (
            <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
              ⚠ ระบบไม่ตรวจว่าปริมาณ {qty} {result.unit} ตรงกับเงื่อนไขจำนวนของแถวราคาที่เลือกหรือไม่ —
              เงื่อนไขเป็นข้อความอิสระจากต้นฉบับ ต้องเทียบกับบัญชีเองก่อนใช้
            </p>
          )}
          <ul className="mt-2 list-disc pl-5 text-xs text-slate-500">
            {result.notes
              .filter((n) => !n.startsWith("ระบบไม่เลือก variant"))
              .map((n, i) => (
                <li key={i}>{n}</li>
              ))}
          </ul>
        </div>
      )}

      {selected && selected.entry.notes.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-blue-700">
            หมายเหตุของรายการนี้ ({selected.entry.notes.length})
          </summary>
          <ul className="mt-1 list-disc pl-5 text-xs text-slate-500">
            {selected.entry.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </details>
      )}

      <p className="mt-2 text-xs text-amber-900">
        ⚠ จัดทำด้วยระบบ iserv BOQ — ไม่ใช่ราคามาตรฐานของกรมบัญชีกลาง ·{" "}
        {provenance?.sourceKind === "official" && provenance.verifiedAgainstGazette === true
          ? "ตัวเลขจากชุดกฎที่ระบุว่ายืนยันกับต้นฉบับทางการแล้ว"
          : "ตัวเลขถอดจาก PDF mirror (ยังไม่ยืนยันกับราชกิจจานุเบกษา/เล่มจริง)"}{" "}
        · ค่าแรงตามบัญชีนี้เป็น &quot;ต้นทุน&quot; ยังไม่รวมค่าวัสดุ Factor F กำไร หรือ VAT
      </p>
    </div>
  );
}
