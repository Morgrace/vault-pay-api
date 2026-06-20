DROP INDEX "idx_subscriptions_active_unique";

--> statement-breakpoint
CREATE UNIQUE INDEX "idx_subscriptions_active_unique" ON "subscriptions" USING btree ("user_id")
WHERE
    "subscriptions"."status" IN ('initiated', 'active', 'past_due', 'non_renewing');