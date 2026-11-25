# รับชำระค่าแพ็กเกจด้วยบัตร (Stripe)

## ทำงานยังไง
1. บริษัทเปิดใบแจ้งหนี้ (Subscription → เลือกแพ็กเกจ) → กด **Pay by card**
2. ระบบสร้างหน้าจ่ายเงินที่ **Stripe Checkout** ด้วยยอดเท่ากับใบแจ้งหนี้พอดี (รวม VAT, สกุล USD) แล้วพาไปหน้านั้น
   เลขบัตรกรอกที่หน้าของ Stripe **ไม่ผ่านเซิร์ฟเวอร์ BMERC เลย**
3. จ่ายเสร็จ Stripe พากลับมาที่หน้าใบแจ้งหนี้ และส่ง **webhook** มาบอกระบบ
4. ระบบตรวจลายเซ็นของ Stripe และยอดเงินว่าตรงกับใบแจ้งหนี้ แล้วปิดใบเป็น **Paid** ใช้แพ็กเกจและเครดิตใหม่ทันที
   และเปิดบัญชีที่ถูกระงับคืนให้เอง (ถ้าไม่มีใบอื่นค้าง) แบบเดียวกับตอนเจ้าของระบบกดยืนยันการโอนเงิน
5. ทุกขั้นบันทึกใน audit log: `billing.card_checkout`, `billing.paid_by_card`, `billing.card_amount_mismatch`, `billing.card_payment_failed`

ถ้า Stripe ส่ง webhook ซ้ำ ระบบปิดใบแค่ครั้งเดียว ถ้ายอดที่จ่ายไม่ตรงกับใบ ระบบ**จะไม่ปิดใบ** แต่บันทึกไว้ให้ตรวจ

## ตั้งค่า (ทำครั้งเดียว)
1. สมัคร **stripe.com** ช่วงทดสอบให้ใช้ **Test mode** (สวิตช์มุมขวาบน) ไม่ต้องยืนยันธุรกิจ
   บัญชี Stripe ไทยต้องเป็นธุรกิจที่อยู่ในไทย (บริษัทหรือห้างหุ้นส่วน มีที่อยู่ธุรกิจในไทย) รับเงินได้หลายสกุล
   แต่**โอนเข้าบัญชีธนาคารเป็นบาทเท่านั้น** ส่วน PromptPay ใช้ได้เฉพาะยอดเป็นบาท (ใบแจ้งหนี้ของเราเป็น USD จึงใช้แค่บัตร)
2. **Developers → API keys** → คัดลอก **Secret key** (`sk_test_...`)
3. **Developers → Webhooks → Add endpoint**
   - URL: `https://<โดเมนเว็บ>/api/v1/billing/stripe/webhook` (เช่น `https://bmerc.onrender.com/api/v1/billing/stripe/webhook`)
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`
   - กดสร้าง แล้วคัดลอก **Signing secret** (`whsec_...`)
4. ใส่ใน Render (หรือ Railway) → **Environment**:
   - `STRIPE_SECRET_KEY` = `sk_test_...`
   - `STRIPE_WEBHOOK_SECRET` = `whsec_...`
   ⚠️ ห้ามส่งค่านี้ในแชท และห้ามใส่ในโค้ด
5. Save แล้วรอ deploy ปุ่ม **Pay by card** จะกดได้

## ทดสอบใน Test mode
ใช้บัตรทดสอบของ Stripe: `4242 4242 4242 4242` วันหมดอายุเป็นวันไหนก็ได้ในอนาคต CVC 3 หลักอะไรก็ได้
หลังจ่าย ใบแจ้งหนี้ต้องเปลี่ยนเป็น Paid ภายในไม่กี่วินาที และหน้า Pending payments ของเจ้าของระบบจะไม่มีใบนั้นค้าง

## ก่อนรับเงินจริง
- ยืนยันตัวตนธุรกิจใน Stripe ให้ผ่าน แล้วสลับเป็น **Live mode**
- สร้าง webhook ใหม่ใน Live mode (secret คนละตัวกับ Test) แล้วเปลี่ยนทั้งสองค่าเป็นของ Live (`sk_live_...`, `whsec_...`)
- ค่าธรรมเนียม Stripe คิดต่อรายการ ดูอัตราล่าสุดที่หน้า pricing ของ Stripe

## สำหรับนักพัฒนา
- โค้ด: `apps/api/src/billing/stripe.ts`, `stripe-webhook.controller.ts`, `settle.ts` (ใช้ร่วมกับปุ่มยืนยันของเจ้าของระบบ)
- เทสต์: `test/stripe.e2e-spec.ts` (เซ็น webhook เองด้วย secret ทดสอบ ไม่ต้องมีบัญชี Stripe)
- ตรวจคำขอกับ `stripe-mock`: `docker run -p 12111:12111 stripe/stripe-mock:v0.197.0` แล้วรัน
  `STRIPE_API_URL=http://localhost:12111 npx vitest run --config ./vitest.config.e2e.ts test/stripe-mock.e2e-spec.ts`
