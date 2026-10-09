ALTER TABLE "barbers" ADD COLUMN "member_id" uuid;--> statement-breakpoint
ALTER TABLE "barbers" ADD COLUMN "invite_phone" text;--> statement-breakpoint
ALTER TABLE "barbers" ADD CONSTRAINT "barbers_member_id_shop_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."shop_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "barbers_member_id_unique" ON "barbers" USING btree ("member_id") WHERE "barbers"."member_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "barbers_shop_invite_phone_unique" ON "barbers" USING btree ("shop_id","invite_phone") WHERE "barbers"."invite_phone" is not null;--> statement-breakpoint
CREATE INDEX "barbers_invite_phone_idx" ON "barbers" USING btree ("invite_phone") WHERE "barbers"."invite_phone" is not null;--> statement-breakpoint
-- Existing shops: onboarding gave the owner a chair under their own name. Link it to the
-- owner's membership when exactly one barber in the shop has that name.
UPDATE "barbers" AS b SET "member_id" = m."id"
FROM "shop_members" AS m JOIN "user" AS u ON u."id" = m."user_id"
WHERE m."role" = 'OWNER'
  AND b."shop_id" = m."shop_id"
  AND b."name" = u."name"
  AND (SELECT count(*) FROM "barbers" AS same WHERE same."shop_id" = m."shop_id" AND same."name" = u."name") = 1;
