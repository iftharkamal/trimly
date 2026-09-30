ALTER TABLE "customers" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "service_buffer_minutes" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
CREATE INDEX "queue_entries_barber_ended_idx" ON "queue_entries" USING btree ("barber_id","ended_at");--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_service_buffer_non_negative" CHECK ("shops"."service_buffer_minutes" >= 0);