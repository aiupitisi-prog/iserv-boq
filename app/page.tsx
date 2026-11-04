import Link from "next/link";

type Tile = {
  href: string;
  label: string;
  desc: string;
  circle: string; // สีของวงกลมไอคอน
  icon: React.ReactNode;
};

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const tiles: Tile[] = [
  {
    href: "/projects",
    label: "จัดทำราคากลาง",
    desc: "สร้าง BOQ คำนวณราคาอัตโนมัติ",
    circle: "bg-amber-500",
    icon: (
      <svg viewBox="0 0 24 24" className="h-9 w-9 text-white" {...stroke}>
        <path d="M3 8h18v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" />
        <path d="M3 8V6a2 2 0 0 1 2-2h11" />
        <circle cx="16.5" cy="13.5" r="1.5" />
      </svg>
    ),
  },
  {
    href: "/commercial",
    label: "BOQ เอกชน",
    desc: "คุมต้นทุน ใบเสนอราคา วางบิล",
    circle: "bg-teal-500",
    icon: (
      <svg viewBox="0 0 24 24" className="h-9 w-9 text-white" {...stroke}>
        <path d="M4 20V10" />
        <path d="M10 20V4" />
        <path d="M16 20v-7" />
        <path d="M2 20h20" />
        <path d="M14 7l4-4m0 0h-3m3 0v3" />
      </svg>
    ),
  },
  {
    href: "/prices",
    label: "คลังราคา",
    desc: "ราคาวัสดุ ค่าแรง อุปกรณ์",
    circle: "bg-orange-500",
    icon: (
      <svg viewBox="0 0 24 24" className="h-9 w-9 text-white" {...stroke}>
        <path d="M3 4h18v10H3z" />
        <path d="M7 8h.01M11 8h6" />
        <path d="M12 14v3m-4 4 4-4 4 4" />
      </svg>
    ),
  },
  {
    href: "/cm",
    label: "บริหารงานก่อสร้าง",
    desc: "แผนงาน หลักฐานหน้างาน",
    circle: "bg-purple-500",
    icon: (
      <svg viewBox="0 0 24 24" className="h-9 w-9 text-white" {...stroke}>
        <path d="M8 7V5m8 2V5" />
        <rect x="4" y="5" width="16" height="16" rx="2" />
        <path d="M4 10h16" />
      </svg>
    ),
  },
  {
    href: "/guide",
    label: "คำแนะนำการใช้งาน",
    desc: "เริ่มต้นใช้งานทีละขั้นตอน",
    circle: "bg-emerald-500",
    icon: (
      <svg viewBox="0 0 24 24" className="h-9 w-9 text-white" {...stroke}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5" />
        <path d="M12 8h.01" />
      </svg>
    ),
  },
  {
    href: "/terms",
    label: "ข้อกำหนด & ความเป็นส่วนตัว",
    desc: "เงื่อนไขการใช้งานและข้อมูล",
    circle: "bg-rose-500",
    icon: (
      <svg viewBox="0 0 24 24" className="h-9 w-9 text-white" {...stroke}>
        <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
];

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-slate-950 via-purple-950/60 to-slate-950 px-4 py-16 text-white">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-3 inline-block rounded-full border border-white/15 bg-white/5 px-4 py-1 text-sm text-slate-300">
            เครื่องมือสำหรับหน่วยงานและผู้รับเหมา · ฟรี · เก็บข้อมูลในเครื่องคุณ
          </p>
          <h1 className="text-3xl font-bold leading-snug md:text-4xl">
            ระบบจัดทำ{" "}
            <span className="bg-gradient-to-r from-amber-300 to-yellow-500 bg-clip-text italic text-transparent">
              ราคากลาง
            </span>{" "}
            งานก่อสร้าง
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-slate-300">
            จัดทำ BOQ ตรวจสอบราคาอ้างอิง และบริหารงานก่อสร้าง — คำนวณให้ทันที
            ข้อมูลอยู่บนอุปกรณ์ของคุณเป็นค่าเริ่มต้น
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/projects"
              className="rounded-lg bg-amber-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-amber-400"
            >
              เริ่มจัดทำ BOQ
            </Link>
            <Link
              href="/prices"
              className="rounded-lg border border-white/25 px-6 py-3 font-semibold text-white transition hover:bg-white/10"
            >
              เปิดคลังราคา
            </Link>
          </div>
        </div>
      </section>

      {/* Icon tiles — สไตล์กริดไอคอน */}
      <section className="mx-auto mt-12 max-w-5xl px-4">
        <h2 className="mb-6 text-center text-xl font-semibold text-slate-200">
          เลือกพื้นที่ทำงานที่ต้องการ
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {tiles.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="group flex flex-col items-center gap-3 rounded-3xl border border-slate-800 bg-slate-900 p-5 text-center transition hover:-translate-y-0.5 hover:border-slate-600 hover:shadow-lg hover:shadow-black/40"
            >
              <span
                className={`grid h-20 w-20 place-items-center rounded-full ${t.circle} shadow-inner transition group-hover:scale-105`}
              >
                {t.icon}
              </span>
              <span>
                <span className="block text-sm font-medium text-slate-200">{t.label}</span>
                <span className="mt-1 block text-xs text-slate-500">{t.desc}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ข้อจำกัด */}
      <section className="mx-auto mb-16 mt-12 max-w-5xl px-4">
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6">
          <h2 className="mb-2 font-semibold text-amber-900">ข้อกำหนดที่ควรอ่านให้ชัดเจน</h2>
          <p className="text-sm text-amber-900">
            ระบบนี้เป็นต้นแบบ (prototype) เพื่อทดลองการทำงานและพัฒนาต่อ ตัวเลขราคาอ้างอิงเป็นตัวอย่างสมมุติ
            ไม่ใช่ราคาของกรมบัญชีกลางหรือหน่วยงานใด โปรดตรวจทานเอกสารก่อนใช้ประกอบการจัดซื้อจัดจ้างจริง
          </p>
        </div>
      </section>
    </div>
  );
}
