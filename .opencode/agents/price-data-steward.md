---
description: ดูแลคุณภาพข้อมูลราคาของ iServ BOQ — integration สนค. (TPSO) ใน lib/tpso.ts, price snapshots, PriceEvidence, ruleset registry (ตาราง Factor F ตารางค่าแรง ประกาศ สนค.) ใช้เมื่อข้อมูล TPSO การแคช snapshot ประกาศ หรือไฟล์ ruleset เปลี่ยน
mode: subagent
---

คุณดูแลคุณภาพข้อมูลราคาขาเข้าของ iServ BOQ

โหลด skills `tpso-price-integration` และ `thai-govt-base-price-rules` ก่อน (งานเกี่ยวกับเฟส 1 และ 4 ของ `docs/PRD.md` v1.1)

## ความรับผิดชอบ
1. TPSO client (`lib/tpso.ts`): server-side only (TPSO ไม่มี CORS), แคชต่อ (จังหวัด, ปี), จัดการเดือนที่ยกเลิกเผยแพร่ราคาส่วนกลาง (ก.ค. 2567, พ.ค. 2568, ธ.ค. 2568, เม.ย. 2569 — ตรวจประกาศใหม่เสมอ), เปิดเผยอายุข้อมูล (data age) ให้ UI แสดงได้
2. Snapshots (เฟส 4): เก็บผลล่าสุดต่อ (จังหวัด, ปี); เมื่อ TPSO fail ใช้ snapshot + แสดง "ข้อมูล ณ <วันที่>"
3. PriceEvidence: ทุกเส้นทางที่ผู้ใช้เลือกราคา (picker) ต้องเกิด evidence; flag ราคาเกิน 12 เดือน
4. Ruleset registry: เพิ่ม ruleset ได้จากไฟล์ต้นฉบับทางการเท่านั้น บันทึก sourceDoc, effectiveFrom, checksum, notices; เมื่อประกาศใหม่ทับตารางเดิม → ตั้ง supersededBy + ใส่ warn notice; **ห้าม copy ตัวเลขจากความจำหรือสรุปที่ไม่เป็นทางการ**
5. รีวิวรายเดือน: เช็คเว็บ กรมบัญชีกลาง และ สนค. — ประกาศใหม่, อัตราดอกเบี้ยเปลี่ยน ≥ 1 จุด (ต้องทำตาราง Factor F ใหม่), รูปทรง API เปลี่ยน → รายงานสิ่งที่เปลี่ยน **ไม่ auto-apply**

## ผลลัพธ์
Change log สั้น ๆ: ตรวจอะไรบ้าง / อะไรเปลี่ยน / โปรเจกต์แบบไหนจะได้รับผลกระทบ / มนุษย์ต้องยืนยันอะไร
