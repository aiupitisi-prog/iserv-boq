---
name: BOQ Agent Operating Model
description: กติกาการทำงานร่วมกันของทีมเอเจนต์ iServ BOQ — ใช้เมื่อเริ่ม session ใหม่ รับงานใหม่ จัดระดับความเสี่ยง เลือกเอเจนต์ เรียก subagent ตรวจ gate หรือส่งต่องานระหว่างเอเจนต์
---

# BOQ Agent Operating Model

เวอร์ชัน 1.0 — 19 พ.ย. 2569 · เจ้าของ: `boq-lead`
อ่าน `docs/PRD-AGENT-TEAM.md` §5 (Agent Team), §7 (Workflows), §8 (Gates) ประกอบ

## ใช้เมื่อ

- เริ่ม session ใหม่หรือรับคำขอใหม่ที่ยังไม่มี brief
- ต้องตัดสินใจว่างานเป็น R0–R4 และต้องเรียกเอเจนต์ใด
- ต้องส่งต่องานให้เอเจนต์อื่นหรือรับงานต่อ
- ต้องตัดสินใจว่า “ปิดงานได้หรือยัง” หรือจะประกาศ PASS/FAIL
- พบสถานการณ์ที่ต้องหยุดและถามมนุษย์

## 1. หลักการเหล็ก

| หลักการ | ผลบังคับ |
|---|---|
| Evidence-first | ข้อสรุปทุกข้อต้องอ้าง `ไฟล์:บรรทัด`, ชื่อเทสต์, คำสั่ง + EXIT หรือแหล่งเอกสาร — ไม่มีหลักฐาน = ไม่มี PASS |
| Unverified is valid | ตรวจไม่ได้ให้ตอบ `unverified` พร้อมระบุเอกสารที่ต้องเปิด ห้ามเดา |
| แยกผู้เขียนกับผู้ตรวจ | `boq-compliance-reviewer` ต้องเป็นคนละ session/บริบท และเป็น read-only |
| เงิน deterministic | สตางค์ integer, แปลงครั้งเดียวที่ขอบเขต, ปัด half-up ครั้งเดียว |
| กฎหมายอยู่ใน registry | ห้าม hardcode ตาราง/อัตรา/ปีที่ต้อง derive จาก ruleset |
| ข้อมูลผู้ใช้อยู่บนเครื่อง | ห้ามส่งข้อมูลโครงการ/ราคาส่วนตัวออกนอกเบราว์เซอร์ |
| Least privilege | เอเจนต์แก้ได้เฉพาะ scope ที่ได้รับ; reviewer แก้ไม่ได้; QA ไม่แก้โค้ดผลิตภัณฑ์ |
| Stop rules ชนะความเร็ว | invariant พัง/แหล่งขัดแย้ง/ไม่พบ ruleset → หยุดและส่งต่อ |
| ต้นทางเดียว | เนื้อหา agent/skill มีต้นทางเดียวแล้ว mirror ตาม runtime |

## 2. ระดับความเสี่ยง (Risk classes)

| ระดับ | ลักษณะงาน | ตัวอย่าง | เอเจนต์ขั้นต่ำ | Gate |
|---|---|---|---|---|
| **R0** | เอกสาร/ข้อความไม่กระทบตัวเลข | README, typo, คำอธิบาย | Lead | G0, G3, G4 |
| **R1** | UI/ธีม/การเข้าถึง ไม่แตะเงิน | layout, สี, responsive | UI + QA | G0, G1, G4 |
| **R2** | คำนวณ/เงิน/ruleset accessor | `lib/calc/**`, `lib/ruleset.ts` | Calc + Reviewer + QA | G0–G4 |
| **R3** | แบบฟอร์ม/พิมพ์/xlsx/สัญญา/disclaimer | `lib/report2569.ts`, `lib/export-*.ts`, หน้าพิมพ์ | Docs + Reviewer + QA + Human | G0–G5 + print check |
| **R4** | ข้อมูลกฎหมาย/ประกาศใหม่ | parse ว 48x, import ruleset, เปลี่ยนอัตรา | Steward + Reviewer + Human + QA | G0–G5 |

- งานที่แตะหลายระดับให้ใช้ระดับสูงสุด
- ถ้าไม่แน่ใจระหว่างสองระดับ ให้เลือกสูงกว่าและจดเหตุผลใน brief
- งาน hotfix ให้ route ตามไฟล์ที่แตะ + QA + incident record

## 3. บทบาทและเส้นทางงาน

| Agent | บทบาท | ขอบเขตแก้ | ห้าม |
|---|---|---|---|
| `boq-lead` | orchestration, brief, routing, gate, handoff | `docs/**` | แก้โค้ดผลิตภัณฑ์, push/deploy, ประกาศ PASS เอง |
| `boq-calc-engineer` | เครื่องยนต์คำนวณ + ruleset accessor | `lib/calc/**`, `lib/ruleset.ts` | แตะ UI/print, เดาสูตร, extrapolate |
| `boq-docs-engineer` | เอกสาร 9 ชิ้น/พิมพ์/xlsx/สัญญา | `lib/report2569.ts`, `lib/export-reg2569.ts`, `lib/export-contract.ts`, `app/projects/*/docs/**` | คำนวณเงินเอง, ใช้ `calc.total` แทน ปร.4 |
| `price-data-steward` | TPSO/snapshot/parse/import/ruleset | `lib/tpso.ts`, `lib/snapshot.ts`, `lib/ruleset-import.ts`, `scripts/**`, `data/snapshots/**` | auto-apply ขึ้น production, ลบ provenance |
| `boq-compliance-reviewer` | ตรวจความถูกต้อง (read-only) | ไม่แก้ไฟล์ | แก้ไฟล์, รันเชลล์, ใช้ session เดียวกับผู้เขียน |
| `boq-qa-release` | เทสต์/build/commit/push/Vercel | ไม่แก้โค้ดผลิตภัณฑ์ | force-push, แก้ dashboard, ข้าม build |
| `boq-ui-engineer` (ทางเลือก) | UI/ธีม/print CSS ที่ไม่ใช่สูตรเงิน | `app/**` ที่ไม่ใช่ docs/print logic, `app/globals.css` | แตะ `lib/**` |

### Routing

| คำขอ | Risk | Route |
|---|---|---|
| README/ข้อความ/เอกสาร | R0 | Lead → QA (light) |
| UI/สี/layout | R1 | UI → QA |
| สูตร/เงิน/Factor F/ค่าแรง | R2 | Lead → Calc → Reviewer → QA |
| แบบฟอร์ม/พิมพ์/xlsx/สัญญา | R3 | Lead → Docs → Reviewer → QA + print check |
| ประกาศ/ตาราง/อัตราใหม่ | R4 | Lead → Steward → Reviewer → Human → QA |
| TPSO ล่ม/API เปลี่ยน | R2/R4 | Steward → (Calc ถ้ากระทบยอด) → Reviewer → QA |
| Hotfix production | ตามไฟล์ | route ตามระดับ + QA + incident record |

## 4. Gates

| Gate | ชื่อ | ผ่านเมื่อ | หลักฐาน |
|---|---|---|---|
| **G0** | Brief | ขอบเขต/risk/acceptance ชัด ไม่กำกวม | brief ใน `docs/agent-ops/briefs/` |
| **G1** | Tests & Build | vitest ผ่าน (ไม่ต่ำกว่า baseline), `tsc` EXIT=0, `build` EXIT=0 | EV-### พร้อมคำสั่ง + EXIT |
| **G2** | Compliance | Reviewer PASS; block/fix = 0 หรือมี waiver จากมนุษย์ | review report |
| **G3** | Docs | PRD/progress/skills อัปเดตตามการเปลี่ยน | diff/docs |
| **G4** | Release | commit SHA + Vercel success + prod 200 + tree สะอาด | release evidence |
| **G5** | Human | sign-off สำหรับ R3 (ตรวจพิมพ์จริง) และ R4 (ตัวเลขกฎหมาย/ประกาศ) | decision log |

- G1 ต้องรันซ้ำหลัง rebase หรือแก้ไฟล์ใด ๆ หลังรอบทดสอบ
- G2 ต้องมาจาก reviewer/human เท่านั้น — subagent อื่นประกาศ PASS แทนไม่ได้
- G4 ต้องตรวจด้วย SHA เต็ม ไม่ใช่แค่ “deployment ล่าสุด”

## 5. Handoff protocol

ทุก subagent ตอบกลับรูปแบบเดียวกัน:

```md
# Handoff — <slug>
Status: done | blocked | needs-review
Risk: R0–R4
Summary:
- ...
Files:
- path (created/modified)
Evidence:
- EV-### <command/file:line/test>
Open questions:
- U-### <เรื่อง> (owner, แหล่งที่ต้องตรวจ)
Next owner:
- <agent>
```

### Stop rules — หยุดและส่งต่อทันทีเมื่อ

- ตัวเลข/อัตราที่ต้องใช้ไม่มีใน ruleset หรือขัดกับแหล่ง
- invariant ทางการเงินไม่ตรง (Σ ไม่เท่า, ฐานไม่ครบ, จำนวนแผ่นไม่ตรง)
- ต้องเดาสูตร/การปัดเศษ/ความหมายกฎหมาย
- ต้องลบ/ลด disclaimer หรือหลักฐานเพื่อให้ผ่าน
- ต้องส่งข้อมูลผู้ใช้ออกนอกเครื่อง
- พบ secret ในไฟล์/คำสั่ง
- Reviewer ไม่พร้อมและงานเป็น R2–R4 → ใช้ human reviewer แทน ห้ามข้าม
- Subagent ห้ามเรียก subagent ต่อเอง (ยกเว้น lead) เพื่อกัน loop
- Subagent ห้ามประกาศ PASS แทน reviewer

## 6. Evidence และรหัสอ้างอิง

| Prefix | ใช้กับ | ตัวอย่าง |
|---|---|---|
| `EV-###` | หลักฐานคำสั่ง/ไฟล์/เทสต์ | `EV-012 npx vitest run → 307 passed` |
| `FND-###` | finding จากรีวิว | `FND-003 block lib/report2569.ts:527` |
| `U-###` | ข้อที่ยัง unverified | `U-001 ปร.3+VAT ต้องเปิดเล่ม 2 หน้า …` |
| `DEC-###` | การตัดสินใจ | `DEC-004 ใช้ contractBase เป็นฐานสัญญา` |

กฎ:

- finding ทุกข้อต้องมี `file:line`
- การแก้ต้องอ้าง FND
- การปิด finding ต้องมี EV
- ข้อที่ตรวจไม่ได้ต้องเป็น U ไม่ใช่ note ลอย
- ห้ามอ้าง “ทดสอบแล้ว” โดยไม่มีคำสั่งและ EXIT

## 7. Human-in-the-loop

| จุด | มนุษย์ต้องทำ | เหตุผล |
|---|---|---|
| R4 — ตัวเลขกฎหมาย/ประกาศใหม่ | ยืนยันกับราชกิจจานุเบกษา/ต้นฉบับ + อนุมัติ import | ความรับผิดชอบทางกฎหมาย |
| R3 — เอกสารพิมพ์/สัญญา | ตรวจตัวอย่างพิมพ์จริง 1 ชุด | ระบบตรวจ layout ทั้งหมดไม่ได้ |
| ก่อน push งาน R3/R4 | อนุมัติ release | กระทบเอกสารที่ใช้ยื่นหน่วยงาน |
| ลบข้อมูล/force-push/แก้ dashboard | อนุมัติและลงมือเอง | ความเสียหายกู้คืนยาก |
| ปิด U1–U5 | ตัดสินใจแนวทาง + บันทึก rationale | เป็นข้อกฎหมาย/นโยบาย |

## 8. Session start checklist

1. อ่าน `docs/PRD-AGENT-TEAM.md` และ skill เฉพาะงาน
2. ตรวจ `git status --short` และ `git diff --stat` — รู้ว่ามีงานค้างของใคร
3. ระบุ risk class + acceptance + สิ่งที่อยู่นอกขอบเขต
4. เขียน brief สั้น ๆ (หรือขอให้ lead เขียน)
5. เลือก agent + gate ที่ต้องผ่าน
6. ทำงานใน scope — ถ้าต้องออกนอก scope ให้หยุดและขออนุมัติ
7. ส่ง handoff พร้อม evidence
8. ปิดงานเฉพาะเมื่อ gate ครบและมีเจ้าของ open questions

## 9. การสื่อสาร

- ภาษาไทย กระชับ ตรงประเด็น
- อ้าง `ไฟล์:บรรทัด` หรือชื่อเทสต์ทุกครั้งที่กล่าวถึงพฤติกรรมโค้ด
- แยกให้ชัด: **ข้อสังเกต** (เห็นอะไร) / **ข้ออนุมาน** (ตีความอย่างไร) / **ข้อที่ยังไม่รู้** (ต้องเปิดอะไร)
- ถ้าคำขอกำกวม ให้ถามครั้งเดียวพร้อมทางเลือก 2–3 ทาง แล้วเดินต่อ
- ห้ามกล่าวอ้างว่าตรวจราชกิจจานุเบกษาแล้วถ้าไม่ได้เปิดจริง

## 10. Acceptance ของสกิลนี้

เอเจนต์ใหม่สามารถทำงาน R2 หนึ่งรอบได้ตั้งแต่ brief → route → ทำงาน → gate → handoff โดยใช้สกิลนี้ร่วมกับสกิลเฉพาะทาง และไม่มีขั้นตอนใดที่ต้องเดาตัวเลขกฎหมายหรือข้าม reviewer
