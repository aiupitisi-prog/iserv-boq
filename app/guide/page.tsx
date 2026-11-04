export const metadata = { title: "คำแนะนำการใช้งาน | ระบบ BOQ งานก่อสร้าง" };

const steps = [
  {
    title: "เริ่มจากหน้า จัดทำราคากลาง",
    body: "ไปที่ /projects กด สร้างโปรเจกต์ ตั้งชื่อและที่ตั้งงาน หรือกด โหลด BOQ ตัวอย่าง เพื่อดูรูปแบบข้อมูลก่อน",
  },
  {
    title: "กรอกรายการ BOQ",
    body: "ในหน้าโปรเจกต์ กด เพิ่มรายการ ใส่หมวดงาน ชื่อรายการ หน่วย ปริมาณ และราคาต่อหน่วย ระบบคำนวณช่องรวมเงินให้ทันที แก้ไขได้ตรงตาราง และบันทึกอัตโนมัติ",
  },
  {
    title: "ตรวจสอบราคาจากคลังราคา",
    body: "หน้า /prices ดึงราคาวัสดุก่อสร้างจริงจากสำนักงานนโยบายและแผนการขนส่ง (สนค. — TPSO) เลือกจังหวัด ปี หมวดวัสดุ หรือค้นหารายการ เพื่อใช้อ้างอิงตั้งราคาต่อหน่วยใน BOQ",
  },
  {
    title: "ส่งออกเอกสาร",
    body: "กด พิมพ์เอกสาร ในหน้าโปรเจกต์เพื่อทำเอกสารให้ประเมิน (รองรับ A4) หรือกด ส่งออก JSON เพื่อบันทึกข้อมูล/สลับเครื่อง",
  },
  {
    title: "สำรองข้อมูลของคุณ",
    body: "ข้อมูลอยู่บนเครื่องของคุณ ไม่มีเซิร์ฟเวอร์เก็บให้ ควรส่งออก JSON เก็บไว้เป็นระยะ โดยเฉพาะก่อนล้างเบราว์เซอร์",
  },
];

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold text-blue-950">คำแนะนำการใช้งาน</h1>
      <ol className="space-y-4">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-4 rounded-xl border border-slate-200 bg-white p-5">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-100 text-sm font-bold text-blue-800">{i + 1}</div>
            <div>
              <h2 className="mb-1 font-semibold text-blue-950">{s.title}</h2>
              <p className="text-sm text-slate-600">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
        ย้ำ: คลังราคาอ้างอิงราคาที่ สนค. (TPSO) เผยแพร่ ซึ่งอาจมีการแก้ไข/ยกเลิกได้ — ตัวเลขใน BOQ
        และตัวอย่างราคา ค่าแรง อุปกรณ์ภายในเครื่องเป็นตัวอย่าง ควรตรวจสอบกับราคาจริงของพื้นที่และปีงบประมาณของคุณก่อนใช้กับงานราชการ
      </div>
    </div>
  );
}
