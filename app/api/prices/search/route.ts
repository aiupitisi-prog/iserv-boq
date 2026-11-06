import { NextRequest, NextResponse } from "next/server";
import { tpsoSearch } from "@/lib/tpso";

// ค้นหาราคาจากชุดข้อมูลที่แคชฝั่งเซิร์ฟเวอร์ — ส่งเฉพาะผลลัพธ์เล็ก ๆ กันยกชุดใหญ่ไป client
// TPSO ไม่ส่ง CORS header → client ต้องเรียกผ่าน route นี้เท่านั้น
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const prov = sp.get("prov") || "10";
  const year = parseInt(sp.get("y") || "2569", 10) || 2569;
  const cat = sp.get("cat") || "";
  const q = sp.get("q") || "";
  const limit = parseInt(sp.get("limit") || "50", 10) || 50;
  const offset = parseInt(sp.get("offset") || "0", 10) || 0;

  try {
    const result = await tpsoSearch(prov, year, { cat, q, limit, offset });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "เชื่อมต่อ สนค. ไม่สำเร็จ" },
      { status: 502 }
    );
  }
}
