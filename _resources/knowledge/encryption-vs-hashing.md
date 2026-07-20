# Encryption vs Hashing

security พื้นฐาน 2 อย่างที่คนสับสน — hash ถูกใช้ตอน [seed/auth](auth-roles-and-seeding.md),
เกี่ยวโยงกับ [Cookie security](cookie-security.md).
อธิบายระดับ **overview / flow** (คืออะไร + flow ทำงานยังไง) ไม่ลงลึก mechanics ในแต่ละ step

## TL;DR (อ่านทวนเร็ว)

- **Encryption** = แปลง text ด้วย algorithm + **key** → text อ่านไม่รู้เรื่อง; **ถอดกลับได้**ด้วย key เดิม · ใช้ตอนต้องเอาข้อมูลกลับมาอ่าน
- **Hashing** = แปลง text ด้วย hash function (**ไม่มี key**) → hashed text; **ย้อนกลับไม่ได้**; text เดิม → hash เดิมเสมอ · ใช้ **เทียบ** ว่าตรงไหม
- **password ตอน login:** ส่ง plaintext ผ่าน **HTTPS/TLS** (encryption กันตอนเดินทาง) → server **hash** แล้วเทียบกับ hash ใน DB (hash กันตอนเก็บ)

---

## Encryption

- **คืออะไร:** แปลงข้อมูลให้อ่านไม่ออก โดยยังเอากลับมาอ่านได้
- **flow:**
  ```
  text + key            → [encryption algorithm]      → ciphertext (อ่านไม่รู้เรื่อง)
  ciphertext + key(เดิม) → [algorithm โหมดถอด]         → text เดิม
  ```
- ต้องมี **key** ทั้งเข้าและถอด · **ย้อนกลับได้**
- **ชื่อ algorithm:** `AES` (key เดียวใช้เข้า+ถอด = *symmetric*), `RSA` (key คนละตัว = *asymmetric*, ใช้ใน HTTPS)
- **ใช้ตอน:** ต้องเอาข้อมูลกลับมาอ่านทีหลัง (เช่น HTTPS ตอนส่งข้อมูลผ่านเน็ต)

---

## Hashing

- **คืออะไร:** แปลงข้อมูลเป็นรหัสตายตัว ที่ย้อนกลับไม่ได้
- **flow:**
  ```
  text → [hash function] → hashed text (ความยาวคงที่)
  (ไม่มี key · ไม่มี flow ย้อนกลับ)
  ```
- **ไม่มี key** · **ย้อนไม่ได้** · text เดิม → hashed text เดิมเสมอ (ถ้า hash เปลี่ยน = text ต้นทางถูกแก้)
- **ใช้ตอน:** แค่อยากเทียบว่าข้อมูลตรงไหม/ถูกแก้ไหม โดยไม่ต้องเก็บตัวจริง
- **ชื่อ hash function:** `SHA-256` (ทั่วไป); สำหรับ password ใช้ `scrypt`/`bcrypt`/`argon2` (ออกแบบให้ช้า+ใส่ salt) — Better Auth ใช้ **scrypt**

---

## เทียบ

| | Encryption | Hashing |
|---|---|---|
| key | **มี** | **ไม่มี** |
| ย้อนกลับ | ได้ (ด้วย key) | ไม่ได้ |
| ขนาด output | โตตาม input | คงที่ |
| ใช้เพื่อ | ซ่อนไว้อ่านทีหลัง | เทียบว่าตรงไหม |

---

## มารวมกันตอน login (flow จริง)

password ถูกป้องกัน **2 จังหวะ คนละวิธี**:
```
[client]  user พิมพ์ password (plaintext)
   │   ส่งผ่าน HTTPS/TLS   ← encryption กันตอน "เดินทาง" (คนดักฟังเห็นแต่ ciphertext)
   ▼
[server]  ถอด TLS ได้ plaintext → hash → เทียบกับ hashed text ใน DB
                                            ▲ hash กันตอน "เก็บ" (DB หลุดเห็นแต่ hash)
```
- **client ไม่ hash password ก่อนส่ง** — hash ทำที่ server; ถ้า client hash แล้วส่ง hash นั้นจะกลายเป็นรหัสผ่านเสียเอง (ขโมยไป replay login ได้)
- dev ใช้ `http://localhost` ได้ (request ไม่ออกจากเครื่อง); **production ต้องเป็น https**
