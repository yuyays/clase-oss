ALTER TABLE "assessments" ADD COLUMN "owner_session_hash" text;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "assessments_expires_at_idx" ON "assessments" USING btree ("expires_at");