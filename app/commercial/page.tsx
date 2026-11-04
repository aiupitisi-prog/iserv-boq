export const metadata = { title: "BOQ เอกชน | ระบบ BOQ งานก่อสร้าง" };

const steps = [
  {
    n: 1,
    title: "คุมต้นทุนงานเอกชน",
    desc: "บันทึกต้นทุนวัสดุ ค่าแรง และค่ารับเหมาตามรายการ BOQ เก็บข้อมูลไว้ในเครื่องผู้ใช้ก่อนเป็นค่าเริ่มต้น",
  },
  {
    n: 2,
    title: "ออกใบเสนอราคา",
    desc: "นำรายการ BOQ ของงานมาแปลงเป็นใบเสนอราคาสำหรับส่งลูกค้า (อยู่ระหว่างพัฒนา)",
  },
  {
    n: 3,
    title: "วางบิลและรับชำระ",
    desc: "ติดตามสถานะงบประมาณ วางบิลงานที่เสร็จ และบันทึกการรับชำระ (อยู่ระหว่างพัฒนา)",
  },
];

export default function CommercialPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-bold text-blue-950">BOQ เอกชน</h1>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
          เวอร์ชันต้นแบบ — พัฒนาต่อไปได้ทันที
        </span>
      </div>
      <p className="mb-6 max-w-2xl text-sm text-slate-600">
        พื้นที่สำหรับฝั่งเอกชน/ผู้รับเหมา ใช้คุมต้นทุน ออกใบเสนอราคา และวางบิล ขณะนี้เปิดให้ทดลองโครงสร้างการทำงานเริ่มต้นได้
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {steps.map((s) => (
          <div key={s.n} className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="mb-3 grid h-8 w-8 place-items-center rounded-full bg-blue-100 text-sm font-bold text-blue-800">{s.n}</div>
            <h2 className="mb-1 font-semibold text-blue-950">{s.title}</h2>
            <p className="text-sm text-slate-600">{s.desc}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 rounded-xl border border-blue-200 bg-blue-50 p-6 text-sm text-blue-900">
        หากต้องการใช้งานจริงตอนนี้ แนะนำเริ่มจาก{" "}
        <a href="/projects" className="underline">พื้นที่จัดทำราคากลาง / BOQ</a>{" "}
        ก่อน แล้วส่งออกไฟล์ JSON เพื่อแชร์กับทีมหรือนำเข้าเครื่องอื่น
      </div>
    </div>
  );
}
