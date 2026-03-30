CREATE TABLE "library_file_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"action" text NOT NULL,
	"agent_id" uuid,
	"user_id" text,
	"issue_id" uuid,
	"change_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"title" text,
	"file_type" text,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"visibility" text DEFAULT 'company' NOT NULL,
	"owner_agent_id" uuid,
	"owner_user_id" text,
	"project_id" uuid,
	"last_modified_by_agent_id" uuid,
	"last_modified_by_user_id" text,
	"last_modified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "library_file_events" ADD CONSTRAINT "library_file_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_file_events" ADD CONSTRAINT "library_file_events_file_id_library_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."library_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_file_events" ADD CONSTRAINT "library_file_events_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_file_events" ADD CONSTRAINT "library_file_events_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_files" ADD CONSTRAINT "library_files_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_files" ADD CONSTRAINT "library_files_owner_agent_id_agents_id_fk" FOREIGN KEY ("owner_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_files" ADD CONSTRAINT "library_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_files" ADD CONSTRAINT "library_files_last_modified_by_agent_id_agents_id_fk" FOREIGN KEY ("last_modified_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "library_file_events_file_id_idx" ON "library_file_events" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "library_file_events_company_created_idx" ON "library_file_events" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "library_file_events_agent_idx" ON "library_file_events" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "library_files_company_file_path_idx" ON "library_files" USING btree ("company_id","file_path");--> statement-breakpoint
CREATE INDEX "library_files_company_visibility_idx" ON "library_files" USING btree ("company_id","visibility");--> statement-breakpoint
CREATE INDEX "library_files_owner_agent_idx" ON "library_files" USING btree ("owner_agent_id");--> statement-breakpoint
CREATE INDEX "library_files_project_idx" ON "library_files" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "library_files_company_modified_idx" ON "library_files" USING btree ("company_id","last_modified_at");