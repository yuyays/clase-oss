CREATE TYPE "public"."assessment_upload_request_status" AS ENUM('processing', 'success', 'failed');--> statement-breakpoint
CREATE TABLE "assessment_upload_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "assessment_upload_request_status" NOT NULL,
	"asset_file_id" uuid,
	"parsing_job_id" uuid,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessment_upload_requests" ADD CONSTRAINT "assessment_upload_requests_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_upload_requests" ADD CONSTRAINT "assessment_upload_requests_asset_file_id_asset_files_id_fk" FOREIGN KEY ("asset_file_id") REFERENCES "public"."asset_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_upload_requests" ADD CONSTRAINT "assessment_upload_requests_parsing_job_id_parsing_jobs_id_fk" FOREIGN KEY ("parsing_job_id") REFERENCES "public"."parsing_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_upload_requests_assessment_idempotency_key_idx" ON "assessment_upload_requests" USING btree ("assessment_id","idempotency_key");