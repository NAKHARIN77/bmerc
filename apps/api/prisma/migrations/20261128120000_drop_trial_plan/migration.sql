-- No more Trial plan (2026-11-28). Basic is the starting plan: no monthly fee, 200 credits a month.
-- Companies still on Trial move to Basic with Basic's credit weights; a "trialing" subscription becomes active.
UPDATE "subscriptions" s
SET "plan_id" = b."id",
    "status" = CASE WHEN s."status" = 'trialing' THEN 'active'::"SubscriptionStatus" ELSE s."status" END,
    "credit_weights" = b."credit_weights"
FROM "plans" t, "plans" b
WHERE t."code" = 'trial' AND b."code" = 'basic' AND s."plan_id" = t."id";

-- Invoices keep their numbers and amounts; their plan link is cleared (ON DELETE SET NULL).
DELETE FROM "plans" WHERE "code" = 'trial';

UPDATE "plans" SET "price_cents" = 0 WHERE "code" = 'basic';
