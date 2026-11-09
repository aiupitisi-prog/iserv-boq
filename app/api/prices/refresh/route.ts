import { NextResponse } from "next/server";
import { fetchAndSaveSnapshot } from "@/lib/snapshot";

// รีเฟรช snapshot สำหรับ (จังหวัด, ปี) — ใช้โดย Vercel Cron (F4.3)
// POST body: { prov, year }
// บน production serverless การเขียนไฟล์จะถูกบล็อก (read-only) —
// snapshot จริงถูกเติมผ่านสคริปต์ภายนอก (GitHub Actions / Contents API)
export const maxDuration = 30;

export async function POST(req: Request) {
  const url = new URL(req.url);
  const body = (await req.json().catch(() => ({}))) as {
    prov?: string;
    year?: number;
  };
  const prov = body.prov || url.searchParams.get("prov") || "10";
  const year = body.year ?? (url.searchParams.get("year") ? parseInt(url.searchParams.get("year")!, 10) : 2569);

  try {
    const meta = await fetchAndSaveSnapshot(prov, year);
    return NextResponse.json({
      ok: true,
      prov,
      year,
      rows: meta.rows.length,
      fetchedAt: meta.fetchedAt,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "รีเฟรชสแนปชอตไม่สำเร็จ",
      },
      { status: 502 },
    );
  }
}
