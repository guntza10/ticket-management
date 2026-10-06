# axios — ทำไมไม่ใช้ `fetch` เฉยๆ

ทำไมโปรเจกต์นี้ลง `axios` ทั้งที่ `fetch` มีมาให้ในเบราว์เซอร์อยู่แล้ว: เพราะทุกครั้งที่
เรียก `fetch` เราต้องทำงานเดิมซ้ำ 4 อย่างก่อนจะได้ข้อมูล และงานเดิมที่ต้องทำซ้ำ คือ
งานที่วันหนึ่งจะลืมทำ — ดู `client/src/lib/api.ts`

> คู่กับ [TanStack Query](tanstack-query.md) ซึ่งแก้ **คนละปัญหา** (ท้ายไฟล์มีเส้นแบ่ง)

## TL;DR (อ่านทวนเร็ว)

- **axios = ตัวยิง HTTP request ใช้แทน `fetch`** ไม่ได้เก่งกว่า แค่ย้ายงานซ้ำไปทำครั้งเดียว
- **แกน: ตั้งค่าครั้งเดียว ใช้ได้ทุก request** — `baseURL` + `withCredentials` ตั้งที่ instance
- **`fetch` ไม่ throw เมื่อเจอ 400/401/403/500** — มันมองว่า "ส่งถึงและได้คำตอบแล้ว" = สำเร็จ · **axios throw ให้**
- `fetch` reject เฉพาะตอน**เชื่อมต่อไม่ได้** (server ล่ม, เน็ตหลุด, โดน CORS บล็อก, ถูก abort)
- **`withCredentials: true` = `credentials: "include"` ของ `fetch`** — ขาดแล้ว cookie ไม่ถูกแนบ → 401
- axios **แปลง JSON ให้แล้ว** → ได้ `data` เลย ไม่ต้อง `await response.json()`
- **axios จบหน้าที่ตรงที่ข้อมูลมาถึงมือ** — cache / loading / error state ไม่ใช่งานของมัน

---

## 1. ปัญหาของ `fetch` — งานซ้ำ 4 อย่างต่อหนึ่ง request

```ts
const response = await fetch(`${API_URL}/api/users`, {   // ① ต่อ URL เอง
  credentials: "include",                                 // ② แนบ cookie เอง
});
if (!response.ok) throw new Error(...);                   // ③ เช็ค status เอง
const data = await response.json();                       // ④ แปลง JSON เอง
```

**ทั้ง 4 ข้อต้องเขียนใหม่ทุก endpoint** — Phase 3 จะมี `POST`/`PATCH`/`DELETE` อีก 3 ตัว
Phase 4 มี ticket CRUD อีกเป็นสิบ **ลืมข้อ ② แค่ที่เดียว = endpoint นั้นได้ 401 แบบงงๆ**

## 2. `axios.create()` — ย้ายงานซ้ำไปไว้ที่เดียว

`client/src/lib/api.ts`

```ts
export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});
```

```ts
api.get("/api/users")              // ได้ baseURL + cookie + เช็ค status + แปลง JSON ครบ
api.post("/api/users", data)
```

| option | แทนอะไรใน `fetch` |
|---|---|
| `baseURL` | `` `${API_URL}/api/users` `` ที่ต้องต่อเองทุกครั้ง |
| `withCredentials: true` | `credentials: "include"` ที่ต้องพิมพ์ทุกครั้ง |

> `withCredentials` เป็นแค่ชื่อของ axios สำหรับเรื่องเดียวกัน — ฝั่ง server ยังต้องมี
> `cors({ credentials: true })` คู่กันเสมอ ดู [CORS & SOP](cors-and-same-origin-policy.md)

## 3. ความต่างที่ต้องจำ: `fetch` ไม่ถือว่า 4xx/5xx คือ error

```
fetch   ได้ 403 → promise resolve ปกติ → ต้องเช็ค response.ok เอง
axios   ได้ 403 → promise reject      → เข้า catch / กลายเป็น error ของ TanStack Query
```

**`fetch` reject เฉพาะเมื่อ "ไม่ได้คำตอบกลับมาเลย"**: server ไม่ตอบ · เน็ตหลุด · โดน CORS
บล็อก · ถูก `abort()` — **ส่วน 401/403/404/500 คือ "ได้คำตอบแล้ว" ในสายตามัน**

นี่คือบรรทัดที่หายไปจาก `UsersPage` ตอนย้ายมา axios:
```ts
if (!response.ok) throw new Error(`Could not load users (${response.status})`);
```

## 4. generic `<T>` — บอก TypeScript ว่า response หน้าตายังไง

```ts
const { data } = await api.get<{ users: UserRow[] }>("/api/users");
```

**axios ไม่รู้เองว่า server ตอบอะไรมา เราเป็นคนบอก** — และ**ไม่มีใครตรวจว่าเราบอกถูก**
ถ้า server เปลี่ยนรูปแบบ response แล้วเราลืมแก้ตรงนี้ TypeScript จะไม่เตือนเลย

## 5. สิ่งที่ axios **ไม่ได้** แก้

```
axios จบหน้าที่ตรงที่ "ข้อมูลมาถึงมือ"
ที่เหลือยังเป็นของเรา →  เก็บไว้ไหน · ตอนรอแสดงอะไร · พลาดแล้วทำไง
                        ออกจากหน้าแล้วข้อมูลไปไหน · กลับมาต้องโหลดใหม่ไหม
```

ถ้าลง axios อย่างเดียว `useState` 2 ตัว + `useEffect` + `AbortController` ยังต้องเขียนเหมือนเดิม
→ นั่นคืองานของ [TanStack Query](tanstack-query.md)

---

## หลักจำ

> **axios = "ไปเอาข้อมูลมา" · TanStack Query = "ดูแลข้อมูลที่เอามาแล้ว"**
>
> axios ไม่ได้ทำอะไรที่ `fetch` ทำไม่ได้ — มันแค่ทำให้ของที่ต้องทำซ้ำทุกครั้ง
> กลายเป็นของที่ตั้งครั้งเดียว **และของที่ต้องทำซ้ำ คือของที่วันหนึ่งจะลืม**
