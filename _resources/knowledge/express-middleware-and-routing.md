# Express — Middleware & Routing

## TL;DR (อ่านทวนเร็ว)

- **Express = รายการที่เรียงลำดับ** ทุกบรรทัด `app.use/all/get` คือการต่อท้ายรายการ · request เดินไล่จากบนลงล่าง ตรงเงื่อนไขก็ทำงาน ไม่ตรงก็ข้าม
- แต่ละรายการถามแค่ 2 คำถาม: **method ตรงไหม** · **path ตรงไหม** — ทั้ง 3 ตัวต่างกันแค่ "เงื่อนไข 2 ข้อนี้เข้มแค่ไหน"
- **`use` = โซน · `all` = จุดเดียว** — `use("/shop")` จับ `/shop` และทุกอย่างข้างใต้ · `all("/shop")` จับ `/shop` เท่านั้น · เรื่อง method ทั้งคู่รับหมดเหมือนกัน
- **`use` ตัด prefix ทิ้งจาก `req.url`** (ย้ายไปไว้ `req.baseUrl`) ส่วน `all`/`get` ไม่ตัด
- **middleware กับ handler เป็นของชนิดเดียวกัน** `(req, res, next)` — ต่างกันที่พฤติกรรม: เรียก `next()` = ปล่อยผ่าน · ตอบ `res.json()` = จบ
- **ใส่ได้หลายตัวใน route เดียว** `app.get(path, fn1, fn2, handler)` วิ่งซ้าย→ขวา · `app.use` ก็ใส่ได้ แต่คลุมทั้งโซน
- **ลำดับมีผลจริง ไม่ใช่เรื่องความสวยงาม** — โปรเจกต์นี้มี 2 เคสที่พังถ้าสลับ (ดูหัวข้อ "ลำดับ")
- **`return res.status(...)` ต้องมี `return`** — response ถูกส่งไปแล้วตั้งแต่เรียก `res.json()` สิ่งที่ `return` ทำคือ**หยุดโค้ดไม่ให้ไหลต่อ**
- **Express 5 ไม่ต้อง `try/catch` ทุก route** — promise reject ถูกส่งต่อให้ error handler อัตโนมัติ · แต่ยังต้องเขียน error handler เอง **1 ตัว ท้ายไฟล์ 4 พารามิเตอร์เป๊ะๆ** ไม่งั้น default ของ Express จะส่ง stack ให้ client
- **เลือกยังไง:** แวะทำอะไรแล้วปล่อยผ่าน → `use` · ตอบที่ path เจาะจง → `get/post/put/delete` · ตอบแต่ไม่รู้ method → `all` (เจอน้อยมาก)

---

## 1. ภาพรวม — Express คือรายการที่เรียงลำดับ

ทุกครั้งที่เขียน `app.use(...)` / `app.all(...)` / `app.get(...)` = **ต่อท้ายรายการทีละบรรทัด**

พอมี request เข้ามา Express เดินไล่รายการ **จากบนลงล่าง** แต่ละรายการถาม 2 คำถาม:

1. **method** ตรงไหม (GET / POST / …)
2. **path** ตรงไหม

ตรงทั้งคู่ → ทำงาน · ไม่ตรง → ข้ามไปรายการถัดไป

```
request เข้ามา
  ↓
รายการ 1  →  ตรงไหม? ─ ไม่ ─┐
  ↓ ใช่ → ทำงาน → next()    │
รายการ 2  ←────────────────┘
  ↓
... จนกว่าจะมีใครตอบ response (จบ) หรือหมดรายการ (404)
```

---

## 2. ความต่างของ `use` / `all` / method routes

| | รับ method อะไร | จับ path ยังไง |
|---|---|---|
| `app.use(fn)` | **ทุก** method | **ขึ้นต้นด้วย** (prefix) — ไม่ระบุ path = ทุก path |
| `app.all(path, fn)` | **ทุก** method | ต้องตรงทั้งเส้น |
| `app.get(path, fn)` | **GET เท่านั้น** | ต้องตรงทั้งเส้น |

### ผลการทดลองจริง

mount ทั้งสองแบบไว้พร้อมกันแล้วยิงเข้าไป:

```js
app.use("/shop", fn)              // A
app.all("/shop/*splat", fn)       // B
```

| ยิงอะไร | A: `use` | B: `all` |
|---|---|---|
| `GET /shop` | ✅ | ❌ (pattern บังคับว่าต้องมี `/` + อะไรต่อท้าย) |
| `GET /shop/items/42` | ✅ | ✅ |
| `GET /shopping` | ❌ | ❌ |
| `POST /shop/items` | ✅ | ✅ |

**`/shopping` ไม่เข้าทั้งคู่** → `use` ไม่ได้จับแบบ "ขึ้นต้นด้วยตัวอักษรพวกนี้" มันต้อง**ขาดที่ `/`** พอดี
ไม่งั้น `/api` จะไปจับ `/apifoo` ด้วย

### สิ่งที่ handler มองเห็นก็ต่างกัน

ยิง `GET /shop/items/42`:

```
use → req.url = "/items/42"        req.baseUrl = "/shop"   req.params = {}
all → req.url = "/shop/items/42"   req.baseUrl = ""        req.params = { splat: ["items","42"] }
```

- **`use` ตัด prefix ทิ้งจาก `req.url`** แล้วเก็บไว้ที่ `req.baseUrl` → โค้ดข้างในจะ**ไม่รู้ว่าตัวเองถูกแขวนไว้ที่ไหน**
  เป็นข้อดี: เขียน router ครั้งเดียว เอาไปแขวนที่ `/shop` หรือ `/store` ก็ได้ ไม่ต้องแก้ข้างใน
- **`all` ให้ `req.params`** ใช้ต่อได้ · `use` ให้ `{}`

> **Express 5:** wildcard ต้องมีชื่อ (`*splat`) ต่างจาก Express 4 ที่เขียน `*` เฉยๆ ได้

---

## 3. middleware กับ handler — เป็นของชนิดเดียวกัน

หน้าตาเหมือนกันเป๊ะ `(req, res, next)` ต่างกันแค่ **พฤติกรรม**:

| ทำอะไร | เรียกว่า |
|---|---|
| เรียก `next()` = ปล่อยผ่าน ไปรายการถัดไป | middleware |
| ตอบ `res.json(...)` = จบ ไม่เดินต่อ | handler |

`requireAuth` / `requireAdmin` ทำได้ทั้งสองอย่าง แล้วแต่ผลการตรวจ — ผ่านก็ `next()`, ไม่ผ่านก็ตอบ 401/403 จบเลย

### ฟังก์ชันที่ผลิต middleware (ทำไมมีวงเล็บ)

```ts
app.use(cors({ origin: ... }))   // cors(...) ไม่ใช่ middleware — มันคืน middleware ออกมา
app.use(express.json())          // เหมือนกัน
app.get("/x", requireAuth, ...)  // requireAuth เป็น middleware ตรงๆ จึงไม่มีวงเล็บ
```

---

## 4. ใส่ได้หลายตัว — และขอบเขตต่างกัน

ทั้ง 3 ตัวรับ function ได้ไม่จำกัด วิ่ง **ซ้าย → ขวา**:

```ts
app.use(path?, fn1, fn2, ..., fnN)
app.all(path,  fn1, fn2, ..., fnN)
app.get(path,  fn1, fn2, ..., fnN)
```

ต่างกันที่ **ขอบเขต** ไม่ใช่ syntax:

```ts
app.get("/api/users", requireAuth, requireAdmin, handler);
// ด่านคุ้มเฉพาะ GET /api/users

app.use("/api/users", requireAuth, requireAdmin);
// ด่านคุ้มทุก method + ทุก path ใต้ /api/users ที่ประกาศ "หลังบรรทัดนี้"
```

| | ข้อดี | ข้อเสีย |
|---|---|---|
| ผูกกับ route (`get`) | เห็นด่านติดกับ route ในบรรทัดเดียว อ่านง่าย | เขียนซ้ำทุก endpoint · ลืมได้ |
| ผูกกับโซน (`use`) | ประกาศครั้งเดียว · endpoint ใหม่ถูกคุ้มอัตโนมัติ | ต้องเลื่อนตาไปดูข้างบนถึงรู้ว่ามีด่าน · วันที่อยากยกเว้น route เดียวจะแงะยาก |

> ท่ามาตรฐานอีกแบบคือ `express.Router()` — แยกไฟล์ route ออกไปแล้วแขวนด้วย
> `app.use("/api/users", usersRouter)` เก็บไว้ใช้ตอนไฟล์ route เริ่มยาว

---

## 5. ลำดับมีผลจริง — 2 เคสจากโปรเจกต์นี้

### เคส 1 — `express.json()` ต้องอยู่ **ใต้** `app.all("/api/auth/*splat")`

```ts
app.all("/api/auth/*splat", toNodeHandler(auth));   // ต้องมาก่อน
app.use(express.json());                             // ต้องมาหลัง
```

`express.json()` จะ**อ่าน body ทิ้ง**เพื่อแปลงเป็น object แต่ better-auth ต้องการอ่าน body ดิบเอง
ถ้าสลับกัน better-auth จะรออ่าน body ที่ถูกอ่านไปหมดแล้ว → **request ค้าง**

### เคส 2 — `requireAuth` ต้องมาก่อน `requireAdmin`

```ts
app.get("/api/users", requireAuth, requireAdmin, handler);
```

`requireAuth` เป็นคน**วาง** session ลง `res.locals` · `requireAdmin` แค่**อ่าน**
ถ้าสลับ → `res.locals.session` เป็น `undefined` → `.user` พัง

**ผลการทดลองจริง (สลับลำดับแล้วยิง):**

| ยิงด้วย | ได้ |
|---|---|
| ไม่มี session | `500` |
| **admin ที่ล็อกอินถูกต้อง** | **`500`** |

→ พังกับ**ทุกคน** ไม่ใช่แค่คนไม่ได้ล็อกอิน เพราะเรื่องนี้ไม่เกี่ยวกับสถานะ login เลย เกี่ยวกับ**ลำดับการรัน**ล้วนๆ

**TypeScript ไม่จับให้** — เพราะเราประกาศ `Locals.session` เป็นชนิดที่ไม่ใช่ optional TS จึงเชื่อว่ามีเสมอ
Type คือการ**ประกาศ contract** ไม่ใช่การ**บังคับ** contract · ลำดับ middleware อยู่นอกสายตา compiler

---

## 6. `res.locals` — ที่ส่งของระหว่าง middleware

`res.locals` = ที่วางของประจำ request นั้น ใครวางไว้ ตัวถัดไปในแถวหยิบได้ พอ request จบก็หายไป

```ts
// requireAuth วางของ
res.locals.session = session;
next();

// requireAdmin / handler หยิบของ
const { user } = res.locals.session;
```

**ปัญหา:** `res.locals` เป็นที่วางของสาธารณะ TypeScript ไม่รู้ว่าข้างในมีอะไร → ยอมให้หมด
`res.locals.session.user.emial` (พิมพ์ผิด) ก็ compile ผ่าน

**วิธีแก้ — บอก TS ว่าในกล่องมีอะไร** (ใน `server/src/require-auth.ts`):

```ts
declare global {
  namespace Express {
    interface Locals {
      session: AuthSession;
    }
  }
}
```

`@types/express` เขียน `interface Locals {}` เปล่าไว้ **โดยตั้งใจให้เราเติม** เลยเติมได้โดยไม่ต้องแก้ library

> ก้อนนี้ **ไม่ใช่โค้ดที่รัน** — Node ลบ type ทิ้งตอนรัน มีผลกับ TypeScript อย่างเดียว

---

## 7. กับดัก — ลืม `return` หน้า `res.status(...)`

```ts
if (role !== "admin") {
  res.status(403).json({ error: "forbidden" });   // ← ลืม return
}
next();
```

**เข้าใจผิดที่พบบ่อย:** คิดว่าไม่มี `return` = response ไม่ถูกส่ง — **ผิด**
`res.status(403).json({...})` **ส่ง response ออกไปทันทีที่บรรทัดนั้นทำงาน** ไม่ได้รอ `return`

`return` ทำหน้าที่เดียว: **หยุดฟังก์ชันไม่ให้ไหลลงบรรทัดถัดไป**

**ผลการทดลองจริง:**

| | ผล |
|---|---|
| ฝั่ง client | `403 forbidden` — **ดูปกติทุกอย่าง** |
| ฝั่ง server | `Error [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent` |

ลำดับที่เกิดขึ้น:
1. ส่ง 403 ออกไปแล้ว ✅
2. ไหลลงไปเจอ `next()` → เรียกต่อ
3. handler ทำงาน → **ยิง query ไปดาต้าเบสจริงๆ ทั้งที่ปฏิเสธไปแล้ว**
4. `res.json({...})` → พัง เพราะ response ถูกปิดไปตั้งแต่ข้อ 1

**ทำไมอันตราย:** เคส `GET` แค่เสียแรง query ฟรี แต่ถ้าเป็น
`app.delete("/api/users/:id", requireAuth, requireAdmin, handler)` →
agent เห็น `403` สวยงาม **แต่ user ถูกลบไปแล้วจริงๆ** · ด่านตรวจกลายเป็นของประดับ และไม่มีใครรู้

---

## 8. Error handling — Express 5 ไม่ต้อง `try/catch` ทุก route แล้ว

**Express 4:** async handler โยน error → Express ไม่รู้เรื่อง → **request ค้าง** จนกว่าจะ timeout
จึงต้องเขียน `try/catch` ทุกที่ (หรือลง `express-async-errors`)

**Express 5:** router ห่อ handler ไว้ให้แล้ว — promise reject เมื่อไหร่ มันเรียก `next(error)` ให้เอง

```js
// source code ของ Express 5 (router/lib/layer.js)
const ret = fn(req, res, next)
if (isPromise(ret)) {
  ret.then(null, function (error) {
    next(error || new Error('Rejected promise'))   // ← ส่งต่อให้ error handler เอง
  })
}
```

### แต่ "จับ" ≠ "จัดการ"

Express 5 **จับ error แล้วส่งต่อให้ถูกที่** — ไม่ได้ตัดสินใจแทนว่าจะตอบ client ว่าอะไร
ถ้าปลายทางไม่มีใครรับ Express ใช้ตัว default ซึ่ง **ส่ง stack trace กลับไปให้ client** เมื่อไม่ใช่ production

จึงยังต้องเขียน error handler เอง **1 ตัว** ไว้ **ท้ายไฟล์ หลัง route ทุกตัว**:

```ts
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  console.error(`[${req.method} ${req.originalUrl}]`, err);
  res.status(500).json({ error: "internal_error" });
});
```

### กับดัก: ต้องมี **4 พารามิเตอร์เป๊ะๆ**

Express แยก error handler ออกจาก middleware ธรรมดาด้วยการ**นับจำนวนพารามิเตอร์**:

```js
if (fn.length !== 4) return next(error)   // 3 ตัว = ไม่ใช่ error handler → ข้าม
```

เขียน `(err, req, res)` → **ไม่เคยถูกเรียก** และหาสาเหตุยากมาก
ใส่ `_next` ไว้ให้ครบแม้ไม่ได้ใช้ (ขีดล่างไม่ลดจำนวนพารามิเตอร์)

### ผลการทดลองจริง

async handler ที่ `throw` โดยไม่มี `try/catch` เลย + error handler 4 ตัว:

| | ได้อะไร |
|---|---|
| client | `500` + `{"error":"internal_error"}` — **ไม่มี stack** |
| server log | `[GET /boom] connect ECONNREFUSED 127.0.0.1:5432 db=ticket_management` |

### `try/catch` ยังจำเป็นเมื่อไหร่

**เมื่อ error นั้นเปลี่ยน response** ไม่ใช่แค่กลายเป็น 500

```ts
try {
  await prisma.user.create({ data });
} catch (err) {
  if (err.code === "P2002") return res.status(409).json({ error: "email_taken" });
  throw err;                       // ← ที่ไม่รู้จัก โยนต่อให้ handler กลางเสมอ
}
```

> **กฎ:** `try/catch` เพื่อ *"ทำให้เป็น 500"* → ไม่ต้องเขียนแล้ว ·
> `try/catch` เพื่อ *"แปลง error เป็น status ที่ถูก"* → ยังต้องเขียน + `throw err` ตัวที่ไม่รู้จัก

---

## 9. เลือกยังไง

```
ต้องการ "ตอบ" ที่ path เจาะจงไหม?
│
├── ไม่ (แค่แวะทำอะไร: log, cors, parse body, auth)
│      └── app.use(...)          ← ไม่ใส่ path = ทุก request
│
└── ใช่
       ├── รู้ method → app.get / post / put / delete   ← ใช้อันนี้เกือบตลอด
       └── ไม่รู้ method / ต้องรับหมด → app.all
```

**`all` เจอน้อยมากในโค้ดปกติ** — เจอแค่ 2 กรณี: ยกงานให้ library ที่มี endpoint ของตัวเองหลายตัว
(เคส better-auth) กับ catch-all 404 ท้ายไฟล์

---

## โค้ดจริงในโปรเจกต์นี้ (`server/src/index.ts`)

```ts
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));   // ทุก request
app.all("/api/auth/*splat", toNodeHandler(auth));              // ยกทั้งโซนให้ better-auth
app.use(express.json());                                       // ทุก request (ต้องอยู่ใต้บรรทัดบน)
app.get("/api/me",    requireAuth, handler);                   // GET เท่านั้น
app.get("/api/users", requireAuth, requireAdmin, handler);     // GET + ต้องเป็น admin
```

**ทำไม `cors` ต้องเป็น `use` ไม่ใช่ `get`:** เบราว์เซอร์ยิง **preflight** ด้วย method `OPTIONS`
ก่อนยิงของจริง ถ้าใช้ `app.get` จะไม่รับ `OPTIONS` → preflight ตก → request จริงไม่เคยถูกส่ง

**ทำไม `app.all` ไม่ใช่ `app.use("/api/auth", ...)`:** ทดลองแล้ว `use` ก็ทำงานได้ (sign-in ผ่าน 200)
แต่ `all` เหมาะกว่าเพราะ **ไม่ตัด `req.url`** → better-auth เห็น path เต็มตรงกับที่มันคาดหวัง
เราไม่ต้องพึ่งว่า library จะรับมือ url ที่ถูกตัดได้ · และความหมายตรงกว่า:
"ทุกอย่างใต้ `/api/auth` มีคนตอบแล้ว จบที่นี่" ไม่ใช่ "แวะทำอะไรระหว่างทาง"

---

> 🔐 401 vs 403 และเรื่อง AuthN / Session / AuthZ → [authentication-and-authorization.md](authentication-and-authorization.md)
> 🌐 CORS / preflight / same-origin → [cors-and-same-origin-policy.md](cors-and-same-origin-policy.md)
