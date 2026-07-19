# Auth — lock down sign-up, role enum & admin seed

ชั้นถัดจาก [Better Auth setup](better-auth-setup.md) — ทำให้เป็น internal portal:
ปิด self-registration, เพิ่ม role, และ seed admin คนแรก.

## TL;DR (อ่านทวนเร็ว)

- **ปิด sign-up:** `emailAndPassword: { enabled: true, disableSignUp: true }` → endpoint sign-up ตอบ 400 (`EMAIL_PASSWORD_SIGN_UP_DISABLED`); **sign-in ยังเปิด**
- **role enum:** ประกาศ **2 ชั้น** — (1) `schema.prisma`: `enum Role { agent admin }` + `role Role @default(agent)` (Prisma enum จริง, ไม่ใช่ TS enum ที่ `erasableSyntaxOnly` ห้าม) (2) `auth.ts`: `additionalFields.role` เพื่อให้ BA validate + ใส่ role ใน session
- **`input: false`** = user ตั้ง role ตัวเองไม่ได้ → กัน **privilege escalation** (ยัด `role:"admin"` ตอน sign-up)
- **seed admin:** อ่าน cred จาก env, idempotent, hash ด้วย `auth.$context.password.hash`, เขียน **user + account** ตรง (เลี่ยง `signUpEmail` ที่โดนปิด)
- **gotchas:** อย่า re-run `better-auth generate` (เขียนทับ enum เป็น string) · schema → 2 ทาง (migrate=DB, generate=client) → เจอ "Unknown argument" ให้ `db:generate`

---

## 1. Lock down sign-up

[`../../server/src/auth.ts`](../../server/src/auth.ts):
```ts
emailAndPassword: { enabled: true, disableSignUp: true },
```
- `disableSignUp: true` → `POST /api/auth/sign-up/email` โยน 400 `EMAIL_PASSWORD_SIGN_UP_DISABLED`
- **sign-in ยังเปิด** (คนละสวิตช์) — แค่ปิด "การสมัครเอง"
- **why:** internal portal — บัญชีสร้างโดย seed / admin เท่านั้น

---

## 2. Role enum (agent | admin) — ประกาศ 2 ชั้น

**ชั้น DB** — [`../../server/prisma/schema.prisma`](../../server/prisma/schema.prisma):
```prisma
enum Role { agent admin }
// ใน model User:
role Role @default(agent)
```
- **Prisma enum** → enum type จริงใน Postgres (ไม่ใช่ TS `enum` ที่ `erasableSyntaxOnly` ห้าม)
- `@default(agent)` → user ใหม่ได้ agent เว้นแต่กำหนดเอง

**ชั้น Better Auth** — [`../../server/src/auth.ts`](../../server/src/auth.ts):
```ts
user: {
  additionalFields: {
    role: { type: ["agent","admin"], required: false, defaultValue: "agent", input: false },
  },
},
```
ทำ 3 อย่าง: (1) **validate** ค่า ∈ agent/admin · (2) **ใส่ role ใน object user/session** ที่ `getSession` คืน (เห็นใน `/api/me`) · (3) **`input: false`**

**ทำไม 2 ชั้น:** schema = "เก็บที่ไหน" (คอลัมน์ DB) · auth.ts = "BA รู้จักไหม" (validate + ใส่ใน session)
→ ถ้าใส่แค่ schema ไม่ใส่ auth.ts: คอลัมน์มีใน DB **แต่ role จะไม่โผล่ใน session** (BA คืนเฉพาะ field ที่รู้จัก)

**ทำไม BA ต้องประกาศ:** Better Auth เป็นคนละชั้นกับ Prisma — มันไม่อ่าน schema.prisma มันมี **default fields ของ user ที่รู้จักเอง** = `id, name, email, emailVerified, image, createdAt, updatedAt` เท่านั้น คอลัมน์อื่นที่เราเพิ่ม (เช่น `role`) มันมองข้าม จนกว่าจะประกาศผ่าน `additionalFields`. ค่ายังอยู่ครบใน DB — แค่ BA ไม่หยิบมาใส่ object ที่คืนให้โค้ด. (รูปร่าง object `{ session, user }` ดู [Better Auth setup](better-auth-setup.md))

**config `user` block ≠ runtime `user` object** (ชื่อซ้ำแต่คนละอย่าง):

| | `user` ใน auth.ts (บรรทัดนี้) | `user` ใน getSession result |
|---|---|---|
| เป็นอะไร | **config / พิมพ์เขียว** | **ข้อมูลจริง (runtime)** |
| หน้าที่ | บอก BA ว่า user model มี field อะไร/default/input | ค่าจริงของ user ที่ login อยู่ |

config `user` block **shape** runtime object (เพิ่ม role เข้าไป) แต่ไม่ใช่ค่าของ object เอง

**`input: false` = กัน privilege escalation:** ถ้าไม่ตั้ง (default true) user ยัด `"role":"admin"` มาใน body ตอน sign-up/sign-in แล้ว**ตั้งตัวเองเป็น admin** ได้ → ช่องโหว่ร้ายแรง

migration `add_user_role` = เอา schema ไปสร้าง enum type + คอลัมน์จริง

---

## 3. Seed admin คนแรก

[`../../server/prisma/seed.ts`](../../server/prisma/seed.ts) (รันด้วย `npm run db:seed`):
```ts
const email = process.env.ADMIN_EMAIL;         // จาก env ไม่ hardcode
const password = process.env.ADMIN_PASSWORD;
// guard ถ้า env ไม่มี

const existing = await prisma.user.findUnique({ where: { email } });
if (existing) { /* skip */ }                   // idempotent

const ctx = await auth.$context;               // context ของ BA นอก HTTP
const hashedPassword = await ctx.password.hash(password);  // hasher ตัวเดียวกับ sign-in verify

const userId = crypto.randomUUID();            // User.id ไม่มี @default → สร้างเอง
await prisma.user.create({ data: { id: userId, name: "Admin", email, emailVerified: true, role: "admin" } });
await prisma.account.create({ data: { id: crypto.randomUUID(), userId, accountId: userId, providerId: "credential", password: hashedPassword } });
```
- **cred จาก env** (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) — commit code ได้ปลอดภัย
- **idempotent** — เช็ก email ซ้ำ → skip → รันซ้ำได้
- **เขียน user + account คู่กัน** — password hash อยู่ที่ `account` (`providerId="credential"`) ไม่ใช่ `user` → สร้างแค่ user แล้ว sign-in ไม่ได้ (ไม่มี hash ให้ verify)
- **ทำไมไม่ใช้ `auth.api.signUpEmail`** — เพราะปิด sign-up แล้ว มันโดนบล็อก → เขียน row ตรงแทน โดยเลียนแบบสิ่งที่ sign-up ทำ
- **`ctx.password.hash`** — ต้องใช้ hasher ของ BA เอง ตอน sign-in `ctx.password.verify` ถึงเทียบผ่าน

→ role เก็บใน DB + อยู่ใน session แล้ว = พร้อมทำ **AuthZ** (guard เฉพาะ admin อ่าน `session.user.role`) ในเฟสถัดไป

---

## 4. Gotchas (จำไว้กันลืม)

- **อย่า re-run `better-auth generate`** — CLI อ่าน `additionalFields` แล้วเขียน `role` เป็น **String** ทับ Prisma enum ที่เขียนมือ → enum หาย (มี comment เตือนใน schema แล้ว) → role เราดูแลด้วยมือ
- **schema → 2 ทาง:** `prisma migrate` เปลี่ยน **DB จริง**; `prisma generate` สร้าง **client TS** — คนละคำสั่ง
  - `migrate dev` *ควร* generate ให้อัตโนมัติ แต่บางที (custom output path) ไม่ทำ → client ไม่รู้จัก field ใหม่ → error **"Unknown argument X"**
  - แก้: `npm run db:generate` แล้วลองใหม่
