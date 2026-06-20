DROP INDEX "idx_subscriptions_active_unique";

--> statement-breakpoint
CREATE UNIQUE INDEX "idx_subscriptions_active_unique" ON "subscriptions" USING btree ("user_id")
WHERE
    "subscriptions"."status" IN ('initiated', 'active', 'past_due', 'non_renewing');

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_insert_only ON audit_logs FOR INSERT
WITH
    CHECK (true);

CREATE POLICY audit_no_update ON audit_logs FOR
UPDATE USING (false);

CREATE POLICY audit_no_delete ON audit_logs FOR DELETE USING (false);