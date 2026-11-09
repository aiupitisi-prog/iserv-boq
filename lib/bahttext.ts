// ตัวเลขเงินเป็นตัวหนังสือไทย ("บาทถ้วน") — ใช้ในเอกสารพิมพ์ (F3.2)
// อินพุตเป็นสตางค์ integer (กฎเหล็ก — ไม่คำนวณจาก float)

const DIGITS = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];

// อ่านกลุ่ม 6 หลัก (0 < g < 1,000,000)
// กฎ "เอ็ด": หลักหน่วยเป็น 1 อ่าน "เอ็ด" เมื่อมีตัวเลขอื่นอ่านก่อนหน้าในจำนวนเดียวกัน กรณีใดก็ตามที่:
//   - หลักสิบขึ้นไปในกลุ่มนี้ไม่เป็นศูนย์ (เช่น 11, 21, 101, 111) หรือ
//   - กลุ่มนี้ไม่ใช่กลุ่มแรกของจำนวน (มี "…ล้าน" อ่านก่อนแล้ว เช่น 1,000,001 → หนึ่งล้านเอ็ด)
// กรณีเดียวที่อ่าน "หนึ่ง" คือจำนวนเริ่มต้นด้วย 1 ตัวเดียว เช่น 1 → "หนึ่ง", 1,000,000 → "หนึ่งล้าน"
function readGroup(g: number, isLeadingGroup: boolean): string {
  const digits = String(g).padStart(6, "0");
  const edEligible = Math.floor(g / 10) > 0 || !isLeadingGroup;
  const POS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];
  let out = "";
  for (let i = 0; i < 6; i++) {
    const d = parseInt(digits[i], 10);
    if (d === 0) continue;
    const pos = 5 - i; // 0 = หน่วย, 1 = สิบ, ... 5 = แสน
    if (pos === 0) {
      out += d === 1 && edEligible ? "เอ็ด" : DIGITS[d];
    } else if (pos === 1) {
      out += d === 1 ? "สิบ" : d === 2 ? "ยี่สิบ" : DIGITS[d] + "สิบ";
    } else {
      out += DIGITS[d] + POS[pos];
    }
  }
  return out;
}

// อ่านจำนวนเต็มเป็นคำไทย (แบ่งกลุ่มละ 6 หลัก — ต่อกันด้วย "ล้าน" ทุกขอบเขตกลุ่ม รวมกลุ่มศูนย์ตรงกลาง)
function readInteger(n: number): string {
  if (n === 0) return "ศูนย์";
  const groups: number[] = [];
  let rest = String(n);
  while (rest.length > 6) {
    groups.unshift(parseInt(rest.slice(-6), 10));
    rest = rest.slice(0, -6);
  }
  groups.unshift(parseInt(rest, 10));
  let out = "";
  for (let gi = 0; gi < groups.length; gi++) {
    if (groups[gi] !== 0) out += readGroup(groups[gi], gi === 0);
    if (gi < groups.length - 1) out += "ล้าน"; // กลุ่มศูนย์ตรงกลางก็ต้องมี "ล้าน" (เช่น 1,000,000,000,001 → หนึ่งล้านล้านเอ็ด)
  }
  return out;
}

// สตางค์ → "…บาทถ้วน" / "…บาท…สตางค์" / "…สตางค์"
export function bahtText(satang: number): string {
  const s = Math.round(satang); // กันอินพุตจากขอบเขต — ค่าที่ผ่านมาเป็น integer แล้ว
  const sign = s < 0 ? "ลบ" : "";
  const abs = Math.abs(s);
  const baht = Math.floor(abs / 100);
  const st = abs % 100;
  if (baht === 0 && st === 0) return sign + "ศูนย์บาทถ้วน";
  if (st === 0) return sign + readInteger(baht) + "บาทถ้วน";
  if (baht === 0) return sign + readInteger(st) + "สตางค์";
  return sign + readInteger(baht) + "บาท" + readInteger(st) + "สตางค์";
}
