"use client";

// เครื่องคิดค่าเครื่องจักรตามตาราง กค 0433.2/ว 475 — หน้าจออ้างอิง (ข้อมูลอยู่ในชุดกฎที่ติดตั้งในเครื่อง)
// กฎ: ไม่เดาค่า — ราคาน้ำมันนอกช่วงตาราง/บรรทัดไม่มีราคา → แสดง error ตามผลจาก lib/calc/machinery.ts

import { useMemo, useState } from "react";
import type { MachineryRateSchedule } from "@/lib/ruleset";
import { machineryCost } from "@/lib/calc/machinery";
import { formatSatang, toSatang } from "@/lib/calc/money";

const keyOf = (i: { entryNo: number; label: string; occurrence: number }) => `${i.entryNo}|${i.label}|${i.occurrence}`;

// รับเฉพาะเลขฐาน 10 ที่ใช้ "." เป็นทศนิยม — ไม่รับ "," (กัน "2,5" ถูกตีความเป็น 25 แล้วคำนวณผิดเงียบ)
const DECIMAL_ONLY = /^\d+(\.\d+)?$/;

function parseDecimal(text: string): number | null {
  const t = text.trim();
  if (t === "" || !DECIMAL_ONLY.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function MachineryCalculator({
  schedule,
  provenance,
}: {
  schedule: MachineryRateSchedule;
  provenance?: { rulesetId?: string; rulesetChecksum?: string };
}) {
  const priced = useMemo(() => schedule.items.filter((i) => i.priced !== "none"), [schedule]);
  const [sel, setSel] = useState(() => (priced[0] ? keyOf(priced[0]) : ""));
  const [fuel, setFuel] = useState("");
  const [rainy, setRainy] = useState(false);
  const [qty, setQty] = useState("1");

  const picked = priced.find((i) => keyOf(i) === sel) ?? null;

  const fuelNum = parseDecimal(fuel);
  const fuelInvalid = fuel.trim() !== "" && fuelNum === null;
  const fuelSatang = fuelNum !== null && fuelNum > 0 ? toSatang(fuelNum) : null;

  const qtyRaw = qty.trim();
  const qtyParsed = parseDecimal(qtyRaw);
  const qtyInvalid = qtyRaw !== "" && qtyParsed === null;
  const qtyNum = qtyRaw === "" ? undefined : (qtyParsed ?? undefined);

  const result =
    picked && fuelSatang !== null && !qtyInvalid
      ? machineryCost(schedule, {
          entryNo: picked.entryNo,
          label: picked.label,
          occurrence: picked.occurrence,
          fuelPriceSatang: fuelSatang,
          rainy,
          quantity: qtyNum,
          provenance,
        })
      : null;

  const unitText = picked?.priced === "lump" ? "ครั้ง" : (picked?.unit ?? "หน่วย");
  const fuelLo = schedule.bands[0] ? (schedule.bands[0].fuelMinSatang / 100).toFixed(2) : "?";
  const fuelHi = schedule.bands.length
    ? (schedule.bands[schedule.bands.length - 1].fuelMaxSatang / 100).toFixed(2)
    : "?";

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-xs text-slate-500">
        ฐานราคาน้ำมัน: <b>{schedule.fuelPriceBasis}</b> · ตารางครอบ {fuelLo}–{fuelHi} บาท/ลิตร (นอกช่วงนี้ระบบจะไม่คำนวณ)
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs text-slate-600">
          รายการงาน
          <select
            value={sel}
            onChange={(e) => setSel(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
          >
            {priced.map((i) => (
              <option key={keyOf(i)} value={keyOf(i)}>
                {i.entryNo}. {i.label}
                {i.occurrence > 1 ? ` (${i.occurrence})` : ""} — {i.priced === "lump" ? "ครั้ง" : (i.unit ?? "หน่วย")}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs text-slate-600">
          ราคาน้ำมันดีเซล (บาท/ลิตร)
          <input
            type="text"
            inputMode="decimal"
            value={fuel}
            onChange={(e) => setFuel(e.target.value)}
            placeholder="เช่น 30.50"
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
          />
        </label>

        <div className="text-xs text-slate-600">
          สภาพงาน
          <div className="mt-1 flex gap-3 rounded border border-slate-300 bg-white px-2 py-1.5">
            <label className="flex items-center gap-1">
              <input type="radio" name="rainy" checked={!rainy} onChange={() => setRainy(false)} /> ปกติ
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" name="rainy" checked={rainy} onChange={() => setRainy(true)} /> ฝนชุก
            </label>
          </div>
        </div>

        <label className="block text-xs text-slate-600">
          ปริมาณ ({unitText}){picked?.priced === "lump" ? " — จำนวนครั้ง (เต็ม)" : ""}
          <input
            type="text"
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
          />
        </label>
      </div>

      {fuelInvalid && (
        <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          ราคาน้ำมันไม่ถูกต้อง — ใช้ตัวเลขทศนิยมฐาน 10 และจุด "." (เช่น 30.50) ระบบไม่รับเครื่องหมายจุลภาค
        </p>
      )}

      {qtyInvalid && (
        <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          ปริมาณไม่ถูกต้อง — ใช้ตัวเลขทศนิยมฐาน 10 และจุด "." (เช่น 12.375) ระบบไม่รับเครื่องหมายจุลภาค
        </p>
      )}

      {!result && !fuelInvalid && !qtyInvalid && (
        <p className="mt-3 rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
          ระบุราคาน้ำมันดีเซล (บาท/ลิตร) เพื่อคำนวณ — ระบบใช้เฉพาะช่วง {fuelLo}–{fuelHi} บาท/ลิตร ตามตาราง ไม่ประมาณค่าออกนอกช่วง
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
            <span className="text-slate-600">
              {result.isLump ? "ค่าก้อนเดียว" : `ค่าดำเนินการ + ค่าเสื่อมราคา (${result.rainy ? "ฝนชุก" : "ปกติ"})`}
            </span>
            <b className="text-blue-950">
              {formatSatang(result.perUnitSatang)} บาท/{unitText === "ครั้ง" ? "ครั้ง" : unitText}
            </b>
          </div>
          {result.amountSatang !== null && (
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2 border-t border-slate-100 pt-1">
              <span className="text-slate-600">
                รวม {qty} {unitText}
              </span>
              <b className="text-blue-950">{formatSatang(result.amountSatang)} บาท</b>
            </div>
          )}
          <ul className="mt-2 list-disc pl-5 text-xs text-slate-500">
            {result.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-2 text-xs text-amber-900">
        ⚠ จัดทำด้วยระบบ iserv BOQ — ไม่ใช่ราคามาตรฐานของกรมบัญชีกลาง · ตัวเลขถอดจาก PDF mirror (ยังไม่ยืนยันกับราชกิจจานุเบกษา/เล่มจริง) ·
        ค่าเครื่องจักรเป็น "ต้นทุน" ยังไม่รวม Factor F/กำไร/VAT
      </p>
    </div>
  );
}
