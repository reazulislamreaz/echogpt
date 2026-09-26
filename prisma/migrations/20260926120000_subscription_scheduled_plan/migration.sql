-- Persist the plan chosen by a scheduled downgrade.
ALTER TABLE "subscriptions" ADD COLUMN "scheduled_plan_id" UUID;

ALTER TABLE "subscriptions"
ADD CONSTRAINT "subscriptions_scheduled_plan_id_fkey"
FOREIGN KEY ("scheduled_plan_id") REFERENCES "subscription_plans"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "subscriptions_scheduled_plan_id_idx" ON "subscriptions"("scheduled_plan_id");
