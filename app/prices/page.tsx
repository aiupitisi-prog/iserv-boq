import { tpsoMaster, tpsoPrices } from "@/lib/tpso";
import {
  readMasterSnapshot,
  readSnapshot,
  snapshotAgeHours,
} from "@/lib/snapshot";

export const metadata = {
  title: "คลังราคา — อ้างอิงราคาวัสดุก่อสร้าง สนค. (TPSO) | ระบบ BOQ งานก่อสร้าง",
};

// snapshot-first → first load เร็วแม้แคชเย็น; maxDuration กัน TPSO ตอบช้า
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

function thDate(iso: string): string {
  return new Date(iso).toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  let priceFetchedAt: string | null = null;
  let masterFetchedAt: string | null = null;
  let usedPriceSnapshot = false;
  let masterError: string | null = null;
  let priceError: string | null = null;

  // ---------- master (จังหวัด/หมวด): snapshot-g่อน → สดถ้ายังไม่มี ----------
  try {
    const masterSnap = readMasterSnapshot();
    if (masterSnap) {
      provinces = masterSnap.provinces;
      heads = masterSnap.heads;
      masterFetchedAt = masterSnap.fetchedAt;
    } else {
      const m = await tpsoMaster();
      provinces = m.provinces;
      heads = m.heads;
    }
  } catch (e) {
    masterError = e instanceof Error ? e.message : "โหลดรายชื่อจังหวัด/หมวดไม่สำเร็จ";
  }

  // ---------- ราคา: snapshot-g่อน → สดถ้ายังไม่มี ----------
  try {
    const snap = readSnapshot(prov, year);
    if (snap && snap.rows.length > 0) {
      rows = snap.rows;
      priceFetchedAt = snap.fetchedAt;
      usedPriceSnapshot = true;
    } else {
      rows = await tpsoPrices(prov, year);
    }
  } catch (e) {
    priceError = e instanceof Error ? e.message : "ดึงข้อมูลราคาจาก สนค. ไม่สำเร็จ";
    // fallback: ถ้ายังมี snapshot เก่า ใช้ได้แม้จะดึงสดไม่สำเร็จ
    const snap = readSnapshot(prov, year);
    if (snap && snap.rows.length > 0) {
      rows = snap.rows;
      priceFetchedAt = snap.fetchedAt;
      usedPriceSnapshot = true;
      priceError = null;
    }
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

  const snapshotAge = priceFetchedAt ? snapshotAgeHours(prov, year) : null;
  const isStale = snapshotAge !== null && snapshotAge > 24;

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
        <a href="/my-prices" className="no-print rounded-full border border-teal-300 bg-teal-50 px-3 py-1 text-xs text-teal-800 hover:underline">
          คลังราคาของฉัน (ค่าแรง/ราคาส่วนตัว) →
        </a>
      </div>
      <p className="mb-6 text-sm text-slate-600">
        ราคาวัสดุก่อสร้างรายจังหวัดที่เผยแพร่โดยสำนักงานนโยบายและแผนการขนส่ง (สนค.) —
        ระบบดึงราคาล่าสุดของปีที่เลือกแต่ละรายการ ใช้ประกอบการตั้งราคาต่อหน่วยใน BOQ
      </p>

      {/* แจ้งเตือนเมื่อใช้สแนปชอต (ข้อมูลสำรอง) — F4.2 */}
      {usedPriceSnapshot && priceFetchedAt && (
        <div
          className={`rounded-xl border p-4 text-sm ${
            isStale
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-blue-300 bg-blue-50 text-blue-900"
          }`}
        >
          📸 ใช้ข้อมูลสแนปชอตที่บันทึกเมื่อ {thDate(priceFetchedAt)}
          {snapshotAge !== null && (
            <span> (ประมาณ {Math.round(snapshotAge)} ชั่วโมงที่แล้ว)</span>
          )}
          {isStale ? (
            <> — ข้อมูลอายุเกิน 24 ชั่วโมง ควรอัปเดตสแนปชอตก่อนใช้ราคาอ้างอิงจริง</>
          ) : (
            <> — ระบบใช้ข้อมูลสำรอง (ข้อมูลอาจไม่ใช่ล่าสุดจาก สนค.)</>
          )}
        </div>
      )}

      {masterError && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
          โหลดรายชื่อจังหวัด/หมวดไม่สำเร็จ ({masterError}) — อาจใช้ข้อมูลค่าเริ่มต้นหรือลองใหม่อีกครั้ง
        </div>
      )}

      {!usedPriceSnapshot && priceError && !masterError && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
          ดึงข้อมูลจาก สนค. ไม่สำเร็จ ({priceError}) —
          หรือตรวจข้อมูลที่{" "}
          <a className="underline" href="https://index.tpso.go.th/construction-material-prices" target="_blank" rel="noopener noreferrer">
            index.tpso.go.th ↗
          </a>
        </div>
      )}

      {(!usedPriceSnapshot || !priceError) && (
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
        </>
      )}

      {/* Disclaimer ถาวร — แสดงเสมอ (กัน pattern เฟส 1 ที่เคย FAIL) */}
      <p className="mt-6 text-xs leading-relaxed text-slate-500">
        ข้อมูลราคาทั้งหมดเผยแพร่โดยสำนักงานนโยบายและแผนการขนส่ง (สนค.) กระทรวงคมนาคม
        ผ่านระบบดัชนีเศรษฐกิจการค้า index.tpso.go.th — ผู้ใช้ราคาควรติดตามประกาศต่อเนื่อง
        เนื่องจาก สนค. อาจแก้ไข/ยกเลิกราคาที่เผยแพร่แล้ว ระบบนี้เป็นเพียงเครื่องมืออ้างอิง
        ไม่ใช่ราคามาตรฐานของกรมบัญชีกลางหรือหน่วยงานใด
      </p>
    </div>
  );
}
