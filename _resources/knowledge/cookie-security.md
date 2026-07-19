# Cookie security — HttpOnly & SameSite

ต่อยอดจาก [Authentication, Session & Authorization](authentication-and-authorization.md):
session cookie คือหลักฐาน login → ต้องมี flag ปกป้อง

## TL;DR (อ่านทวนเร็ว)

- session cookie เช่น: `set-cookie: session_token=...; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax`
- **HttpOnly ↔ XSS:** JS อ่าน `document.cookie` ไม่ได้ → XSS ขโมย token ไม่ได้ (แต่ไม่ได้แก้ XSS หายขาด)
- **SameSite=Lax ↔ CSRF:** ไม่แนบ cookie กับ cross-site POST → กัน CSRF
- **หลักจำ:** cookie ผูกกับ **domain ปลายทาง** — เบราว์เซอร์แนบ cookie จาก "request ไปที่ domain ไหน" ไม่ใช่ "หน้าที่ยิงคือเว็บไหน"
- **Max-Age** = อายุ cookie (604800 = 7 วัน) ครบแล้วเบราว์เซอร์ลบทิ้ง
- better-auth ตั้ง HttpOnly + SameSite=Lax ให้ default

---

## จุดตั้งต้น

session cookie ที่ server ส่งกลับมามี flag ปกป้อง:
```
set-cookie: session_token=...; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax
```
cookie นี้ = หลักฐาน login ใครได้ไป หรือทำให้เบราว์เซอร์ส่งผิดที่ = สวมรอยได้
→ 2 flag กัน **2 การโจมตีคนละแบบ**

---

## XSS (Cross-Site Scripting) ↔ HttpOnly

- **XSS:** attacker แอบฝัง JS ให้รันบนหน้าเว็บเรา (เช่น comment ที่ไม่ sanitize) → JS อ่าน `document.cookie` ขโมย token
- **HttpOnly:** attribute บอกเบราว์เซอร์ "ห้าม JS แตะ cookie นี้" → `document.cookie` มองไม่เห็น token → XSS อ่านไปขโมยไม่ได้ (cookie ยังแนบกับ HTTP request ปกติ server ใช้ได้)
- **สำคัญ:** HttpOnly ไม่ได้แก้ XSS หายขาด — XSS ยังรัน/ก่อความเสียหายอื่นได้ แค่กันการอ่าน token ออก; กัน XSS ที่ต้นเหตุคือ sanitize input

---

## CSRF (Cross-Site Request Forgery) ↔ SameSite

- **CSRF:** attacker ไม่ขโมย token และไม่รันโค้ดบนหน้าเรา — หลอกให้เบราว์เซอร์เหยื่อ **ยิง request มาที่ domain เรา** (เช่น form ซ่อนใน `evil.com` ยิง `POST helpdesk.com/api/tickets/5/delete`) → เบราว์เซอร์แนบ session cookie ให้อัตโนมัติ **เพราะปลายทางคือ domain เรา** → server ทำ action ให้จริง
  - attacker ไม่เคยเห็น cookie/response (Same-Origin Policy) — สิ่งที่ได้คือ **ผลของ action** ไม่ใช่ข้อมูล
- **SameSite** = บอกเบราว์เซอร์ว่าจะแนบ cookie เมื่อไหร่ ตาม origin ของ request:

  | ค่า | แนบเมื่อ |
  |---|---|
  | `Strict` | มาจากเว็บเราเท่านั้น |
  | **`Lax`** | เว็บเรา + navigate ระดับบน (คลิกลิงก์/พิมพ์ URL, GET) — **ไม่แนบ**กับ cross-site POST/fetch |
  | `None` | ทุกกรณี (ต้องมี `Secure`) — ไม่กัน CSRF |

- **Lax กัน CSRF:** cross-site POST (form ซ่อน) ไม่ได้ cookie → server ปฏิเสธ; แต่คลิกลิงก์เข้าเว็บเราปกติยังใช้ได้

---

## แยก 2 การโจมตี (จุดสับสนที่สุด)

| | XSS | CSRF |
|---|---|---|
| รันโค้ดบนหน้าเรา? | ใช่ | ไม่ |
| ขโมย token? | ใช่ (ถ้าไม่มี HttpOnly) | ไม่ — ยืม cookie ที่เบราว์เซอร์แนบเอง |
| request ยิงไปไหน | — | **มาที่ domain เรา** |
| เกราะหลัก | HttpOnly (+ sanitize input) | SameSite |

**หลักจำ:** cookie ผูกกับ **domain ปลายทาง** — เบราว์เซอร์แนบ cookie จาก "request กำลังไปที่ domain ไหน" ไม่ใช่ "หน้าที่ยิงคือเว็บไหน"
