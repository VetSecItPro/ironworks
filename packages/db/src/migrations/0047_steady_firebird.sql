CREATE TABLE "playbook_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"playbook_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"title" text NOT NULL,
	"instructions" text,
	"assignee_role" text,
	"assignee_agent_id" uuid,
	"depends_on" jsonb DEFAULT '[]'::jsonb,
	"estimated_minutes" integer,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playbooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"body" text,
	"icon" text,
	"category" text DEFAULT 'custom' NOT NULL,
	"is_seeded" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"estimated_minutes" integer,
	"run_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "playbook_steps" ADD CONSTRAINT "playbook_steps_playbook_id_playbooks_id_fk" FOREIGN KEY ("playbook_id") REFERENCES "public"."playbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbooks" ADD CONSTRAINT "playbooks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "playbook_steps_playbook_idx" ON "playbook_steps" USING btree ("playbook_id");--> statement-breakpoint
CREATE INDEX "playbook_steps_playbook_order_idx" ON "playbook_steps" USING btree ("playbook_id","step_order");--> statement-breakpoint
CREATE INDEX "playbooks_company_idx" ON "playbooks" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "playbooks_company_category_idx" ON "playbooks" USING btree ("company_id","category");