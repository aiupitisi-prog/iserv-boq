// ตรวจ "เดือนที่ สนค. ไม่มีราคาส่วนกลาง (type 10)" — เรียก API ของ สนค. จริง (index.tpso.go.th)
// วัตถุประสงค์: ยืนยันข้อมูล TPSO_CENTRAL_CANCELLED ใน lib/report2569.ts ด้วยข้อมูลจากระบบ สนค. โดยตรง
// เดือนใดที่นับรายการราคาได้ 0 = ไม่มีการเผยแพร่ราคาส่วนกลางเดือนนั้นในระบบ สนค. ณ วันตรวจ
// ใช้: node scripts/tpso-central-months-check.mjs [ปี พ.ศ. เริ่ม] [ปี พ.ศ. สิ้นสุด]
// ⚠ ห้ามเรียกจากเบราว์เซอร์ (สนค. ไม่ส่ง CORS header) — script นี้รันฝั่งเซิร์ฟเวอร์เท่านั้น
const BASE = "https://index.tpso.go.th";
const TYPE = "10"; // เขต "ส่วนกลาง"

const nowBe = new Date().getFullYear() + 543;
const y1 = Number(process.argv[2] ?? nowBe - 3);
const y2 = Number(process.argv[3] ?? nowBe);
const years = [];
for (let y = y1; y <= y2; y++) years.push(y);

const payload = (year) =>
  JSON.stringify({
    YearBase: 2558,
    Categories: [],
    Search: "",
    Types: [TYPE],
    HeadCategories: [],
    TimeOption: true,
    Period: { StartYear: String(year), StartMonth: "1", EndYear: String(year), EndMonth: "12" },
  });

for (const year of years) {
  const res = await fetch(BASE + "/api/cmip/filter", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: payload(year),
    cache: "no-store",
  });
  if (!res.ok) {
    console.log(`${year}: HTTP ${res.status} — ตรวจไม่ได้`);
    continue;
  }
  const raw = await res.json();
  const counts = new Array(13).fill(0); // counts[m] = จำนวนรายการที่มีราคาเดือน m
  const walk = (arr) => {
    for (const it of arr ?? []) {
      walk(it.children);
      for (const y of it.years ?? []) {
        if (String(y.year) !== String(year)) continue;
        for (const m of y.months ?? []) {
          if (typeof m.priceCur === "number" && isFinite(m.priceCur) && m.month >= 1 && m.month <= 12)
            counts[m.month]++;
        }
      }
    }
  };
  walk(raw);
  const zeros = counts.slice(1).map((c, i) => (c === 0 ? i + 1 : null)).filter(Boolean);
  const summary = counts
    .slice(1)
    .map((c, i) => `${i + 1}:${c}`)
    .join(" ");
  console.log(`${year} (สนค. ส่วนกลาง type 10) — รายการต่อเดือนที่มีราคา: ${summary}`);
  console.log(`  → เดือนที่ไม่มีราคาเลย (0): ${zeros.length ? zeros.join(", ") : "ไม่มี"}`);
}
