"use client";

// เครื่องคิดค่าขนส่งวัสดุก่อสร้างตามตาราง กค 0433.2/ว 477 — หน้าจออ้างอิง (ข้อมูลอยู่ในชุดกฎที่ติดตั้งในเครื่อง)
// กฎ: ตารางใช้ได้เฉพาะเมื่อสภาพงานตรงเงื่อนไขหัวตาราง → ต้องให้ผู้ใช้ยืนยันก่อนคำนวณเสมอ
//      ราคาน้ำมันนอกช่วง / ระยะนอกตาราง / ระยะไม่เป็นจำนวนเต็ม → แสดง error ตามผลจาก lib/calc/transport.ts (ไม่เดาค่า)

import { useId, useMemo, useState } from "react";
import type { TransportCargo } from "@/lib/calc/transport";
import type { TransportSchedule, TransportTruckSection } from "@/lib/ruleset";
import { transportCost } from "@/lib/calc/transport";
import { formatSatang, toSatang } from "@/lib/calc/money";
import { decimalPlaces, parseDecimal, parseInteger } from "./decimal-input";

const sectionKey = (s: TransportTruckSection) => `${s.lorryCount}|${s.hasTrailer}`;

export default function TransportCalculator({
  schedule,
  provenance,
}: {
  schedule: TransportSchedule;
  provenance?: { rulesetId?: string; rulesetChecksum?: string };
}) {
  const checkboxId = useId();
  const [sel, setSel] = useState(() => (schedule.sections[0] ? sectionKey(schedule.sections[0]) : ""));
  const [gross, setGross] = useState("");
  const [fuel, setFuel] = useState("");
  const [distance, setDistance] = useState("");
  const [cargo, setCargo] = useState<TransportCargo>("ton");
  const [qty, setQty] = useState("1");
  const [conditionsAccepted, setConditionsAccepted] = useState(false);

  const section = useMemo(
    () => schedule.sections.find((s) => sectionKey(s) === sel) ?? null,
    [schedule, sel],
  );

  const fuelNum = parseDecimal(fuel);
  const fuelDecimals = decimalPlaces(fuel);
  const fuelTooPrecise = fuel.trim() !== "" && fuelDecimals !== null && fuelDecimals > 2;
  const fuelMalformed = fuel.trim() !== "" && fuelNum === null;
  const fuelInvalid = fuelMalformed || fuelTooPrecise;
  const fuelSatang = !fuelInvalid && fuelNum !== null && fuelNum > 0 ? toSatang(fuelNum) : null;

  const distanceNum = parseInteger(distance);
  const distanceInvalid = distance.trim() !== "" && distanceNum === null;

  const grossNum = parseDecimal(gross);
  const grossInvalid = gross.trim() !== "" && grossNum === null;
  const grossTons = gross.trim() === "" ? undefined : (grossNum ?? undefined);

  const qtyRaw = qty.trim();
  const qtyParsed = parseDecimal(qtyRaw);
  const qtyInvalid = qtyRaw !== "" && qtyParsed === null;
  const qtyNum = qtyRaw === "" ? undefined : (qtyParsed ?? undefined);

  const ready =
    conditionsAccepted &&
    section !== null &&
    fuelSatang !== null &&
    distanceNum !== null &&
    !grossInvalid &&
    !qtyInvalid;

  const result = ready
    ? transportCost(schedule, {
        lorryCount: section.lorryCount,
        hasTrailer: section.hasTrailer,
        grossTons,
        fuelPriceSatang: fuelSatang,
        distanceKm: distanceNum,
        cargo,
        quantity: qtyNum,
        conditionsAccepted,
        provenance,
      })
    : null;

  const unitLabel = cargo === "ton" ? "ตัน" : "ลบ.ม.";
  const fuelLo = section?.bands[0] ? (section.bands[0].fuelMinSatang / 100).toFixed(2) : "?";
  const fuelHi = section?.bands.length
    ? (section.bands[section.bands.length - 1].fuelMaxSatang / 100).toFixed(2)
    : "?";
  const distanceStart = schedule.distanceStartKm;
  const distanceTableEnd = schedule.sections[0]?.bands[0]?.perTonSatang.length
    ? distanceStart + schedule.sections[0].bands[0].perTonSatang.length - 1
    : null;
  const distanceFarEnd = schedule.sections[0]?.bands[0]?.farMaxKm ?? null;

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-xs text-slate-500">
        ฐานราคาน้ำมัน: <b>{schedule.fuelPriceBasis}</b> · ตารางครอบ {fuelLo}–{fuelHi} บาท/ลิตร (นอกช่วงนี้ระบบจะไม่คำนวณ)
        {distanceTableEnd !== null && (
          <>
            {" "}· ระยะ {distanceStart}–{distanceTableEnd} กม. อ่านตาราง{distanceFarEnd !== null && distanceFarEnd > distanceTableEnd ? ` · ${distanceTableEnd + 1}–${distanceFarEnd} กม. คิดเป็น กม.ละ` : ""}
          </>
        )}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs text-slate-600">
          ประเภทรถ
          <select
            value={sel}
            onChange={(e) => setSel(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
          >
            {schedule.sections.map((s) => (
              <option key={sectionKey(s)} value={sectionKey(s)}>
                {s.truckType} — น้ำหนักรวมไม่เกิน {s.maxGrossTons} ตัน
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

        <label className="block text-xs text-slate-600">
          ระยะทางขนส่ง (กม. — จำนวนเต็ม)
          <input
            type="text"
            inputMode="numeric"
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            placeholder={`เช่น 41 (${distanceStart}–${distanceFarEnd ?? "?"})`}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
          />
        </label>

        <div className="text-xs text-slate-600">
          คิดค่าขนส่งต่อ
          <div className="mt-1 flex gap-3 rounded border border-slate-300 bg-white px-2 py-1.5">
            <label className="flex items-center gap-1">
              <input type="radio" name={`cargo-${checkboxId}`} checked={cargo === "ton"} onChange={() => setCargo("ton")} /> ตัน
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" name={`cargo-${checkboxId}`} checked={cargo === "m3"} onChange={() => setCargo("m3")} /> ลบ.ม.
            </label>
          </div>
        </div>

        <label className="block text-xs text-slate-600">
          น้ำหนักรวม (ตัน) — ไม่บังคับ ใช้ตรวจเพดานรถ
          <input
            type="text"
            inputMode="decimal"
            value={gross}
            onChange={(e) => setGross(e.target.value)}
            placeholder={section ? `ไม่เกิน ${section.maxGrossTons}` : "เช่น 12.5"}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
          />
        </label>

        <label className="block text-xs text-slate-600">
          ปริมาณ ({unitLabel}) — เว้นว่างเพื่อดูอัตราต่อหน่วย
          <input
            type="text"
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
          />
        </label>
      </div>

      <div className="mt-3 rounded border border-slate-300 bg-white px-3 py-2">
        <label htmlFor={checkboxId} className="flex items-start gap-2 text-xs text-slate-700">
          <input
            id={checkboxId}
            type="checkbox"
            checked={conditionsAccepted}
            onChange={(e) => setConditionsAccepted(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            ข้าพเจ้ายืนยันว่าสภาพงานหน้างานตรงเงื่อนไขการใช้ตาราง: <b>{schedule.conditions.join(" · ")}</b>
          </span>
        </label>
        <p className="mt-1 pl-5 text-xs text-amber-900">
          ⚠ ถ้าสภาพงานไม่ตรง (เช่น ผิวทางไม่ลาดยาง ภูมิประเทศเป็นเขา หรือการจราจรติดขัด) ตารางนี้ใช้ไม่ได้ — ระบบไม่ประมาณค่าแทน
        </p>
      </div>

      {fuelMalformed && (
        <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          ราคาน้ำมันไม่ถูกต้อง — ใช้ตัวเลขทศนิยมฐาน 10 และจุด "." (เช่น 30.50) ระบบไม่รับเครื่องหมายจุลภาค
        </p>
      )}

      {fuelTooPrecise && (
        <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          ราคาน้ำมันต้องมีทศนิยมไม่เกิน 2 ตำแหน่ง (เช่น 30.50) — ระบบไม่ปัดเศษราคาน้ำมันให้ เพราะอาจเปลี่ยนช่วงราคาในตาราง
        </p>
      )}

      {distanceInvalid && (
        <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          ระยะทางไม่ถูกต้อง — ต้องเป็นจำนวนเต็ม กม. ฐาน 10 (เช่น 41) ระบบไม่ปัดเศษระยะทางให้ และไม่รับเครื่องหมายจุลภาค
        </p>
      )}

      {grossInvalid && (
        <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          น้ำหนักรวมไม่ถูกต้อง — ใช้ตัวเลขทศนิยมฐาน 10 และจุด "." (เช่น 12.5) ระบบไม่รับเครื่องหมายจุลภาค
        </p>
      )}

      {qtyInvalid && (
        <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          ปริมาณไม่ถูกต้อง — ใช้ตัวเลขทศนิยมฐาน 10 และจุด "." (เช่น 12.375) ระบบไม่รับเครื่องหมายจุลภาค
        </p>
      )}

      {!conditionsAccepted && (
        <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          ยังไม่คำนวณ — ตาราง ว 477 ใช้ได้เฉพาะเมื่อสภาพงานตรงเงื่อนไขหัวตาราง ({schedule.conditions.join(" · ")}) ต้องยืนยันเงื่อนไขก่อน
        </p>
      )}

      {conditionsAccepted && section === null && (
        <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          ไม่พบประเภทรถที่เลือกในชุดกฎนี้ — เลือกประเภทรถใหม่ (ชุดกฎอาจถูกแทนที่/นำเข้าใหม่)
        </p>
      )}

      {conditionsAccepted && section !== null && !result && !fuelInvalid && !distanceInvalid && !grossInvalid && !qtyInvalid && (
        <p className="mt-3 rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
          ระบุราคาน้ำมันดีเซล (บาท/ลิตร) และระยะทาง (กม.) เพื่อคำนวณ — ระบบใช้เฉพาะช่วง {fuelLo}–{fuelHi} บาท/ลิตร และระยะ{" "}
          {distanceStart}–{distanceTableEnd ?? "?"} กม. (อ่านตาราง)
          {distanceFarEnd !== null && distanceTableEnd !== null && distanceFarEnd > distanceTableEnd
            ? ` · ${distanceTableEnd + 1}–${distanceFarEnd} กม. (คิด กม.ละ)`
            : ""}{" "}
          ตามตาราง ไม่ประมาณค่าออกนอกช่วง
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
              {result.section.truckType} · {result.basis === "table" ? "ราคาตามตาราง" : "คิดเป็น กม.ละ"}
            </span>
            <b className="text-blue-950">
              {formatSatang(result.perUnitSatang)} บาท/{unitLabel}
            </b>
          </div>
          {result.amountSatang !== null && (
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2 border-t border-slate-100 pt-1">
              <span className="text-slate-600">
                รวม {qty} {unitLabel}
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
        ค่าขนส่งตามตารางนี้เป็น "ต้นทุน" ยังไม่รวม Factor F/กำไร/VAT
      </p>
    </div>
  );
}
