---
name: BOQ Release Verification
description: เช็กลิสต์ก่อน commit/push/deploy ของ iServ BOQ — เทสต์ typecheck build diff hygiene commit message git auth Vercel SHA prod 200 rollback และ evidence bundle ใช้เมื่อจะปิดงานหรือปล่อยเวอร์ชัน
---

# BOQ Release Verification

เวอร์ชัน 1.0 — 19 พ.ย. 2569 · เจ้าของ: `boq-qa-release`
ใช้ร่วมกับ `iserv-boq-dev-workflow`

## ใช้เมื่อ

- ก่อน commit/push ทุกครั้ง
- ก่อนประกาศว่า “ปิดงาน” หรือ “deploy แล้ว”
- หลัง rebase/merge ที่มี commit ใหม่จาก remote
- เมื่อต้อง hotfix/rollback production

## 1. Pre-flight

```powershell
git status --short
git diff --stat
git diff --check
git log --oneline -5
```

ตรวจ:

- [ ] รู้ว่ามีไฟล์ของคนอื่น/งานค้างปนมาหรือไม่
- [ ] ไม่มี `temp/`, PDF/สแกนใหม่, secret, ไฟล์ข้อมูลลูกค้า
- [ ] diff ตรง scope ของ brief
- [ ] ไม่มี `console.log`/debug ค้างในเส้นทางผลิต
- [ ] ไม่มี hardcode ตัวเลขกฎหมาย/ปี/อัตราที่ควรมาจาก ruleset

ไฟล์ต้องห้าม commit:

- `temp/**` (gitignored)
- PDF/สแกนใหม่ใน `docs/reg-2569/` เว้นแต่ได้รับอนุมัติ
- `.env*`, token, credential
- ข้อมูลโครงการจริง/ข้อมูลส่วนบุคคล

## 2. Commands บังคับ

```powershell
npx vitest run
Write-Output "EXIT=$LASTEXITCODE"

npx tsc --noEmit
Write-Output "EXIT=$LASTEXITCODE"

npm run build 2>&1
Write-Output "EXIT=$LASTEXITCODE"
```

- ทุกคำสั่งต้อง EXIT=0
- จำนวนเทสต์ต้องไม่ต่ำกว่า baseline (307 ณ 19 พ.ย. 2569)
- ถ้าแตะ `lib/calc/**` ต้องมี invariant/golden ตาม `boq-money-invariants`
- ถ้าแตะเอกสาร/พิมพ์ ต้องมี parity ตาม `boq-report-2569`
- ถ้าแตะ ruleset ต้องมี import/checksum ตาม `boq-ruleset-pipeline`

## 3. Rebase เมื่อ remote มี commit ใหม่

Snapshot bot อาจ push commit แทรก:

```powershell
git fetch origin
git status -sb
git rebase origin/main
```

หลัง rebase ต้องรัน §2 ใหม่ทั้งหมด — ห้ามใช้ผลทดสอบก่อน rebase

ถ้า conflict:

- ห้ามแก้แบบเดา — อ่าน commit ของ bot/ผู้ใช้ก่อน
- ถ้าเป็น `data/snapshots/**` ให้ใช้ของ remote เว้นแต่มีเหตุผลชัด
- ถ้าไม่มั่นใจให้หยุดและถามมนุษย์

## 4. Commit

เขียน message ใน `temp/commit-msg-<slug>.txt` (gitignored) แล้ว:

```powershell
git add <explicit paths>
git commit -F temp/commit-msg-<slug>.txt
```

- `git add` แบบระบุไฟล์ ไม่ใช้ `git add -A` ถ้ามีไฟล์ไม่เกี่ยวข้อง
- message ระบุ scope + finding ที่แก้ (ถ้ามี) + ผลทดสอบ
- ห้าม commit ของที่ไม่ได้ตั้งใจ

## 5. Push และ auth

```powershell
git push origin main
```

ถ้า `gh` active account ไม่มีสิทธิ์เขียน repo:

```powershell
$env:GCM_INTERACTIVE = "never"
git -c credential.https://github.com.helper= -c credential.https://github.com.helper=manager push origin main
```

- ห้ามพิมพ์/echo token ในคำสั่งหรือ log
- ห้าม `git push --force` ทุกกรณี
- ถ้า auth ไม่ผ่าน ให้รายงานว่าต้องใช้ credential ของเจ้าของ repo — อย่าเดา token

## 6. ตรวจ Vercel + production

ใช้ SHA เต็ม:

```powershell
gh api "repos/aiupitisi-prog/iserv-boq/commits/<full-sha>/status" --jq '{state, statuses: [.statuses[] | {context, state, target_url}]}'
```

```powershell
$r = Invoke-WebRequest -Uri "https://iserv-boq.vercel.app/rulesets" -UseBasicParsing -TimeoutSec 60
Write-Output "STATUS=$($r.StatusCode)"
```

- ต้องเห็น Vercel state = success สำหรับ SHA ที่ push
- prod ต้องตอบ 200
- Vercel Hobby cold start อาจ 20–30 วิ — retry อย่างมีเหตุผลก่อนสรุปว่า 500
- ตรวจ `/docs/reg2569` และ `/docs/contract` ด้วยถ้างานแตะเอกสาร

## 7. Evidence bundle

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

เก็บใน `docs/agent-ops/releases/` หรือ progress report ตามขอบเขตงาน

## 8. Rollback / incident

- Rollback = `git revert <sha>` + push ใหม่ แล้วรัน §2–§6
- ห้าม force-push หรือแก้ dashboard
- Incident record:

```md
# Incident — <วันที่>
อาการ:
ผลกระทบ:
สาเหตุ:
สิ่งที่แก้:
หลักฐาน:
บทเรียน:
```

## 9. Definition of Done ของ release

- [ ] G0 brief + risk class
- [ ] G1 tests/tsc/build ผ่าน
- [ ] G2 reviewer PASS (R2–R4)
- [ ] G3 docs/progress/skills อัปเดต
- [ ] G4 commit + Vercel success + prod 200 + tree สะอาด
- [ ] G5 human sign-off (R3 ตรวจพิมพ์จริง / R4 ตัวเลขกฎหมาย)
- [ ] evidence bundle + open questions มี owner
- [ ] ไม่มี secret/temp/PDF หลุด
