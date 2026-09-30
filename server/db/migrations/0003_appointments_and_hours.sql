CREATE TYPE "public"."appointment_status" AS ENUM('BOOKED', 'CHECKED_IN', 'CANCELLED', 'NO_SHOW');--> statement-breakpoint
CREATE TYPE "public"."booking_source" AS ENUM('ONLINE', 'BARBER');--> statement-breakpoint
ALTER TYPE "public"."queue_entry_source" ADD VALUE 'APPOINTMENT';--> statement-breakpoint
CREATE TABLE "shop_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"opens_at" time NOT NULL,
	"closes_at" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_hours_weekday_range" CHECK ("shop_hours"."weekday" between 1 and 7),
	CONSTRAINT "shop_hours_opens_before_closes" CHECK ("shop_hours"."opens_at" < "shop_hours"."closes_at")
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"barber_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"tracking_code" uuid DEFAULT gen_random_uuid() NOT NULL,
	"status" "appointment_status" DEFAULT 'BOOKED' NOT NULL,
	"source" "booking_source" NOT NULL,
	"service_name" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"price_minor" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"queue_entry_id" uuid,
	"checked_in_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_tracking_code_unique" UNIQUE("tracking_code"),
	CONSTRAINT "appointments_queue_entry_id_unique" UNIQUE("queue_entry_id"),
	CONSTRAINT "appointments_ends_after_starts" CHECK ("appointments"."ends_at" > "appointments"."starts_at"),
	CONSTRAINT "appointments_duration_positive" CHECK ("appointments"."duration_minutes" > 0),
	CONSTRAINT "appointments_price_non_negative" CHECK ("appointments"."price_minor" >= 0)
);
--> statement-breakpoint
DROP INDEX "queue_entries_barber_lane_idx";--> statement-breakpoint
ALTER TABLE "queue_entries" ADD COLUMN "order_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_hours" ADD CONSTRAINT "shop_hours_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_barber_id_barbers_id_fk" FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_queue_entry_id_queue_entries_id_fk" FOREIGN KEY ("queue_entry_id") REFERENCES "public"."queue_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shop_hours_shop_weekday_idx" ON "shop_hours" USING btree ("shop_id","weekday");--> statement-breakpoint
CREATE INDEX "appointments_barber_starts_idx" ON "appointments" USING btree ("barber_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_shop_starts_idx" ON "appointments" USING btree ("shop_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_customer_id_idx" ON "appointments" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_one_booked_per_customer_shop" ON "appointments" USING btree ("shop_id","customer_id") WHERE "appointments"."status" = 'BOOKED';--> statement-breakpoint
CREATE INDEX "queue_entries_barber_lane_idx" ON "queue_entries" USING btree ("barber_id","status","order_at");