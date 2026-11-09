import { NextResponse } from "next/server";
import { readSnapshot, fetchAndSaveSnapshot } from "@/lib/snapshot";

// ดึง snapshot (จังหวัด, ปี) — snapshot-first: คืนไฟล์ที่ commit ไว้ก่อน (เร็ว < 2 วิ)
// ถ้ายังไม่มี snapshot ให้ดึงสดจาก TPSO แล้วบันทึก (เฉพาะสภาพแวดล้อมที่เขียนไฟล์ได้)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ prov: string; year: string }> },
) {
  const { prov, year: yearStr } = await params;
  const year = parseInt(yearStr, 10) || 2569;

  const snap = readSnapshot(prov, year);
  if (snap && snap.rows.length > 0) {
    return NextResponse.json({
      ...snap,
      fromSnapshot: true,
    });
  }

  try {
    const meta = await fetchAndSaveSnapshot(prov, year);
    return NextResponse.json({ ...meta, fromSnapshot: false });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "ดึงราคาจาก สนค. ไม่สำเร็จ",
        fromSnapshot: false,
      },
      { status: 502 },
    );
  }
}
