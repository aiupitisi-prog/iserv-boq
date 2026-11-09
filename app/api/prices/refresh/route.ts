import { NextResponse } from "next/server";
import { fetchAndSaveSnapshot } from "@/lib/snapshot";

// รีเฟรช snapshot ราคาสำหรับ (จังหวัด, ปี) — เขียนไฟล์จริงได้เฉพาะ dev
// (production serverless = read-only fs)
// บน production ตัวรีเฟรชรายวันคือ GitHub Actions (.github/workflows/snapshot-refresh.yml)
// ที่รัน scripts/make-snapshots.mjs แล้ว commit ไฟล์ snapshot เข้า repo
//
// Vercel cron ส่ง HTTP GET / script ที่เรียกใช้ส่ง POST — route รองรับทั้งสองแบบ (F2)
// กันการยิงถี่/สั่งดึง สนค. ฟรี ๆ ด้วย CRON_SECRET (ตั้ง env CRON_SECRET ใน Vercel แล้ว
// ทุก request (รวม cron) ต้องใส่ Authorization: Bearer <secret> จึงจะผ่าน (F4)

export const maxDuration = 30;

function guard(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null; // ยังไม่ตั้ง secret — เปิดให้ใช้งานได้ (phase ต้นแบบ)
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized — ต้องมี header Authorization: Bearer CRON_SECRET" },
      { status: 401 },
    );
  }
  return null;
}

async function run(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  let body: { prov?: string; year?: number } = {};
  if (req.method === "POST") {
    body = await req.json().catch(() => ({}));
  }
  const prov = body.prov || url.searchParams.get("prov") || "10";
  const year = body.year ?? (parseInt(url.searchParams.get("year") || "", 10) || 2569);

  try {
    const meta = await fetchAndSaveSnapshot(prov, year);
    return NextResponse.json({
      ok: true,
      prov,
      year,
      rows: meta.rows.length,
      fetchedAt: meta.fetchedAt,
      persisted: meta.source === "tpsolive" ? "file (dev only)" : "none",
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

export async function GET(req: Request) {
  const g = guard(req);
  if (g) return g;
  return run(req);
}

export async function POST(req: Request) {
  const g = guard(req);
  if (g) return g;
  return run(req);
}
