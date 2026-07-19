# Better Auth setup — code walkthrough

โครงโค้ด auth ที่ set up ใน server (email/password + database session).
ต่อยอดจาก [Authentication, Session & Authorization](authentication-and-authorization.md)
และ [Cookie security](cookie-security.md). อยากรู้ว่า *ทำไม*เลือก Better Auth → [Better Auth คืออะไร & ทำไมต้องใช้](why-better-auth.md).
ชั้นถัดไป (ปิด sign-up + role + seed) → [Auth — lock down sign-up, role enum & admin seed](auth-roles-and-seeding.md).

## TL;DR (อ่านทวนเร็ว)

- **3 ไฟล์:** `auth.ts` (สมอง) → `index.ts` (ต่อสายเข้า Express) → `require-auth.ts` (ยามเช็ก session) — หมุนรอบ `auth` object ตัวเดียว
- **`auth.ts`:** `betterAuth({ database: prismaAdapter(prisma, {provider:"postgresql"}), emailAndPassword:{enabled:true} })` — ส่ง prisma เดิมจาก db.ts (ไม่เปิด connection ซ้ำ); secret/URL อ่านจาก env; DB session = default
- **`index.ts`:** `app.all("/api/auth/*splat", toNodeHandler(auth))` ต้องอยู่ **เหนือ** `express.json()` — เพราะ body เป็น **stream อ่านได้ครั้งเดียว** ถ้า express.json อ่านก่อน Better Auth จะไม่เหลือ body → ค้าง
- **`require-auth.ts`:** middleware — `auth.api.getSession({ headers: fromNodeHeaders(req.headers) })` → ไม่มี session → 401; มี → แปะ `res.locals.session` + `next()`
- **framework-agnostic:** `toNodeHandler` / `fromNodeHeaders` = adapter บางๆ ที่รอยต่อ Express (Node style) ↔ Better Auth (Web standard)
- **4 model (ฝั่ง data):** `User` (ตัวตน) · `Account` (วิธี login + password hash) · `Session` (server-side session, getSession อ่านตัวนี้) · `Verification`

---

## ภาพรวม 3 layer

```
auth.ts          → สมอง: รู้วิธี sign-in / สร้าง+อ่าน session (เก็บใน DB)
index.ts (1)     → เปิด endpoint /api/auth/*  → ออก session cookie ตอน login
require-auth.ts  → อ่าน session cookie → ค้น DB → บล็อก/ปล่อย route อื่น
```

---

## Layer 1 — `auth.ts` (สมองกลาง)

ไฟล์: [`../../server/src/auth.ts`](../../server/src/auth.ts)

```ts
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true },
});
```

- `betterAuth({...})` คืน object `auth` = ศูนย์รวม logic auth ทั้งหมด; `export` เพราะไฟล์อื่น import ไปใช้
- `prismaAdapter(prisma, {provider})` = บอกว่าเก็บ/อ่านข้อมูลที่ไหน + คุย DB ยังไง; ส่ง **`prisma` เดิมจาก db.ts** → ใช้ connection pool เดียว ไม่เปิดซ้ำ
- `emailAndPassword: { enabled: true }` = สวิตช์เปิด AuthN แบบ email+password
- **สิ่งที่ไม่มี = default:** ไม่มี session config → server-side (DB) session; ไม่มี secret/baseURL → อ่านจาก env `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL`

---

## Layer 2 — `index.ts` (ต่อสายเข้า Express)

ไฟล์: [`../../server/src/index.ts`](../../server/src/index.ts)

```ts
app.all("/api/auth/*splat", toNodeHandler(auth));   // (1) auth endpoints
app.use(express.json());                             // (2) parse JSON — หลัง (1)
app.get("/api/me", requireAuth, (_req, res) => res.json(res.locals.session)); // (3)
```

**(1) mount handler**
- `toNodeHandler(auth)` = แปลง `auth` (framework-agnostic) → handler ที่ Express เข้าใจ
- `app.all` = ทุก method; `/api/auth/*splat` = catch-all ทุก path ใต้ `/api/auth/` (sign-up/email, sign-in/email, get-session, ...) → `*splat` คือ wildcard syntax ของ **Express 5**

**(2) `express.json()` อยู่หลัง (1) โดยตั้งใจ — กลไก "กิน body"**
- request **body คือ stream** (ไหลมาทีละ chunk) และ **อ่านได้ครั้งเดียว** — อ่านจบแล้วระบายหมด ไม่มีกรอกลับ
- `express.json()` ตอนรัน = อ่าน body stream จนจบ + parse ใส่ `req.body`
- Better Auth handler อยากอ่าน **raw body เอง**
- ถ้า `express.json()` (ซึ่ง `app.use` = รันทุก request) อยู่**บน** → มันดูด body ก่อน → Better Auth ไม่เหลือ body → **request ค้าง (pending)**
- วาง handler ไว้บน → auth request ถูก handle+จบที่ (1) ไม่ไหลลงไปถึง express.json(); ส่วน route อื่นไม่ match `/api/auth/*` เลยไหลลงมา parse ปกติ

**(3) protected route**
- `requireAuth` เป็น middleware คั่นก่อน handler; ผ่าน (`next()`) ถึงเข้า handler, ไม่ผ่าน (401) handler ไม่ถูกเรียก

---

## Layer 3 — `require-auth.ts` (ยาม)

ไฟล์: [`../../server/src/require-auth.ts`](../../server/src/require-auth.ts)

```ts
export async function requireAuth(req, res, next) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) return res.status(401).json({ error: "unauthenticated" });
  res.locals.session = session;
  next();
}
```

- Express middleware `(req, res, next)` รันก่อน route handler
- `auth.api.getSession(...)` = อ่าน session token จาก **cookie ใน header** → **ค้น DB** → คืน `{session, user}` หรือ `null` (`await` เพราะมี DB I/O)
- อ่านจาก `headers` ไม่ใช่ `body` เพราะ session token อยู่ใน **Cookie header**
- `!session` → **401** + `return` (ไม่ `next()`); มี → แปะ `res.locals.session` แล้ว `next()`
- ใช้ `res.locals` (พื้นที่ต่อ 1 request) เลี่ยงการ augment type ของ `Request`
- **ทำไม ban ได้ทันที:** getSession ค้น DB จริงทุกครั้ง → admin ลบ session row = request ถัดไปค้นไม่เจอ = 401 (ข้อได้เปรียบของ server-side session เหนือ JWT)

---

## `getSession()` คืนอะไร — object `{ session, user }`

`getSession` (ใน require-auth / `/api/me`) คืน object **2 ส่วน** — เอา row จาก 2 ตารางมาประกอบให้โค้ดใช้ที่เดียว:
```json
{
  "session": { "id", "token", "expiresAt", "userId", "ipAddress", "userAgent" },
  "user":    { "id", "name", "email", "emailVerified", "image", "role", "createdAt", "updatedAt" }
}
```
| ส่วน | คือ | มาจากตาราง |
|---|---|---|
| `session` | ข้อมูลการ login ครั้งนี้ (token, `expiresAt`) | `session` |
| `user` | ข้อมูลคนที่ login (email, `role`, ...) | `user` |

- เป็น **ตัวแทน in-memory ของ row ใน DB** ที่ BA หยิบมาให้โค้ด — โค้ดเราจับก้อนนี้ ไม่ใช่ตาราง
- require-auth ทำ `res.locals.session = <ก้อนนี้>` → `/api/me` คืนมันออกไป → เราเห็น `user.role`
- **BA ใส่เฉพาะ field ที่รู้จัก** ใน `user`: default = `id, name, email, emailVerified, image, createdAt, updatedAt`; field เสริม (เช่น `role`) ต้องประกาศผ่าน `additionalFields` (ดู [Auth roles & seeding](auth-roles-and-seeding.md))

---

## Database models (ฝั่ง data)

CLI generate เพิ่ม 4 model ต่อท้าย `schema.prisma` (generator/datasource/Ticket เดิมไม่แตะ)
แล้ว migration สร้างเป็นตารางจริง — ไฟล์ [`../../server/prisma/schema.prisma`](../../server/prisma/schema.prisma)

- **`User`** — ตัวตน (identity): `name`, `email`, `emailVerified`. **ไม่มี field password** (อยู่ที่ Account) · `@@unique([email])`
- **`Account`** — วิธี login ของ user (1 แถว = 1 วิธี): `providerId` (`"credential"` = email/pw, `"google"` = social), **`password` = hash เก็บที่นี่**, + OAuth tokens (accessToken/refreshToken). 1 User → หลาย Account ได้ → **เหตุผลที่แยก User (identity) ออกจาก Account (credential)**
- **`Session`** — server-side session (ตัวจริงของ DB session): `token` (ค่าใน cookie, `@@unique`), `expiresAt` (หมดอายุ), `userId`. `getSession` มาอ่านตารางนี้ · **ban = ลบแถวในนี้ → 401**
- **`Verification`** — token ชั่วคราว (verify email / reset password); โปรเจกต์เราปิด email verification → ว่าง

**เกร็ด:** ทุก model `@@map` ชื่อตารางตัวเล็ก (user/session/account/verification) · `onDelete: Cascade` บน `Session`/`Account.userId` → ลบ User = session+account ถูกลบตาม (กัน orphan) · migration อยู่ที่ `server/prisma/migrations/`, `_prisma_migrations` = ตารางที่ Prisma จำว่า apply migration ไหนแล้ว

---

## Concept ที่ใช้ซ้ำ

- **request body = stream อ่านได้ครั้งเดียว** → ใครอ่านก่อนชนะ → ลำดับ middleware สำคัญ
- **Node headers vs Web `Headers`:** ข้อมูลเดียวกันแต่คนละรูปทรง object — Node = plain object (`req.headers["cookie"]`); Web standard = class instance มี method (`headers.get("cookie")`, ใช้ใน fetch/Request/Response)
- **framework-agnostic → ต้องมี adapter ที่รอยต่อ:** `toNodeHandler` (Express req/res → auth), `fromNodeHeaders` (Node headers → Web Headers) — Better Auth core สร้างบนมาตรฐาน Web เพื่อรันได้ทุก runtime, Express เป็น Node style เลยต้องแปลง
