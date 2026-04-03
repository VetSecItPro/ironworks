CREATE TABLE IF NOT EXISTS "support_tickets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid REFERENCES companies(id),
  "user_id" text,
  "user_email" text NOT NULL,
  "user_name" text,
  "type" text NOT NULL DEFAULT 'bug',
  "status" text NOT NULL DEFAULT 'open',
  "subject" text NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "support_ticket_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticket_id" uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  "author_type" text NOT NULL DEFAULT 'admin',
  "author_name" text,
  "body" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
