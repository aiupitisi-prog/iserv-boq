// สร้างไฟล์ snapshot ราคา สนค. (TPSO) ลง data/snapshots/ (F4.1/F4.3)
// ใช้ตอน dev และตอน GitHub Actions รีเฟรชรายวัน (.github/workflows/snapshot-refresh.yml)
// ตัวแปรแวดล้อม: SNAP_PROVS (เช่น 10,40) · SNAP_YEARS (เช่น 2569,2568)
// ไม่ตั้งค่า → ค่าเริ่มต้น จังหวัดส่วนกลาง(10) + ขอนแก่น(40), ปีงบ 2569/2568
const BASE = "https://index.tpso.go.th";
const fs = await import("node:fs");
const path = await import("node:path");

const SNAPSHOT_DIR = path.join(process.cwd(), "data", "snapshots");
fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

const PROVS = (process.env.SNAP_PROVS ?? "10,40").split(",").map((s) => s.trim()).filter(Boolean);
const YEARS = (process.env.SNAP_YEARS ?? "2569,2568")
  .split(",")
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => Number.isFinite(n) && n > 2500);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, { headers: { Accept: "application/json", ...(opts.headers ?? {}) }, ...opts });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

let okCount = 0;
const failures = [];

// Master snapshot (จังหวัด + หมวด)
async function saveMaster() {
  const data = await fetchJSON(`${BASE}/api/cmip/master`);
  const meta = {
    provinces: (data.types ?? []).map((t) => ({ type: String(t.type), name: String(t.typeName) })),
    heads: (data.headCategories ?? []).map((h) => ({ code: String(h.code), name: String(h.name) })),
    fetchedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(SNAPSHOT_DIR, "master.json"), JSON.stringify(meta, null, 2), "utf8");
  console.log(`master: ${meta.provinces.length} provinces, ${meta.heads.length} categories`);
}

// ราคาต่อ (จังหวัด, ปี) — ดึงเดือนล่าสุดที่มีราคาของปีนั้น
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
  if (!res.ok) throw new Error(`filter ${prov}/${year} -> HTTP ${res.status}`);
  const raw = await res.json();

  const rows = [];
  const walk = (items) => {
    for (const it of items) {
      const months = (it.years ?? []).flatMap((y) => y.months ?? []);
      const withPrice = months.filter((m) => typeof m.priceCur === "number" && isFinite(m.priceCur));
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
  fs.writeFileSync(
    path.join(SNAPSHOT_DIR, `prov_${prov}_year_${year}.json`),
    JSON.stringify(meta, null, 2),
    "utf8",
  );
  console.log(`prov=${prov} year=${year}: ${rows.length} items`);
}

(async () => {
  try {
    await saveMaster();
    okCount++;
  } catch (e) {
    failures.push(`master: ${e.message}`);
  }
  await sleep(1000);
  for (const prov of PROVS) {
    for (const year of YEARS) {
      try {
        await savePrices(prov, year);
        okCount++;
      } catch (e) {
        failures.push(`${prov}/${year}: ${e.message}`);
      }
      await sleep(1500);
    }
  }
  console.log(`SUMMARY ok=${okCount} fail=${failures.length}`);
  if (failures.length) console.log(`FAILED ITEMS:\n${failures.join("\n")}`);
  // ล้มเหลวทั้งหมด = exit 1 (ให้ Actions ทำงาน fail); ทำได้บางรายการ = ถือว่าสำเร็จบางส่วน exit 0
  process.exit(okCount === 0 ? 1 : 0);
})();
