import { NextResponse } from "next/server";
import { tpsoMaster } from "@/lib/tpso";

// รายชื่อจังหวัด/เขต และหมวดวัสดุ (จาก สนค. — เรียกฝั่งเซิร์ฟเวอร์เท่านั้นเพราะ TPSO ไม่ส่ง CORS)
export const maxDuration = 30;

export async function GET() {
  try {
    const master = await tpsoMaster();
    return NextResponse.json(master);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "เชื่อมต่อ สนค. ไม่สำเร็จ" },
      { status: 502 }
    );
  }
}
