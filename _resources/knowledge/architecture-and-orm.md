# Architecture & ORM

## 2 แบบวางสถาปัตยกรรมเว็บ

| แบบ | คือ | ตัวอย่าง |
|---|---|---|
| **Full-stack framework** | Frontend + Backend อยู่ใน**โปรเจกต์เดียว** | Next.js |
| **Decoupled SPA + REST API** | Frontend แยกขาดจาก Backend คุยกันผ่าน **HTTP** | React (FE) + Express (BE) |

**โปรเจกต์เรา (ตามผู้สอน) = แบบที่ 2:**
```
React (หน้าเว็บ)  ⇄ HTTP ⇄  Express (API)  ⇄  PostgreSQL
   /client                     /server
```
- **SPA** = Single Page Application (หน้าเว็บ React ที่โหลดครั้งเดียวแล้ววิ่งในเบราว์เซอร์)
- **REST API** = ฝั่ง server เปิด endpoint ให้ frontend เรียกข้อมูล

> ถ้าเลือกผิดแบบ (เช่นใช้ Next.js ทั้งที่คลิปสอน React+Express) โครงไฟล์/วิธีเรียก
> API จะคนละแบบเลย → ตามคลิปไม่ได้

---

## Monorepo

เก็บทั้ง frontend + backend ไว้ใน **repo เดียว** แยกเป็นโฟลเดอร์ `/client` และ `/server`

---

## ORM (Object-Relational Mapping)

เครื่องมือที่ให้เราคุยกับฐานข้อมูลด้วย**โค้ด** แทนการเขียน SQL ดิบ

- ตัวอย่าง: **Prisma** (ที่เราใช้)
- ข้อดี: **type-safe** (TypeScript เตือนถ้าเขียน query ผิด), ปลอดภัย, อ่านง่าย
- ทำ **migration** ได้ (จัดการการเปลี่ยนโครงสร้างตาราง DB)

> พูดง่ายๆ: แทนที่จะเขียน `SELECT * FROM users WHERE id = 5`
> เขียน `prisma.user.findUnique({ where: { id: 5 } })` แทน
