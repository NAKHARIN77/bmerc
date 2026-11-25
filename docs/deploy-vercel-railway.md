# เอา BMERC ขึ้น Vercel (หน้าเว็บ) + Railway (หลังบ้าน)

```
ผู้ใช้ → Vercel (หน้าเว็บ Next.js, apps/web) ──/api/v1──▶ Railway (API NestJS, SERVE=api) ──▶ Supabase
```

หน้าเว็บบน Vercel ส่งทุกคำขอ `/api/v1` ต่อให้ Railway เอง เบราว์เซอร์จึงเห็นแค่โดเมนของ Vercel คุกกี้ล็อกอินทำงานเหมือนเดิม
ทั้ง 3 ที่ตั้งไว้ที่ **Singapore**

## ค่าใช้จ่าย
- Railway: เครดิตทดลอง 5 USD ครั้งเดียว หลังจากนั้น Hobby 5 USD/เดือน
- Vercel: Hobby ฟรีแต่**ห้ามใช้ทำเงิน** เมื่อขายจริงต้องใช้ Pro 20 USD/เดือน
- Supabase: ฟรี

## 1. Railway (ทำก่อน เพราะ Vercel ต้องใช้โดเมนของ Railway)
1. **New Project** → **Deploy from GitHub repo** → เลือก **bmerc** (สร้าง project ใหม่ ไม่ต้องรวมกับ project อื่น)
2. กดที่ service → **Settings**
   - **Region:** Southeast Asia (Singapore)
   - **Networking** → **Generate Domain** (พอร์ตให้ใช้ตามที่ Railway เสนอ)
   - Railway อ่าน `railway.json`: build ด้วย `Dockerfile` และเช็กสุขภาพที่ `/api/v1/health`
3. แท็บ **Variables** ใส่:

| ชื่อ | ค่า |
|---|---|
| `SERVE` | `api` |
| `MIGRATE_DATABASE_URL` | ค่าเดียวกับใน Render (Supabase session pooler + `?sslmode=require`) |
| `APP_DB_PASSWORD` | **ค่าเดียวกับใน Render** ถ้า Render ยังเปิดอยู่ (ถ้าต่างกัน สองที่จะเปลี่ยนรหัสของ `bmerc_app` ทับกัน แล้วฝั่งหนึ่งจะต่อฐานข้อมูลไม่ได้) |
| `JWT_ACCESS_SECRET` | ค่าเดียวกับใน Render หรือสุ่มใหม่ยาว 40 ตัวขึ้นไป |
| `WEB_ORIGIN` | ลิงก์ของ Vercel (ใส่หลังทำขั้นที่ 2 เสร็จ) ใช้ทำลิงก์ในอีเมล |
| `SMTP_URL`, `MAIL_FROM` | ตอนตั้งอีเมล |

4. รอ deploy จนขึ้น **Active** แล้วเปิด `https://<โดเมน Railway>/api/v1/health` ต้องเห็น `{"status":"ok","db":"ok"}`

## 2. Vercel
1. **Add New** → **Project** → Import **bmerc**
2. **Root Directory:** `apps/web` (Framework: Next.js จะขึ้นเอง)
3. **Environment Variables:**

| ชื่อ | ค่า |
|---|---|
| `API_ORIGIN` | `https://<โดเมน Railway>` (ไม่มี `/` ท้าย) |

4. **Deploy** โดย region ของ function ตั้งไว้ใน `apps/web/vercel.json` เป็น `sin1` (Singapore)
   ถ้าลืมใส่ `API_ORIGIN` การ build จะหยุดพร้อมข้อความบอก
5. ได้ลิงก์ เช่น `https://bmerc.vercel.app` → กลับไปใส่เป็น `WEB_ORIGIN` ใน Railway

## 3. ทดสอบ
เปิดลิงก์ Vercel → ล็อกอินด้วยบัญชีตัวอย่าง → ทำตามเช็กลิสต์ทดสอบ

## ระหว่างย้าย
Render ยังทำงานได้ตามปกติ (ค่าเริ่มต้น `SERVE=all`) ใช้ฐานข้อมูล Supabase ชุดเดียวกัน
เมื่อ Vercel + Railway ใช้ได้ดีแล้ว ค่อยหยุด Render (Settings → **Suspend**)
