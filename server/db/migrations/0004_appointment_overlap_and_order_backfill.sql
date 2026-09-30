-- Custom migration: things Drizzle can't declare in the schema.

-- Existing queue entries keep their order: order by when they joined.
UPDATE "queue_entries" SET "order_at" = "joined_at";--> statement-breakpoint

-- A barber can't have two active appointments at overlapping times.
-- btree_gist lets a GiST exclusion constraint compare barber_id with "=".
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_no_overlap_per_barber"
  EXCLUDE USING gist ("barber_id" WITH =, tstzrange("starts_at", "ends_at") WITH &&)
  WHERE ("status" IN ('BOOKED', 'CHECKED_IN'));
