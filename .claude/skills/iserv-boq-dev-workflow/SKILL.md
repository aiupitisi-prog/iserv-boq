---
name: iServ BOQ Dev Workflow
description: ข้อตกลงและขั้นตอนพัฒนาโปรเจกต์ iServ BOQ (Next.js 15 + Vercel) — โครงสร้างไฟล์ ธีมดาร์ค print-safe การทดสอบ การ commit/push/deploy ข้อจำกัด Vercel Hobby และหลักการคุ้มครองข้อมูลผู้ใช้ ใช้ทุกครั้งที่แก้โค้ดใน repo นี้
---

# iServ BOQ — ข้อตกลงการพัฒนา (v2)

เวอร์ชัน 2.0 — 19 พ.ย. 2569 · เจ้าของ: `boq-lead`
ใช้ร่วมกับ `boq-agent-operating-model`, `boq-release-verification` และสกิลเฉพาะงาน

- โปรเจกต์: ระบบจัดทำราคากลาง / BOQ งานก่อสร้าง
- เว็บ: https://iserv-boq.vercel.app · Repo: https://github.com/aiupitisi-prog/iserv-boq
- **อ่าน `docs/PRD.md` และ `docs/PRD-AGENT-TEAM.md` ก่อนเริ่ม**
- Baseline quality ณ 19 พ.ย. 2569: vitest 307 passed / 18 ไฟล์ · `tsc` EXIT=0 · build EXIT=0

## 1. Repo map

| ไฟล์/โฟลเดอร์ | หน้าที่ |
|---|---|
| `app/page.tsx` | หน้าแรก |
| `app/prices/page.tsx` | คลังราคา สนค. — Server Component, snapshot-first, กรอง/ค้นหา/แบ่งหน้า |
| `app/my-prices/**` | คลังราคาส่วนตัวของผู้ใช้ |
| `app/projects/[id]/editor.tsx` | BOQ editor (client) — แก้ตาราง, autosave, ราคา, พิมพ์ |
| `app/projects/[id]/docs/**` | เอกสารเก่า, ชุด 9 ชิ้น (`reg2569`), แนบท้ายสัญญา (`contract`) |
| `app/rulesets/**` | เครื่องคิด Factor F / ค่าแรง / ค่าขนส่ง / ค่าเครื่องจักร |
| `lib/boq.ts` | types `BoqProject`/`BoqItem`, ฟังก์ชันรวมเงินเดิม |
| `lib/storage.ts`, `lib/storage-idb.ts` | localStorage + IndexedDB fallback |
| `lib/tpso.ts` | TPSO client — **server-only** |
| `lib/snapshot.ts` | อ่าน/เขียน snapshot + master |
| `lib/calc/**` | เครื่องยนต์คำนวณ (money, factorf, wage, transport, machinery, reduce) |
| `lib/ruleset.ts` | types, lookup, checksum, `rulesetBeYear`, status |
| `lib/ruleset-import.ts` | import/validate ruleset JSON |
| `lib/ruleset-w475/477/480/481-2569.ts` | ชุดข้อมูลที่ generate จาก PDF |
| `lib/report2569.ts` | builder ชุด 9 ชิ้น + `contractBase` + evidence |
| `lib/export-reg2569.ts` | xlsx ชุดเผยแพร่ 10–12 ชีต |
| `lib/export-contract.ts` | xlsx แนบท้ายสัญญา |
| `data/snapshots/**` | snapshot TPSO ที่ commit ไว้ |
| `scripts/parse-*.mjs` | parser PDF → ruleset |
| `scripts/make-snapshots.mjs` | สร้าง snapshot |
| `docs/reg-2569/**` | manifest/หลักฐานประกาศ |
| `docs/agent-ops/**` | brief/plan/review/handoff/evidence ของทีม |
| `app/globals.css` | ธีมดาร์ค + `@media print` ขาวดำ |

## 2. ข้อตกลงเหล็ก

1. **ธีม**: ปรับสีรวมใน `app/globals.css` เท่านั้น ห้าม hardcode สีใหม่กระจายหลายไฟล์ — ทุกหน้าต้องพิมพ์ขาวดำได้
2. **ข้อมูลผู้ใช้อยู่บนเครื่อง** — ห้ามส่งโครงการ/ราคาส่วนตัวขึ้นเซิร์ฟเวอร์; ฟิลด์ใหม่ใน `BoqProject`/`BoqItem` ต้อง optional + backward compatible
3. **ราคา TPSO โปร่งใส**: ระบุจังหวัด/เดือน/ปี/ที่มา + disclaimer; **ห้าม fetch จากเบราว์เซอร์** (ไม่มี CORS)
4. **Disclaimer** “ไม่ใช่ราคามาตรฐานของกรมบัญชีกลาง” ห้ามหายจากหน้าที่แสดงราคา/เอกสาร
5. **เงินเป็นสตางค์ integer** — ดู `boq-money-invariants`; ห้าม float ในเส้นทางคำนวณ
6. **กฎหมายอยู่ใน ruleset** — ห้าม hardcode ตาราง/อัตรา/ปีที่ต้อง derive; ปีที่เป็นชื่อหลักเกณฑ์ต้องมีที่มา
7. **Deploy ผ่าน git เท่านั้น** — push `main` → Vercel auto-build; ห้ามแก้ dashboard
8. **ไม่ force-push** และไม่ commit secret/temp/PDF ใหม่โดยไม่ได้รับอนุมัติ

## 3. Test matrix

| ชนิดการเปลี่ยน | ต้องรัน/มี |
|---|---|
| `lib/calc/**` | unit + golden + invariant + property ตามเดิม |
| `lib/report2569.ts` | report invariants (Σ mat+lab, contractBase, page count, warnings) |
| `lib/export-*.ts` | โครงสร้าง workbook, จำนวนชีต, เงินเป็น number, disclaimer, ปี พ.ศ. |
| `lib/ruleset*.ts` | checksum/import/golden/strict parse |
| `app/**` | `npm run build` + manual smoke (home/prices/projects/editor/print) |
| `docs/**` | build + link/heading check (manual) |
| ก่อน push ทุกครั้ง | full `npx vitest run` + `npx tsc --noEmit` + `npm run build` |

คำสั่ง:

```powershell
npx vitest run
npx tsc --noEmit; Write-Output "EXIT=$LASTEXITCODE"
npm run build 2>&1; Write-Output "EXIT=$LASTEXITCODE"
```

## 4. Commit / push / deploy

- เขียน message ใน `temp/commit-msg-<slug>.txt` (gitignored) → `git commit -F`
- `git add` แบบระบุไฟล์; ตรวจ `git status --short` ก่อน
- remote อาจมี snapshot bot commit → `git fetch origin` + `git rebase origin/main` + รันเทสต์ซ้ำ
- push: `git push origin main`; ถ้า `gh` active account ไม่มีสิทธิ์ ใช้ credential helper ของเจ้าของ repo โดยไม่พิมพ์ token:

```powershell
$env:GCM_INTERACTIVE = "never"
git -c credential.https://github.com.helper= -c credential.https://github.com.helper=manager push origin main
```

- ตรวจ Vercel ด้วย SHA เต็ม + prod 200 ตาม `boq-release-verification`
- Vercel Hobby cold start ~20–30 วิ; retry อย่างมีเหตุผลก่อนสรุปว่า 500

## 5. Vercel / runtime constraints

- `maxDuration = 30` สำหรับหน้าที่ fetch TPSO
- snapshot ถูก package ผ่าน `next.config.mjs` → `outputFileTracingIncludes` (`/prices`, `/api/prices/*`)
- production filesystem อ่านอย่างเดียว — ห้ามเขียนไฟล์ runtime; snapshot ใช้ GitHub Actions
- payload TPSO เต็มปีต่อจังหวัด ~2MB → แคช/แบ่งหน้า/อย่ายกทั้งชุดไป client
- localStorage ~5MB — ข้อมูลใหญ่ใช้ IndexedDB

## 6. GitHub Actions

- `.github/workflows/snapshot-refresh.yml` รีเฟรช snapshot รายวัน (04:00 น. ไทย) และ commit กลับ
- ยังไม่มี CI รันเทสต์ — ถ้าเพิ่ม ต้องรัน `vitest` + `tsc` + `build`
- bot commit อาจแทรกก่อน push ของเรา → rebase และรันซ้ำ

## 7. ข้อมูลและความเป็นส่วนตัว

- ข้อมูลโครงการ/ราคาส่วนตัวอยู่ใน localStorage/IndexedDB ของผู้ใช้
- ห้ามส่งออกนอกเครื่องผ่าน network โดยไม่ได้รับอนุญาต
- งานทดสอบใช้ fixture สมมุติ ไม่ใช้ข้อมูลลูกค้าจริง
- `/privacy` ต้องอัปเดตถ้ามีการเก็บข้อมูลใหม่
- log/รายงานต้อง redact token/PII

## 8. Definition of Done (ย่อ)

- [ ] brief + risk class + acceptance
- [ ] โค้ด/เอกสารตรง scope
- [ ] vitest ผ่าน ไม่ต่ำกว่า baseline
- [ ] `tsc` EXIT=0
- [ ] `build` EXIT=0
- [ ] reviewer PASS (R2–R4)
- [ ] docs/progress/skills อัปเดต
- [ ] git tree สะอาด ไม่มี temp/secret/PDF
- [ ] commit + push + Vercel success + prod 200
- [ ] handoff + open questions มี owner

## 9. ข้อห้าม

- ห้ามใช้ `git push --force`
- ห้ามแก้ไฟล์/ตั้งค่าบน Vercel dashboard
- ห้าม hardcode สี/ปี/ตัวเลขกฎหมาย
- ห้ามลบ disclaimer/หลักฐานเพื่อให้ build ผ่าน
- ห้าม commit `temp/`, PDF/สแกนใหม่, token
- ห้ามเดาตัวเลข/สูตรแทน ruleset — ให้ตอบ `unverified`
