import { tpsoMaster, tpsoPrices } from "@/lib/tpso";

export const metadata = {
  title: "คลังราคา — อ้างอิงราคาวัสดุก่อสร้าง สนค. (TPSO) | ระบบ BOQ งานก่อสร้าง",
};

export const maxDuration = 30;

const THAI_MONTHS = [
  "", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

const YEARS = [2569, 2568, 2567, 2566, 2565, 2564, 2563, 2562, 2560, 2559];
const PER_PAGE = 200;

function fmt(n: number | null | undefined): string {
  if (typeof n !== "number" || !isFinite(n)) return "—";
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildQuery(base: Record<string, string>, patch: Record<string, string>): string {
  const merged = { ...base, ...patch };
  const parts = Object.entries(merged)
    .filter(([, v]) => v !== "" && v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return parts.length ? "?" + parts.join("&") : "";
}

export default async function PricesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const prov = get("prov") || "10";
  const year = parseInt(get("y") || "2569", 10) || 2569;
  const cat = get("cat");
  const q = get("q").trim();
  const page = Math.max(1, parseInt(get("page") || "1", 10) || 1);

  let provinces: { type: string; name: string }[] = [];
  let heads: { code: string; name: string }[] = [];
  let rows: Awaited<ReturnType<typeof tpsoPrices>> = [];
  let error: string | null = null;

  try {
    const master = await tpsoMaster();
    provinces = master.provinces;
    heads = master.heads;
    rows = await tpsoPrices(prov, year);
  } catch (e) {
    error = e instanceof Error ? e.message : "เชื่อมต่อ สนค. ไม่สำเร็จ";
  }

  const filtered = rows.filter((r) => {
    if (cat && r.headCategory !== cat) return false;
    if (q && !(r.name.includes(q) || r.code.includes(q))) return false;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);
  const baseQ = { prov, y: String(year), cat, q };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold text-blue-950">คลังราคาวัสดุก่อสร้าง</h1>
        <a
          href="https://index.tpso.go.th/construction-material-prices"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-blue-200 bg-blue-100 px-3 py-1 text-xs text-blue-800 hover:underline"
        >
          แหล่งข้อมูล: สนค. (TPSO) · index.tpso.go.th ↗
        </a>
      </div>
      <p className="mb-6 text-sm text-slate-600">
        ราคาวัสดุก่อสร้างรายจังหวัดที่เผยแพร่โดยสำนักงานนโยบายและแผนการขนส่ง (สนค.) —
        ระบบดึงราคาล่าสุดของปีที่เลือกแต่ละรายการ ใช้ประกอบการตั้งราคาต่อหน่วยใน BOQ
      </p>

      {/* ตัวกรอง */}
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="block text-xs text-slate-500">
          <span className="mb-1 block">จังหวัด / เขต</span>
          <select name="prov" defaultValue={prov}
            className="w-48 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
            {provinces.map((p) => (
              <option key={p.type} value={p.type}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-slate-500">
          <span className="mb-1 block">ปี (พ.ศ.)</span>
          <select name="y" defaultValue={String(year)}
            className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
            {YEARS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-slate-500">
          <span className="mb-1 block">หมวดวัสดุ</span>
          <select name="cat" defaultValue={cat}
            className="w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
            <option value="">ทุกหมวด</option>
            {heads.map((h) => (
              <option key={h.code} value={h.code}>{h.code} {h.name}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-slate-500">
          <span className="mb-1 block">ค้นหารายการ</span>
          <input name="q" defaultValue={q} placeholder="เช่น คอนกรีต, อิฐ, เหล็ก"
            className="w-56 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800" />
        </label>
        <button type="submit"
          className="rounded-lg bg-blue-700 px-5 py-2 text-sm font-medium text-white hover:bg-blue-800">
          ปรับตัวกรอง
        </button>
      </form>

      {error ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
          ดึงข้อมูลจาก สนค. ไม่สำเร็จ ({error}) — กรุณาลองใหม่อีกครั้ง
          หรือตรวจข้อมูลที่ <a className="underline" href="https://index.tpso.go.th/construction-material-prices" target="_blank" rel="noopener noreferrer">index.tpso.go.th ↗</a>
        </div>
      ) : (
        <>
          {prov === "10" && (
            <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              หมายเหตุ: สนค. มีประกาศยกเลิกการเผยแพร่ราคาส่วนกลางหลายช่วงเดือน
              โปรดตรวจสอบประกาศล่าสุดบนเว็บไซต์ สนค. ก่อนใช้ราคาอ้างอิงจริง
            </div>
          )}

          <p className="mb-3 text-sm text-slate-500">
            พบ {filtered.length.toLocaleString("th-TH")} รายการ · แสดงหน้า {safePage}/{totalPages} ·
            หน้าละ {PER_PAGE} รายการ
          </p>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-3 font-medium">หมวด</th>
                  <th className="px-3 py-3 font-medium">รายการ</th>
                  <th className="px-3 py-3 font-medium">หน่วย</th>
                  <th className="px-3 py-3 text-right font-medium">ราคา (บาท/หน่วย)</th>
                  <th className="px-3 py-3 text-right font-medium">รวม VAT</th>
                  <th className="px-3 py-3 text-center font-medium">อ้างอิงเดือน</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((r) => (
                  <tr key={r.code} className="border-t border-slate-100 hover:bg-slate-50" title={r.code}>
                    <td className="px-3 py-2 text-xs text-slate-500">{r.headCategoryName}</td>
                    <td className="px-3 py-2 text-slate-800">{r.name}</td>
                    <td className="px-3 py-2 text-slate-600">{r.unit}</td>
                    <td className="px-3 py-2 text-right font-medium text-green-700">{fmt(r.price)}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{fmt(r.priceVAT)}</td>
                    <td className="px-3 py-2 text-center text-xs text-slate-500">
                      {r.month ? `${THAI_MONTHS[r.month]} ${r.year}` : "—"}
                    </td>
                  </tr>
                ))}
                {paged.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-slate-500">
                      ไม่พบข้อมูลในเงื่อนไขที่เลือก — ลองเปลี่ยนจังหวัด ปี หรือคำค้นหา
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* แบ่งหน้า */}
          <div className="mt-4 flex items-center justify-between text-sm">
            {safePage > 1 ? (
              <a className="rounded-lg border border-slate-300 bg-white px-4 py-2 hover:bg-slate-50"
                href={"/prices" + buildQuery(baseQ, { page: String(safePage - 1) })}>
                ← ก่อนหน้า
              </a>
            ) : <span />}
            {safePage < totalPages ? (
              <a className="rounded-lg border border-slate-300 bg-white px-4 py-2 hover:bg-slate-50"
                href={"/prices" + buildQuery(baseQ, { page: String(safePage + 1) })}>
                ถัดไป →
              </a>
            ) : <span />}
          </div>

          <p className="mt-6 text-xs leading-relaxed text-slate-500">
            ข้อมูลราคาทั้งหมดเผยแพร่โดยสำนักงานนโยบายและแผนการขนส่ง (สนค.) กระทรวงคมนาคม
            ผ่านระบบดัชนีเศรษฐกิจการค้า index.tpso.go.th — ผู้ใช้ราคาควรติดตามประกาศต่อเนื่อง
            เนื่องจาก สนค. อาจแก้ไข/ยกเลิกราคาที่เผยแพร่แล้ว ระบบนี้เป็นเพียงเครื่องมืออ้างอิง
            ไม่ใช่ราคามาตรฐานของกรมบัญชีกลางหรือหน่วยงานใด
          </p>
        </>
      )}
    </div>
  );
}
