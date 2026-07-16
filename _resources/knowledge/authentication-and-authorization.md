# Authentication & Authorization

คำว่า "Auth" จริงๆ รวม **3 เรื่องที่แยกกัน**:

```
Auth
├── Authentication (AuthN)  → "คุณเป็นใคร?"        [ยืนยันตัวตน]
├── Session management      → "จำว่า login แล้ว"   [หลัง login]
└── Authorization (AuthZ)   → "คุณทำอะไรได้?"       [สิทธิ์]
```

---

## 1. Authentication (AuthN) — "คุณเป็นใคร?"

พิสูจน์ตัวตน เกิด**ครั้งเดียวตอน login** วิธีที่นิยม:

| วิธี | คือ |
|---|---|
| **Email + Password** | กรอกอีเมล/รหัส — พื้นฐานสุด |
| **OAuth / Social login** | "Login with Google" — สะดวก ไม่ต้องจำรหัส |
| **Magic link** | ส่งลิงก์ login ไปอีเมล |
| **Passkey / WebAuthn** | ลายนิ้วมือ/Face ID — ใหม่สุด ปลอดภัยสุด |

## 2. Session management — "จำว่า login แล้ว"

หลัง login แล้ว ระบบต้องจำ ไม่งั้นต้อง login ใหม่ทุกหน้า เกิด**ทุก request** มี 2 แบบ:

| แบบ | คือ | จุดเด่น/ด้อย |
|---|---|---|
| **Session + Cookie** | server เก็บ session ใน **DB** ส่ง cookie ให้ browser | ✅ เตะ user ออกได้ทันที ❌ ต้องเก็บ state |
| **JWT (token)** | token ฝังข้อมูลครบ + ลายเซ็นกันปลอม ไม่เก็บ state | ✅ scale ง่าย ❌ เพิกถอนก่อนหมดอายุยาก |

**flow ตัวอย่าง (password + DB session):**
```
1. [AuthN]   กรอก email+password → server เช็คกับ DB → ตรง ✅
2. [Session] server สร้าง session ใน DB + ส่ง cookie กลับ
3. [Session] เปิดหน้าใหม่ → browser แนบ cookie → server เอาไปเทียบ DB → ให้เข้า ✅
```

## 3. Authorization (AuthZ) — "คุณทำอะไรได้?"

คนละเรื่องกับ "เป็นใคร" — เช็ค**สิทธิ์** มักทำแบบ role-based
> ตัวอย่างเรา: admin สร้าง agent ได้ / agent สร้างไม่ได้

---

## เขียนเอง vs ใช้สำเร็จรูป

| ทางเลือก | ตัวอย่าง |
|---|---|
| เขียนเอง | Express + `express-session` + bcrypt |
| ใช้ library | Auth.js, Lucia |
| managed service | Clerk, Supabase Auth, Auth0 |

## ในโปรเจกต์เรา

**email+password (AuthN) + database sessions (Session) + role admin/agent (AuthZ)**
ไม่มี social login เพราะเป็น internal tool ที่ **admin เป็นคนออกบัญชี agent ให้**
(ผู้ใช้สมัครเองไม่ได้ → ข้อดีของ social login หายไป)
