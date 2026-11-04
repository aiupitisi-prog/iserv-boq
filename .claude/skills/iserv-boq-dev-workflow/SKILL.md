---
name: iServ BOQ Dev Workflow
description: ข้อตกลงและขั้นตอนพัฒนาโปรเจกต์ iServ BOQ (Next.js 15 + Vercel) — โครงสร้างไฟล์ ธีมดาร์ค print-safe การ push/deploy ข้อจำกัด Vercel Hobby และหลักการคุ้มครองข้อมูลผู้ใช้ ใช้ทุกครั้งที่แก้โค้ดใน repo นี้
---

# iServ BOQ — ข้อตกลงการพัฒนา

- โปรเจกต์: ระบบจัดทำราคากลาง / BOQ งานก่อสร้าง
- เว็บ: https://iserv-boq.vercel.app · Repo: https://github.com/aiupitisi-prog/iserv-boq
- **อ่าน `docs/PRD.md` ก่อนเริ่ม** (สถานะปัจจุบัน, ข้อจำกัด/ความเสี่ยง, แผน 6 เฟส, ภาคผนวก TPSO API)

## โครงสร้างไฟล์หลัก

| ไฟล์ | หน้าที่ |
|---|---|
| `app/page.tsx` | หน้าแรก (hero + กริดไอคอน 6 ช่อง) |
| `app/prices/page.tsx` | คลังราคา สนค. — Server Component, กรอง/ค้นหา/แบ่งหน้าฝั่งเซิร์ฟเวอร์ (query params: prov/y/cat/q/page, 200 รายการ/หน้า) |
| `app/projects/[id]/editor.tsx` | BOQ editor (client) — แก้ตรงตาราง, autosave, พิมพ์ A4 |
| `lib/boq.ts` | types (BoqProject/BoqItem), ฟังก์ชันรวมเงิน, BOQ ตัวอย่าง |
| `lib/storage.ts` | localStorage (key `iserv-boq-projects-v1`) |
| `lib/tpso.ts` | client ดึงราคา สนค. — **server-only** |
| `app/globals.css` | ธีมดาร์คทั้งเว็บ (override Tailwind utilities ที่จุดเดียว) + `@media print` บังคับขาวดำ |

## ข้อตกลงเหล็ก (ห้ามฝ่า)

1. **ธีม**: ปรับสีรวมใน `app/globals.css` เท่านั้น ห้าม hardcode สีใหม่กระจายหลายไฟล์ — ทุกหน้าต้องยังพิมพ์ขาวดำได้
2. **ข้อมูลผู้ใช้ (โปรเจกต์ BOQ) อยู่บนเครื่องผู้ใช้** — ห้ามส่งขึ้นเซิร์ฟเวอร์ เพิ่มฟิลด์ใหม่ใน `BoqProject`/`BoqItem` ต้องเป็น optional + backward compatible (โปรเจกต์เก่าใน localStorage ต้องยังเปิดได้)
3. **ราคาจาก TPSO ต้องโปร่งใส**: ระบุที่มา (จังหวัด, เดือน/ปี) และมี disclaimer เสมอ — **ห้ามเรียก TPSO จากเบราว์เซอร์** (ไม่มี CORS header)
4. **Disclaimer** "ไม่ใช่ราคามาตรฐานของกรมบัญชีกลางหรือหน่วยงานใด" ห้ามถูกลบออกจากหน้าที่แสดงราคา
5. **Deploy ผ่าน git เท่านั้น**: push `main` → Vercel auto-build (~30 วิ) ตรวจสถานะที่ vercel.com/aiupitisi-7393/iserv-boq/deployments — ไม่แก้ไฟล์บน dashboard

## การ push เมื่อเครื่องไม่มี git

ใช้ GitHub Contents API: `PUT /repos/aiupitisi-prog/iserv-boq/contents/<path>`
- Authorization: PAT จาก env `GITHUB_PAT` (User scope)
- **ไฟล์ใหม่ต้อง handle 404** (ยังไม่มี sha → ไม่ส่ง field sha)
- **สคริปต์ PowerShell ต้อง ASCII-only** (PS 5.1 อ่าน .ps1 เป็น ANSI — ข้อความ commit ใช้ภาษาอังกฤษ, ห้าม em-dash/อักษรไทยใน .ps1)

## ข้อจำกัด runtime ที่ต้องออกแบบรอบ

- **Vercel Hobby**: `maxDuration` 30 วิ → หน้าที่ fetch TPSO ตั้ง `export const maxDuration = 30`
- first load แคชเย็น ~20–30 วิ (payload ~2MB) → แคชทุกครั้ง (ดู skill `tpso-price-integration`)
- **localStorage ~5MB** — ห้ามเก็บชุดข้อมูลราคาขนาดใหญ่ลง localStorage
- กรอง/ค้นหา/แบ่งหน้า ชุดข้อมูลใหญ่ = ทำฝั่งเซิร์ฟเวอร์ผ่าน query params — ห้ามยกทั้งชุดไป client

## การทดสอบก่อนส่งมอบ

1. Deploy Ready บน Vercel
2. เปิดหน้าจริงด้วยเบราว์เซอร์: หน้าแรก, `/prices` (กรอง + ค้น + แบ่งหน้า), `/projects` + editor + พิมพ์ A4 ขาวดำ
3. งานที่แตะการคำนวณ/แบบฟอร์ม/แหล่งราคา/disclaimer → **ให้ agent `boq-compliance-reviewer` ตรวจก่อนปิดงาน** (ดู docs/PRD.md ส่วน 9)
4. แก้เกณฑ์คำนวณ → เขียนเวกเตอร์ทดสอบก่อน (Vitest — ดู skill `thai-govt-base-price-rules`)
