import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ระบบ BOQ งานก่อสร้าง | iServ",
  description:
    "ระบบจัดทำราคากลางงานก่อสร้าง (BOQ) และบริหารงานก่อสร้าง เวอร์ชันต้นแบบ ฟรี ใช้งานได้ทันที",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body className="min-h-screen flex flex-col bg-slate-50 text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <a href="/" className="flex items-center gap-2 font-semibold">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-900 text-sm font-bold text-white">
                B
              </span>
              <span className="text-blue-950">ระบบ BOQ งานก่อสร้าง</span>
              <span className="hidden rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 sm:inline">
                iServ
              </span>
            </a>
            <nav className="flex items-center gap-1 text-sm">
              <a className="rounded-md px-3 py-2 text-slate-700 hover:bg-slate-100" href="/projects">จัดทำราคากลาง</a>
              <a className="rounded-md px-3 py-2 text-slate-700 hover:bg-slate-100" href="/commercial">BOQ เอกชน</a>
              <a className="rounded-md px-3 py-2 text-slate-700 hover:bg-slate-100" href="/prices">คลังราคา</a>
              <a className="rounded-md px-3 py-2 text-slate-700 hover:bg-slate-100" href="/cm">บริหารงานก่อสร้าง</a>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-sm text-slate-600">
            <span>ระบบ BOQ งานก่อสร้าง · iServ — ต้นแบบสำหรับพัฒนาต่อ</span>
            <span className="flex gap-4">
              <a className="hover:underline" href="/terms">ข้อกำหนดการใช้งาน</a>
              <a className="hover:underline" href="/privacy">ความเป็นส่วนตัว</a>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
