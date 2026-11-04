import Link from "next/link";

const workspaces = [
  {
    href: "/projects",
    title: "จัดทำราคากลาง",
    desc: "สร้าง เปิด นำเข้า และส่งออกโครงการ BOQ งานก่อสร้างอาคาร พร้อมตารางคำนวณราคาโดยอัตโนมัติ",
  },
  {
    href: "/commercial",
    title: "BOQ เอกชน",
    desc: "คุมต้นทุน ออกใบเสนอราคา วางบิล และรับชำระ เวอร์ชันต้นแบรเฉพาะพื้นที่เก็บข้อมูลในเครื่อง",
  },
  {
    href: "/prices",
    title: "คลังราคา",
    desc: "ตรวจสอบราคาวัสดุ ค่าแรง และข้อมูลอ้างอิงสำหรับการตั้งราคาต่อหน่วย",
  },
  {
    href: "/cm",
    title: "บริหารงานก่อสร้าง",
    desc: "ติดตามแผนงาน บันทึกงานประจำวัน และหลักฐานหน้างาน (โครงสร้างพร้อมพัฒนาต่อ)",
  },
];

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 px-4 py-16 text-white">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-3 rounded-full bg-white/10 px-4 py-1 text-sm">
            เครื่องมือสำหรับหวี่งงานและผู้รับเหมา · ฟรี โดยเก็บข้อมูลในเครื่องคุณ
          </p>
          <h1 className="text-3xl font-bold leading-snug md:text-4xl">
            ระบบจัดทำราคากลางงานก่อสร้าง
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-slate-300">
            ช่วยให้การจัดทำ BOQ เข้าถึงได้ และตรวจสอบได้ สำหรับข้าราชการ หน่วยงานรัฐ เอกชน และผู้รับเหมา — ต้นแบบนี้คำนวณราคาให้ทันทีและเก็บข้อมูลบนอุปกรณ์เป็นค่าเริ่มต้น
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/projects" className="rounded-lg bg-green-500 px-6 py-3 font-semibold text-white transition hover:bg-green-600">
              เข้าโปรแกรมจัดทำราคากลาง
            </Link>
            <Link href="/prices" className="rounded-lg border border-white/30 px-6 py-3 font-semibold text-white transition hover:bg-white/10">
              เปิดคลังราคา
            </Link>
          </div>
        </div>
      </section>

      {/* Workspaces */}
      <section className="mx-auto mt-12 max-w-6xl px-4">
        <h2 className="mb-6 text-2xl font-bold text-blue-950">เลือกพื้นที่ทำงานที่ต้องการ</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {workspaces.map((w) => (
            <Link key={w.href} href={w.href} className="block rounded-xl border border-slate-200 bg-white p-6 transition hover:border-blue-300 hover:shadow-md">
              <h3 className="mb-2 font-semibold text-blue-950">{w.title}</h3>
              <p className="text-sm text-slate-600">{w.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ข้อจำเป็น / ข้อจำกัด */}
      <section className="mx-auto mb-16 mt-12 max-w-6xl px-4">
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-6">
          <h2 className="mb-2 font-semibold text-amber-900">ข้อกำหนดที่ควรอ่านให้ชัดเจน</h2>
          <p className="text-sm text-amber-900">
            ระบบนี้เป็นต้นแบบ (prototype) เพื่อทดลองการทำงานและพัฒนาต่อ ตัวเลขราคาอ้างอิงเป็นตัวอย่างสมมุติ
            ไม่ใช่ราคาของกรมบัญชีกลางหรือหน่วยงานใด โปรดตรวจทานเอกสารก่อนใช้ประกอบการจัดซื้อจัดจ้างจริง
          </p>
          <div className="mt-4 flex gap-4 text-sm font-medium">
            <Link href="/terms" className="text-blue-700 hover:underline">ข้อกำหนดการใช้งาน</Link>
            <Link href="/privacy" className="text-blue-700 hover:underline">ประกาศความเป็นส่วนตัว</Link>
            <Link href="/guide" className="text-blue-700 hover:underline">คำแนะนำการใช้งาน</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
