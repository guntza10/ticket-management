# CORS & Same-Origin Policy — ใครบล็อค และบล็อคอะไร

ทำไมโปรเจกต์นี้ต้องมี `cors()` ใน `server/src/index.ts`: client (`:5173`) กับ server (`:3000`)
เป็น **คนละ origin**. Same-Origin Policy ถูกอ้างถึงแล้วใน
[Cookie security](cookie-security.md) ตอนอธิบาย CSRF — แต่ **CORS ไม่ใช่เกราะกัน CSRF**
(หัวข้อ "CORS ≠ trustedOrigins" ท้ายไฟล์)

## TL;DR (อ่านทวนเร็ว)

- **origin = scheme + host + port** — ต่างแม้ส่วนเดียว = คนละ origin → `http://localhost:5173` vs `http://localhost:3000` คนละ origin (เครื่องเดียวกัน hostname เดียวกันก็ไม่ช่วย)
- **Same-Origin Policy (SOP)** = กฎ default ของ **browser**: JS อ่าน response ได้แค่จาก origin เดียวกับหน้าเว็บที่มันรันอยู่
- **CORS = Cross-Origin Resource _Sharing_** = กลไก **ปลดล็อค** SOP **ไม่ใช่**กลไกบล็อค — server แปะ header `Access-Control-Allow-Origin` บอกว่า origin ไหนอ่าน response ได้
- **คนบล็อคคือ browser ไม่ใช่ server** และบล็อค **"การอ่าน response"** ไม่ใช่ "การส่ง request"
- **request ไปถึง server และทำงานเสร็จจริงเสมอ** — browser ไปสกัดตอน response กลับมาถึงมือ
- `cors()` middleware **ไม่บล็อคใคร** — หน้าที่มันคือ **แปะ header ลง response** เท่านั้น
- **curl / Postman ไม่มี CORS** เพราะ CORS เป็นกฎที่ browser บังคับกับตัวเอง
- **CORS error ไม่มี status/body ให้ดู** เพราะ JS ไม่เคยเห็น response → ไป debug ที่แท็บ **Network** หรือยิง `curl`

---

## 1. origin คืออะไร

`scheme + host + port` ต้องตรงกันทั้งสามส่วน

| | scheme | host | port |
|---|---|---|---|
| client | `http` | `localhost` | **5173** |
| server | `http` | `localhost` | **3000** |

port ต่าง → **คนละ origin** → นี่คือเหตุผลเดียวที่โปรเจกต์นี้ต้องยุ่งกับ CORS ทั้งที่รันบนเครื่องตัวเอง

---

## 2. SOP คือตัวที่ปิด — CORS คือตัวที่เปิด

- **SOP** = กฎติดตัว browser, **ปิดไว้ก่อนโดย default**: JS บนหน้า origin A อ่าน response ที่มาจาก origin B ไม่ได้
  - ทิศทางเดียว — ไม่ใช่ "JS สองตัวอ่านกันและกัน" ฝั่ง B เป็นแค่ server ที่ตอบ ไม่มี JS อะไรมาเกี่ยว
- **CORS** = ชุด header ที่ให้ server **ประกาศ**ว่ายอมให้ origin ไหนอ่าน → เป็นการ**เปิดประตูที่ SOP ปิด**

> คำว่า **Sharing** ในชื่อเต็มบอกอยู่แล้วว่ามันคือกลไก *แบ่งให้* ไม่ใช่กลไก *กัน*
> ถ้าโลกนี้ไม่มี CORS → cross-origin จะยิ่งทำอะไรไม่ได้ ไม่ใช่ทำได้อิสระ

---

## 3. Flow จริง (ตอน login ในโปรเจกต์เรา)

```
1. JS ที่ :5173 ยิง request ไป :3000   → browser แนบ  Origin: http://localhost:5173  ให้เอง
2. server ทำงานปกติ (เช็ค password)    → ตอบ 200 + header  Access-Control-Allow-Origin: http://localhost:5173
3. response กลับมาถึง BROWSER
4. browser เทียบ header กับ origin ของหน้าตัวเอง → ตรง → ส่ง response ต่อให้ JS
```

**ถ้าขั้น 2 ไม่มี header นั้น** → ขั้น 4 browser **ทิ้ง response** แล้ว `fetch()` reject เป็น error
(server ยัง**ตรวจ password เสร็จเรียบร้อยไปแล้ว** — response สมบูรณ์ทุกอย่าง ขาดแค่ "ใบอนุญาต" ใบเดียว)

**ใครเทียบ:** browser เทียบกับ **origin ของหน้าเว็บที่ JS กำลังรันอยู่** (มันรู้ค่านี้ด้วยตัวเอง)
ส่วน `Origin` ใน request คือค่าเดียวกันนั้นที่ browser แจ้งให้ server รู้ เพื่อให้ server ตัดสินใจได้ว่าจะให้ใบอนุญาตไหม
— JS **ปลอม `Origin` ไม่ได้** (เป็น forbidden header) นี่คือสิ่งที่ทำให้ทั้งระบบเชื่อถือได้

---

## 4. จุดสับสนที่สุด — server ไม่ได้บล็อคอะไรเลย

| | เข้าใจผิดบ่อย | ของจริง |
|---|---|---|
| ใครบล็อค | server | **browser** |
| บล็อคอะไร | การส่ง request | **การอ่าน response** |
| server ทำงานไหม | ไม่ | **ทำ — เสร็จหมดแล้ว** |

**ผลที่ตามมา:** ถ้า request เป็น `DELETE` → **ลบจริง** แล้ว browser ค่อยบล็อคไม่ให้อ่านผลลัพธ์
→ **CORS ปกป้อง "ข้อมูลของ user จากเว็บอื่น" ไม่ได้ปกป้อง server ของเรา**

**พิสูจน์แล้วในโปรเจกต์นี้** (ยิง `curl` ใส่ `Origin` ปลอมไปที่ server ตัวจริง):

- ยิง `/health` ด้วย `Origin: http://evil.example` → ได้ **200 + body จริงครบ** (`{"status":"ok",...}`)
  server ไม่บล็อคเลย ถ้าเป็น browser จริงจะโดนทิ้งตอนขั้น 4
- ยิง login ด้วย **`curl` เฉยๆ (ไม่มี `Origin`)** → **200** ปกติ เพราะ curl ไม่ใช่ browser จึงไม่มีใครบังคับ CORS
- เพราะเราตั้ง `origin` เป็น **string คงที่** middleware จึงประกาศค่าเดิมตลอด **ไม่เอา `Origin` ของ request มาเทียบด้วยซ้ำ** → ยืนยันว่า **การเทียบเกิดที่ browser ทั้งหมด**

---

## 5. โค้ดของเรา

`server/src/index.ts` — ต้อง `app.use()` **ก่อน** route handlers:

```ts
app.use(cors({ origin: "http://localhost:5173", credentials: true }));
```

- `origin` → ค่าที่จะใส่ใน header `Access-Control-Allow-Origin`
- `credentials: true` → เพิ่ม header `Access-Control-Allow-Credentials: true`
  cookie ถูก SOP กันแน่นกว่าปกติ ต้องอนุญาต **2 ฝั่ง**: client ขอส่ง cookie (better-auth client ทำให้เองเมื่อตั้ง `baseURL` ใน `client/src/lib/auth-client.ts`) + server ตอบ header นี้
  **ขาดข้างใดข้างหนึ่ง = session cookie ไม่ถูกส่ง/ไม่ถูกเก็บ → login แล้วเหมือนไม่ login**
- **ห้ามใช้ `origin: "*"` ร่วมกับ credentials** — browser ปฏิเสธเด็ดขาด ต้องระบุ origin เจาะจง

**Preflight (ทำไมต้องมาก่อน route):** request ที่ไม่ธรรมดา (เช่น `Content-Type: application/json`)
browser จะส่ง **`OPTIONS` ไปถามก่อน** ว่า method/header นี้ยิงได้ไหม → ผ่านแล้วจึงยิงของจริง
ถ้า `cors()` อยู่หลัง route ตัว `OPTIONS` จะไปไม่ถึง → preflight fail → **request จริงไม่ถูกส่งเลย**

---

## CORS ≠ trustedOrigins (สองประตู คนละบาน)

`server/src/auth.ts` มี `trustedOrigins: ["http://localhost:5173"]` ซึ่ง **ไม่ใช่ CORS**

| | CORS | `trustedOrigins` (better-auth) |
|---|---|---|
| ใครบังคับใช้ | **browser** | **server** |
| ป้องกันอะไร | เว็บอื่น **อ่าน** response ไม่ได้ | เว็บอื่น **สั่งเปลี่ยนสถานะ** ไม่ได้ (CSRF) |
| `curl` ทะลุได้ไหม | **ได้** — ไม่สนใจเลย | **ไม่ได้** → `403 {"code":"INVALID_ORIGIN"}` |

พิสูจน์แล้ว: POST login ด้วย `Origin: http://evil.example` → **403 INVALID_ORIGIN**
ตัวที่บล็อคคือ **trustedOrigins** ไม่ใช่ CORS (CORS ปล่อยผ่านสบายๆ ตามข้อ 4)

---

## หลักจำ

**CORS เป็นกฎที่ browser บังคับกับตัวเอง** — server แค่ *ประกาศ* ว่าใครอ่านได้ ไม่ได้เป็นคนบล็อค
อะไรที่ browser บังคับใช้ = **ทะลุได้ด้วยเครื่องมือที่ไม่ใช่ browser** → ความปลอดภัยจริงต้องอยู่ที่ server เสมอ

> แนวคิดเดียวกันกับ `ProtectedRoute role="admin"` ฝั่ง client:
> เป็น UX / กฎที่ browser บังคับ → ทะลุได้ ของจริงต้องมี guard ฝั่ง server
> (ดู [Auth — roles & seeding](auth-roles-and-seeding.md))
