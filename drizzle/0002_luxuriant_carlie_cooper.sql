CREATE TYPE "public"."question_generation_status" AS ENUM('queued', 'running', 'success', 'failed');--> statement-breakpoint
CREATE TABLE "question_generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"assessment_version_id" uuid NOT NULL,
	"status" "question_generation_status" NOT NULL,
	"target_correct_rate" integer NOT NULL,
	"error_message" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "question_generation_jobs" ADD CONSTRAINT "question_generation_jobs_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_generation_jobs" ADD CONSTRAINT "question_generation_jobs_assessment_version_id_assessment_versions_id_fk" FOREIGN KEY ("assessment_version_id") REFERENCES "public"."assessment_versions"("id") ON DELETE cascade ON UPDATE no action;