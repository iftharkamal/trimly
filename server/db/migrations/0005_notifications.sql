CREATE TYPE "public"."notification_audience" AS ENUM('SHOP', 'CUSTOMER');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('QUEUE_GETTING_CLOSE', 'CUSTOMER_JOINED_ONLINE', 'CUSTOMER_LEFT_QUEUE', 'APPOINTMENT_BOOKED_ONLINE', 'APPOINTMENT_CANCELLED_BY_CUSTOMER');--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notifications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"shop_id" uuid NOT NULL,
	"audience" "notification_audience" NOT NULL,
	"type" "notification_type" NOT NULL,
	"queue_entry_id" uuid,
	"appointment_id" uuid,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_queue_entry_id_queue_entries_id_fk" FOREIGN KEY ("queue_entry_id") REFERENCES "public"."queue_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_shop_audience_id_idx" ON "notifications" USING btree ("shop_id","audience","id");--> statement-breakpoint
CREATE INDEX "notifications_queue_entry_id_idx" ON "notifications" USING btree ("queue_entry_id","id");