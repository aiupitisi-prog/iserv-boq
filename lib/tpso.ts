// ดึงข้อมูลราคาวัสดุก่อสร้างจากสำนักงานนโยบายและแผนการขนส่ง (สนค./TPSO)
// แหล่งที่มา: https://index.tpso.go.th/construction-material-prices
// เชื่อมต่อฝั่งเซิร์ฟเวอร์เท่านั้น (TPSO ไม่ส่ง CORS header — ห้ามเรียกจากเบราว์เซอร์)
const BASE = "https://index.tpso.go.th";

export type TpsoProvince = { type: string; name: string };
export type TpsoHead = { code: string; name: string };

export type TpsoItem = {
  code: string; // รหัสสินค้าของ สนค.
  name: string; // ชื่อรายการ
  unit: string; // หน่วย
  headCategory: string; // รหัสหมวด (01–21)
  headCategoryName: string; // ชื่อหมวด
  price: number | null; // ราคาล่าสุด (ปีที่เลือก) ไม่รวม VAT
  priceVAT: number | null; // ราคารวม VAT
  month: number | null; // เดือนที่ราคาอ้างอิง (1–12)
  year: number; // ปี พ.ศ. ของราคา
};

type RawMonth = {
  priceCur: number | null;
  priceVAT: number | null;
  month: number;
  type: string;
  typeName: string;
};

type Raw = {
  unitName: string;
  headCategory: string;
  headCategoryName: string;
  commodityCode: string;
  commodityNameTH: string;
  years: { year: number; months: RawMonth[] }[];
  children?: Raw[];
};

let masterCache: {
  at: number;
  provinces: TpsoProvince[];
  heads: TpsoHead[];
} | null = null;

export async function tpsoMaster(): Promise<{
  provinces: TpsoProvince[];
  heads: TpsoHead[];
}> {
  if (masterCache && Date.now() - masterCache.at < 3600_000) {
    return { provinces: masterCache.provinces, heads: masterCache.heads };
  }
  const res = await fetch(BASE + "/api/cmip/master", {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error("TPSO master ตอบสถานะ " + res.status);
  const data: {
    types?: { type: string; typeName: string }[];
    headCategories?: { code: string; name: string }[];
  } = await res.json();
  const provinces: TpsoProvince[] = (data.types ?? []).map((t) => ({
    type: String(t.type),
    name: String(t.typeName),
  }));
  const heads: TpsoHead[] = (data.headCategories ?? []).map((h) => ({
    code: String(h.code),
    name: String(h.name),
  }));
  masterCache = { at: Date.now(), provinces, heads };
  return { provinces, heads };
}

const priceCache = new Map<string, { at: number; rows: TpsoItem[] }>();
const PRICE_TTL = 3600_000; // 1 ชั่วโมง

export async function tpsoPrices(type: string, year: number): Promise<TpsoItem[]> {
  const key = type + ":" + year;
  const hit = priceCache.get(key);
  if (hit && Date.now() - hit.at < PRICE_TTL) return hit.rows;

  const res = await fetch(BASE + "/api/cmip/filter", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      YearBase: 2558,
      Categories: [],
      Search: "",
      Types: [type],
      HeadCategories: [],
      TimeOption: true,
      Period: {
        StartYear: String(year),
        StartMonth: "1",
        EndYear: String(year),
        EndMonth: "12",
      },
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("TPSO filter ตอบสถานะ " + res.status);
  const raw: Raw[] = await res.json();

  const rows: TpsoItem[] = [];
  const walk = (items: Raw[]) => {
    for (const it of items) {
      const months = (it.years ?? []).flatMap((y) => y.months ?? []);
      const withPrice = months.filter(
        (m) => typeof m.priceCur === "number" && isFinite(m.priceCur as number)
      );
      if (withPrice.length) {
        const latest = withPrice.reduce((a, b) => (b.month > a.month ? b : a));
        rows.push({
          code: it.commodityCode,
          name: (it.commodityNameTH ?? "").trim(),
          unit: it.unitName ?? "",
          headCategory: it.headCategory,
          headCategoryName: it.headCategoryName,
          price: latest.priceCur,
          priceVAT: latest.priceVAT ?? null,
          month: latest.month,
          year: it.years?.[0]?.year ?? year,
        });
      }
      if (it.children?.length) walk(it.children);
    }
  };
  walk(raw);

  priceCache.set(key, { at: Date.now(), rows });
  return rows;
}
