# Agent Ops — iServ BOQ

โฟลเดอร์นี้เก็บหลักฐานการทำงานของทีมเอเจนต์ตาม `docs/PRD-AGENT-TEAM.md`
ใช้ร่วมกับ skill `boq-agent-operating-model`

> **สถานะ ณ 23 พ.ย. 2569:** สร้างไฟล์ agent/skill ครบ + CI baseline (U6) + agent asset check แล้ว แต่ยังไม่เริ่ม pilot W1–W6
> โฟลเดอร์ย่อยเริ่มมีงานจริงแล้ว (`briefs/`, `releases/`) — ห้ามใส่ข้อมูลโครงการจริง/PII/token

## โครงสร้าง

| Path | เก็บอะไร | เจ้าของ |
|---|---|---|
| `briefs/YYYY-MM-DD-<slug>.md` | ขอบเขต, risk class, acceptance, สิ่งที่ไม่อยู่ในขอบเขต (G0) | `boq-lead` |
| `plans/YYYY-MM-DD-<slug>.md` | ลำดับขั้น, เจ้าของ, gate, stop conditions | `boq-lead` |
| `reviews/YYYY-MM-DD-<slug>.md` | ผลตรวจของ `boq-compliance-reviewer` (PASS/FAIL + findings) | reviewer |
| `handoffs/YYYY-MM-DD-<slug>.md` | Handoff ตามรูปแบบมาตรฐาน | เจ้าของงาน |
| `releases/YYYY-MM-DD-<slug>.md` | Release evidence (SHA, tests, Vercel, prod) | `boq-qa-release` |
| `open-questions.md` | ข้อที่ยัง `unverified` พร้อม owner/แหล่งที่ต้องเปิด | `boq-lead` |

## รหัสอ้างอิง

| Prefix | ใช้กับ | ตัวอย่าง |
|---|---|---|
| `EV-###` | หลักฐานคำสั่ง/ไฟล์/เทสต์ | `EV-012 npx vitest run → 307 passed` |
| `FND-###` | finding จากรีวิว | `FND-003 block lib/report2569.ts:527` |
| `U-###` | ข้อที่ยัง unverified | `U-001 ปร.3+VAT ต้องเปิดเล่ม 2` |
| `DEC-###` | การตัดสินใจ | `DEC-004 ใช้ contractBase เป็นฐานสัญญา` |

## Template — Brief (G0)

```md
# Brief — <slug>
Date:
Risk: R0 | R1 | R2 | R3 | R4
Owner:
Goal:
In scope:
- ...
Out of scope:
- ...
Acceptance:
- ...
Gates required: G0, G1, ...
Stop conditions:
- ...
```

## Template — Plan

```md
# Plan — <slug>
Steps:
1. <agent> — <งาน> — output — gate
Dependencies:
Risks:
Open questions:
```

## Template — Handoff

```md
# Handoff — <slug>
Status: done | blocked | needs-review
Risk: R0–R4
Summary:
- ...
Files:
- path (created/modified)
Evidence:
- EV-### ...
Open questions:
- U-### ... (owner, แหล่งที่ต้องตรวจ)
Next owner:
- <agent>
```

## Template — Review

```md
# Compliance review — <slug>
Verdict: PASS | FAIL
|Severity|File:line|Rule|Finding|Suggested fix|
|---|---|---|---|---|
|block|lib/...:123|...|...|...|
Unverified: U-### ...
Evidence checked: EV-### ...
```

## Template — Release evidence

```md
# Release evidence — <slug>
Date:
Commit: <full-sha>
Branch: main
Tests: <n> passed / <files> files
Typecheck: EXIT=0
Build: EXIT=0
Vercel: success (<target-url>)
Prod: https://iserv-boq.vercel.app/rulesets → 200
Git status: clean
Notes:
- ...
```

## กฎเหล็ก

- ทุกข้อสรุปต้องมี evidence — ไม่มีหลักฐาน = ไม่มี PASS
- Reviewer ต้องเป็นคนละ session/บริบทกับผู้เขียน และเป็น read-only
- งาน R2–R4 ต้องมี reviewer PASS ก่อน QA release; R4 ต้องมี human sign-off
- ห้ามลบ/ลด disclaimer หรือ provenance เพื่อให้ผ่าน
- ข้อที่ตรวจไม่ได้ให้บันทึกใน `open-questions.md` — ห้ามเดา
- ห้าม commit PDF/สแกน/ไฟล์ข้อมูลจริง; `temp/` ถูก gitignore
