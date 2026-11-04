export const metadata = { title: "บริหารงานก่อสร้าง | ระบบ BOQ งานก่อสร้าง" };

const modules = [
  { icon: "📋", title: "แผนงานและตารางเวลา", desc: "จัดรอบการทำงาน ทำตารางการเดินหน้างานรายสัปดาห์" },
  { icon: "📸", title: "หลักฐานหน้างาน", desc: "เก็บภาพถ่ายความคืบหน้า เช็กลิสต์ตรวจงาน และหลักฐานประกอบการเบิกจ่าย" },
  { icon: "👷", title: "งานประจำวัน", desc: "บันทึกงานวันนี้ เหตุการณ์เช่นฝนตก งานที่ยังไม่เสร็จ และปัญหาหน้างาน" },
  { icon: "📊", title: "รายงานผู้บริหาร", desc: "สรุปงบประมาณและความคืบหน้า เทียบแผนกับของจริง" },
];

export default function CmPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-bold text-blue-950">บริหารงานก่อสร้าง</h1>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
          เวอร์ชันต้นแบบ — พัฒนาต่อไปได้ทันที
        </span>
      </div>
      <p className="mb-6 max-w-2xl text-sm text-slate-600">
        พื้นที่สำหรับบริหารงานหลังการออกแบบก่อสร้าง ประกอบด้วยแผนงาน หลักฐานหน้างาน และงานประจำวัน (โครงสร้างพร้อมพัฒนาต่อ)
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {modules.map((m) => (
          <div key={m.icon} className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="mb-3 text-2xl">{m.icon}</div>
            <h2 className="mb-1 font-semibold text-blue-950">{m.title}</h2>
            <p className="text-sm text-slate-600">{m.desc}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 rounded-xl border border-blue-200 bg-blue-50 p-6 text-sm text-blue-900">
        แผนพัฒนาต่อ: นำแผนงานใน BOQ มาเชื่อมกับปริมาณงานและต้นทุนจริงของงานประจำวัน พร้อมเอกสารเบิกจ่ายเบื้องต้น
      </div>
    </div>
  );
}
