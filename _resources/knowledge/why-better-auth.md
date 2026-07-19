# Better Auth — คืออะไร & ทำไมต้องใช้

concept "ทำไมเลือก Better Auth" (ส่วน "ตั้งค่าโค้ดยังไง" อยู่ที่ [Better Auth setup](better-auth-setup.md)).
ต่อยอดจาก [Authentication, Session & Authorization](authentication-and-authorization.md).

## TL;DR (อ่านทวนเร็ว)

- **คืออะไร:** framework-agnostic authentication (+authorization) library สำหรับ TypeScript — ทำ 3 ด่าน (AuthN/Session/AuthZ) ให้ครบ เก็บข้อมูลใน DB เราเอง
- **ทำไมใช้ library:** auth "เขียนเองได้ แต่เขียนให้ถูกยากมาก" — มี landmine ความปลอดภัยเยอะ (hash password, secure cookie, revoke, CSRF, timing attack) พลาดจุดเดียว = ช่องโหว่จริง; library ทำถูกให้แล้ว เราโฟกัสตัวแอป
- **framework-agnostic:** ไม่ผูกกับ framework ไหน → ใช้กับ Express 5 เราได้; ทำได้เพราะ core เป็น Web standard + adapter บางๆ ที่รอยต่อ

---

## Better Auth คืออะไร (what it *is*)

**framework-agnostic authentication (and authorization) library สำหรับ TypeScript** — library ที่ทำเรื่อง auth ทั้งก้อน ใช้กับ framework ไหนก็ได้

ครอบ **ทั้ง 3 ด่าน** ที่เรียนมา:
- **AuthN** — email/password, social login, magic link, passkey (+ hash password ให้ถูก)
- **Session** — สร้าง/ตรวจ/หมดอายุ/revoke session, เซ็ต cookie (server-side session = default)
- **AuthZ** — plugin `admin` สำหรับ role/permission

เก็บข้อมูล user/session ใน **DB เราเอง** (Postgres ที่ต่อผ่าน Prisma) — ไม่ฝากบริการนอก

---

## ทำไมต้องใช้ (why)

**auth เป็นเรื่องที่เขียนเองได้ แต่เขียนให้ถูกยากมาก** — สิ่งที่ด่าน AuthN/Session ต้องทำถูกทุกจุด:
- hash password ด้วย algorithm ที่ถูก (ไม่เก็บ plain text / MD5)
- secure cookie: `HttpOnly` (กัน XSS อ่าน token), `Secure` (HTTPS only), `SameSite` (กัน CSRF) — ดู [Cookie security](cookie-security.md)
- session หมดอายุ + revoke ให้ทำงานจริง
- กันช่องโหว่คลาสสิก: CSRF, session fixation, timing attack ตอนเทียบ password

**พลาดจุดใดจุดหนึ่ง = ช่องโหว่ความปลอดภัยจริง** ที่ทำให้ account โดน hack — Better Auth ทำพวกนี้ถูกให้แล้ว เราเลยไม่ต้อง "reinvent the wheel" เอาเวลาไปทำตัวแอป (ระบบ ticket) แทน

**เข้ากับ stack เรา:** TypeScript-native · framework-agnostic (ต่อ Express 5) · มี Prisma/Postgres adapter · own-your-data (เหมาะกับ internal help-desk ที่ข้อมูลพนักงานไม่ควรฝากบริการนอก)

---

## "agnostic" & "framework-agnostic"

- **agnostic** (ในวงการ tech) = "ไม่ผูกติด / ไม่ขึ้นกับตัวใดตัวหนึ่ง" — รูปแบบ `X-agnostic` = ทำงานได้โดยไม่ขึ้นกับ X (เช่น platform-agnostic, database-agnostic)
- **framework-agnostic** = ไม่ได้เขียนมาเพื่อ web framework ตัวใดตัวหนึ่ง → ใช้กับ Express, Next, SvelteKit ฯลฯ ได้ (ตรงข้ามกับ framework-specific เช่น NextAuth ที่ผูกกับ Next)
- **ทำได้ยังไง:** core (logic auth) สร้างบน **มาตรฐาน Web** (Request/Response/Headers) กลางๆ ไม่แตะ framework ตรงๆ + มี **adapter บางๆ** ที่รอยต่อแปลงของแต่ละ framework
  - ในโปรเจกต์เรา: `toNodeHandler` (Express → auth), `fromNodeHeaders` (Node headers → Web Headers) — ดู [Better Auth setup](better-auth-setup.md)
  - เปลี่ยน framework = เปลี่ยนแค่ adapter ชั้นบาง core เหมือนเดิม
