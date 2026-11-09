const BASE = "https://index.tpso.go.th";
const fs = await import("node:fs");
const path = await import("node:path");

const SNAPSHOT_DIR = path.join(process.cwd(), "data", "snapshots");
fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, { headers: { Accept: "application/json", ...opts.headers }, ...opts });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

// Master snapshot (จังหวัด + หมวด)
async function saveMaster() {
  const data = await fetchJSON(`${BASE}/api/cmip/master`);
  const meta = {
    provinces: (data.types ?? []).map(t => ({ type: String(t.type), name: String(t.typeName) })),
    heads: (data.headCategories ?? []).map(h => ({ code: String(h.code), name: String(h.name) })),
    fetchedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(SNAPSHOT_DIR, "master.json"), JSON.stringify(meta, null, 2), "utf8");
  console.log("master:", meta.provinces.length, "จังหวัด", meta.heads.length, "หมวด");
}

// ราคาต่อ (จังหวัด, ปี) — ดึงล่าสุดของปีนั้น
async function savePrices(prov, year) {
  const body = {
    YearBase: 2558,
    Categories: [],
    Search: "",
    Types: [prov],
    HeadCategories: [],
    TimeOption: true,
    Period: { StartYear: String(year), StartMonth: "1", EndYear: String(year), EndMonth: "12" },
  };
  const res = await fetch(`${BASE}/api/cmip/filter`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`filter ${prov}/${year} → ${res.status}`);
  const raw = await res.json();

  const rows = [];
  const walk = (items) => {
    for (const it of items) {
      const months = (it.years ?? []).flatMap(y => y.months ?? []);
      const withPrice = months.filter(m => typeof m.priceCur === "number" && isFinite(m.priceCur));
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

  const meta = { prov, year, fetchedAt: new Date().toISOString(), rows, source: "tpsolive" };
  fs.writeFileSync(path.join(SNAPSHOT_DIR, `prov_${prov}_year_${year}.json`), JSON.stringify(meta, null, 2), "utf8");
  console.log(`prov=${prov} year=${year}: ${rows.length} รายการ`);
}

(async () => {
  try {
    await saveMaster();
    await sleep(1000);
    for (const prov of ["10", "40"]) { // 10=ส่วนกลาง, 40=ขอนแก่น (ทดสอบเฟส 2)
      for (const year of [2569, 2568]) {
        await savePrices(prov, year);
        await sleep(1500);
      }
    }
    console.log("DONE — snapshot files created in data/snapshots/");
  } catch (e) {
    console.error("FAILED:", e.message);
    process.exit(1);
  }
})();
