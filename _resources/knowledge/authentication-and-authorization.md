# Authentication, Session & Authorization

## TL;DR (อ่านทวนเร็ว)

- **3 ด่านตามลำดับ:** ① AuthN "คุณคือใคร?" (ตอน login เทียบ password) → ② Session "จำว่า login แล้ว" (ทุก request อ่าน cookie) → ③ AuthZ "role มีสิทธิ์ไหม?" ด่านหลังกินผลด่านหน้า → สลับไม่ได้
- **ทำไมต้องมี Session:** HTTP เป็น stateless (ไม่จำ request ก่อนหน้า) ถ้าไม่มี session ต้อง login ใหม่ทุกคลิก
- **401 vs 403:** 401 = "ไม่รู้ว่าคุณเป็นใคร" (ยังไม่ login/session หมด) · 403 = "รู้ว่าใคร แต่ role ไม่พอ" — **เจอ 403 = ผ่าน AuthN มาแล้วเสมอ** · ตกด่านไหนก่อนได้รหัสด่านนั้น
- **Session strategy:** **A) Server-side** — ความจริงที่ server, cookie มีแค่ id, ค้น DB ทุก request → ยกเลิกทันทีได้/เห็นข้อมูลล่าสุด · **B) JWT** — ความจริงในตัว token, ตรวจ signature ไม่ค้น DB → เร็ว/scale ง่าย แต่ **ยกเลิกทันทีไม่ได้ + ข้อมูล stale** (เห็นแค่ snapshot ตอน login)
- **โปรเจกต์นี้:** server เดียว + ต้อง ban/ถอนสิทธิ์ทันที → **server-side session** (default ของ better-auth)

---

คำว่า "Auth" รวม **3 เรื่องที่แยกกัน** และเป็น **3 ด่านที่ server ทำตามลำดับ**
เมื่อมี request เข้ามา:

```
request เข้ามา
  ↓
① Authentication (AuthN) — "คนนี้คือใคร ตัวจริงไหม?"   [ยืนยันตัวตน — ตอน login]
  ↓ ผ่าน → สร้าง session
② Session management     — "จำได้ว่าใคร login แล้ว"      [ทุก request หลัง login]
  ↓ session ยังดี
③ Authorization (AuthZ)  — "role นี้มีสิทธิ์ทำ action นี้ไหม?"  [ตรวจสิทธิ์]
  ↓ ผ่าน
ทำงานให้
```

ด่านหลัง **กินผลลัพธ์ของด่านหน้า** → สลับลำดับไม่ได้ (AuthZ ต้องรู้ identity+role จาก AuthN ก่อน)

---

## 1. Authentication (AuthN) — พิสูจน์ว่าเป็นใคร

ตอบคำถาม *who are you?* เกิดตอน login สิ่งที่ server ทำ:

1. รับ email + password
2. หา user จาก email ใน database
3. เทียบ password ที่กรอก กับ **hash** ที่เก็บไว้ (ไม่เก็บ password ตรงๆ)
4. ตรงกัน = มั่นใจว่าเป็น user คนนี้จริง

ขอบเขตจบแค่ "รู้ว่าเป็นใคร" — ยังไม่เกี่ยวว่าทำอะไรได้

---

## 2. Session management — จำว่าใคร login แล้ว

**ปัญหา:** HTTP เป็น **stateless** — แต่ละ request เป็นอิสระ server ไม่จำ request ก่อนหน้า
ถ้าไม่มี session → ต้อง login ใหม่ทุก request

**กลไก:**
1. หลัง AuthN ผ่าน → server สร้าง session ผูกกับ user
2. ส่งตัวระบุ session (id หรือ token) กลับไปเก็บใน **cookie**
3. request ต่อมา browser แนบ cookie อัตโนมัติ → server รู้ว่าเป็นใคร โดยไม่ต้องถาม password ซ้ำ

วงจรชีวิตที่ต้อง manage: **สร้าง** (login) · **ตรวจ** (ทุก request) · **หมดอายุ** (ครบเวลา) · **ทำลาย** (logout/ban)

> ถ้าไม่มี session แต่ยังมี AuthN/AuthZ ครบ → ใช้งานได้แต่ต้องกรอก password ใหม่ทุกคลิก (เพราะ stateless)

---

## 3. Authorization (AuthZ) — ตรวจว่ามีสิทธิ์ทำไหม

ตอบคำถาม *what are you allowed to do?* เกิด**หลัง**รู้ว่าเป็นใคร ในแอปเรา = เรื่อง **roles**:

| Role | ทำอะไรได้ |
|---|---|
| `agent` | ทำ ticket (ดู/ตอบ/ปิด) |
| `admin` | ทุกอย่างที่ agent ทำได้ **+ จัดการ user/role** |

ตัวอย่าง: request "ลบ user" → server เช็ค role จาก session → `admin` อนุญาต, `agent` ปฏิเสธ (403)

---

## 401 vs 403 — จุดที่สับสนบ่อยสุด

| รหัส | ความหมายจริง | ตกด่านไหน |
|---|---|---|
| **401** Unauthorized | *unauthenticated* — "ยังไม่รู้ว่าคุณเป็นใคร" | ① หรือ ② (ไม่ได้ login / session หมดอายุ) |
| **403** Forbidden | "รู้ว่าคุณเป็นใคร **แต่** role ไม่พอ" | ③ (login แล้ว แต่สิทธิ์ไม่ถึง) |

- ชื่อ 401 เขียนว่า "Unauthorized" แต่ความหมายจริงคือ **unauthenticated** — ตรงนี้หลอกคนเยอะ
- **เจอ 403 = ผ่าน AuthN มาแล้วเสมอ** (ต้องรู้ว่าเป็นใครก่อน ถึงบอกได้ว่าไม่มีสิทธิ์)
- **ตกด่านไหนก่อน ได้รหัสของด่านนั้น** — เช่น session หมดอายุแล้วกดดู ticket ตัวเอง
  → ได้ **401** (ตกด่านรู้ตัวตนก่อน) ไม่ใช่ 403 ถึงแม้ action นั้นปกติจะมีสิทธิ์ทำ

---

## Session strategy — 2 กลยุทธ์

คำถามที่ทั้งคู่ต้องตอบ: request ที่ 2,3,4... **server รู้ได้ยังไงว่า cookie/token ของจริง และเป็นของใคร?**
เส้นแบ่งอยู่ที่ **"server เก็บความจริงไว้ที่ไหน"**

### A. Server-side session (stateful)
- ความจริงเก็บที่ **server** (database / Redis / memory): `session_id → { userId, role, expiresAt }`
- cookie เก็บแค่ `session_id` (ค่าสุ่ม ไม่มีความหมายในตัว)
- ทุก request → server เอา id ไป **ค้นใน store ตัวเอง**

### B. Token-based / JWT (stateless)
- ความจริงเก็บ **ในตัว token เอง**: `{ userId, role, exp }`
- server **เซ็น signature** ด้วย secret key แล้วส่ง token ทั้งก้อนให้ client เก็บ; server ไม่เก็บอะไร
- ทุก request → server **ตรวจ signature** ด้วย secret key พอ (ถ้าใครแก้ role signature พังทันที) → ไม่ต้องค้น DB

### เปรียบเทียบตรงจุดตัดสินใจ

| ประเด็น | A: Server-side | B: JWT |
|---|---|---|
| ข้อมูล user อยู่ที่ไหน | ที่ server (cookie มีแค่ id) | ในตัว token |
| ค้น DB ทุก request | ต้อง | ไม่ต้อง (เร็วกว่า, DB ไม่โดนยิง) |
| **ยกเลิกทันที (logout/ban)** | **ง่าย** — ลบ record จบ | **ยาก** — token ยัง valid จนหมดอายุ |
| ขยายหลาย server | ต้องมี store กลาง (Redis) | ง่าย — ทุก server ใช้ secret เดียวกัน |

### Trade-off จริงของ JWT (สองด้านที่มองข้ามบ่อย)
1. **Revocation** — server ไม่ได้ถือ state เลยถอนไม่ได้ ต่อให้ logout ฝั่ง server token ก้อนที่ client ยังใช้ได้จนหมดอายุ
2. **Stale data** — "ไม่ค้น DB" แปลว่า server เห็นแค่ **snapshot ตอน login** ไม่ใช่สถานะปัจจุบัน
   - เช่น admin เลื่อน/ถอด role กลางคัน → token เก่ายังพก role เดิมจนหมดอายุ
   - server-side session ค้น DB ทุกครั้ง → เห็นความจริง **ล่าสุด** เสมอ (แลกกับความช้า)

> JWT ในโลกจริงจึงมักใช้ **access token อายุสั้นมาก (เช่น 15 นาที) + refresh token อายุยาว**
> เพื่อลดช่องโหว่ revocation/stale

---

## การตัดสินใจของโปรเจกต์นี้

Internal help-desk: user เป็นพนักงานในองค์กร, **server เดียว**, และ **ban/ถอนสิทธิ์ทันทีสำคัญ**
(admin ต้องเตะ agent ออกได้เดี๋ยวนั้น) → เอียงไปทาง **server-side session** ชัดเจน
ซึ่งเป็น default ของ **better-auth** (แพ็กเกจ auth ที่วางแผนไว้) — ค่อยยืนยัน config ตอน implement จริง
