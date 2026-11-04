"use client";

import { useState } from "react";
import { thb } from "@/lib/boq";

type PriceRow = { name: string; unit: string; price: number; kind: "วัสดุ" | "ค่าแรง" | "อุปกรณ์" };

const PRICE_DATA: PriceRow[] = [
  { name: "เม็ดเหล็กไม้เหลือแบบก่ออิฐ", unit: "แผ่น", price: 350, kind: "วัสดุ" },
  { name: "ทรายล้างหนา 1 นิ้ว", unit: "ลบ.ม.", price: 850, kind: "วัสดุ" },
  { name: "หินเม็ด 20–30 มม.", unit: "ลบ.ม.", price: 900, kind: "วัสดุ" },
  { name: "ปูนซีเมนต์ถุง 50 กก.", unit: "ถุง", price: 165, kind: "วัสดุ" },
  { name: "อิฐมอญ ขนาด 24×11×5.3 ซม.", unit: "พันอิฐ", price: 2050, kind: "วัสดุ" },
  { name: "เหล็กลวดสวย DB6", unit: "เส้น", price: 128, kind: "วัสดุ" },
  { name: "เหล็กข้อต่อเล็ก DB12", unit: "เส้น 9 ม.", price: 218, kind: "วัสดุ" },
  { name: "สายไฟและสวัทาหรด VCT 2×2.5 ระลอก", unit: "ม้วน", price: 820, kind: "วัสดุ" },
  { name: "ท่อ PVC รดน้ำ 4 นิ้ว", unit: "เส้น 6 ม.", price: 640, kind: "วัสดุ" },
  { name: "ปูนดาบระบแกนความรังdat", unit: "15 กก.", price: 195, kind: "วัสดุ" },
  { name: "ค่าแรงช่างก่ออิท", unit: "ลบ.ม.", price: 1250, kind: "ค่าแรง" },
  { name: "ค่าแรงช่างเอางาน", unit: "ลบ.ม.", price: 950, kind: "ค่าแรง" },
  { name: "ค่าแรงช่างฉาบ ผนัง", unit: "ตร.ม.", price: 145, kind: "ค่าแรง" },
  { name: "ค่าแรงช่างเดินสายไฟฟ้า", unit: "จุด", price: 385, kind: "ค่าแรง" },
  { name: "ค่าแรงงานไม่ถนัด เฝ้าหน้างาน", unit: "วัน", price: 500, kind: "ค่าแรง" },
  { name: "ค่าเช่าเครื่องผสมส้ม (มีปั๊ม)", unit: "วัน", price: 3500, kind: "อุปกรณ์" },
  { name: "ค่าเช่าหัวโคร่งเสาเข็มลับหัวด้าน", unit: "วัน", price: 12500, kind: "อุปกรณ์" },
  { name: "ค่าเช่านั่นร้านโลหะพลาสติกหนา 3 ม.", unit: "วัน", price: 240, kind: "อุปกรณ์" },
];

export default function PricesPage() {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "วัสดุ" | "ค่าแรง" | "อุปกรณ์">("all");
  const rows = PRICE_DATA.filter((r) => {
    const okQ = r.name.includes(q.trim());
    const okK = kind === "all" || r.kind === kind;
    return okQ && okK;
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-blue-950">คลังราคา</h1>
      <p className="mb-6 text-sm text-slate-600">ราคาวัสดุ ค่าแรง และอุปกรณ์ภายในเครื่อง ตัวอย่างเพื่อใช้ประกอบการตั้งราคา/หน่วยใน BOQ — ปรับเป็นราคาจริงของพื้นที่คุณก่อนใช้งานจริง</p>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหารายการ เช่น อิฐ, ค่าแรงช่างสลาย"
          className="w-72 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        {(["all", "วัสดุ", "ค่าแรง", "อุปกรณ์"] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)}
            className={`rounded-lg px-4 py-2 text-sm ${kind === k ? "bg-blue-700 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
            {k === "all" ? "ทั้งหมด" : k}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left font-medium">ประเภท</th>
              <th className="px-4 py-3 text-left font-medium">รายการ</th>
              <th className="px-4 py-3 text-left font-medium">หน่วยนับ</th>
              <th className="px-4 py-3 text-right font-medium">ราคาบาท/หน่วย</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2"><span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{r.kind}</span></td>
                <td className="px-4 py-2 text-slate-800">{r.name}</td>
                <td className="px-4 py-2 text-slate-500">{r.unit}</td>
                <td className="px-4 py-2 text-right font-medium text-green-700">{thb(r.price)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500">ไม่พบรายการที่ตรงกัน</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
