-- Composite index for per-user billing-period usage aggregation:
-- COUNT(*) WHERE user_id = $1 AND created_at >= $2 AND created_at < $3
-- The leftover standalone user_id index is redundant as a prefix of this composite.

DROP INDEX IF EXISTS "api_usage_logs_user_id_idx";

CREATE INDEX "api_usage_logs_user_id_created_at_idx" ON "api_usage_logs"("user_id", "created_at");
