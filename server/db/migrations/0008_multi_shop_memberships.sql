ALTER TYPE "public"."member_role" ADD VALUE 'RECEPTIONIST';--> statement-breakpoint
ALTER TABLE "shop_members" DROP CONSTRAINT "shop_members_user_id_unique";--> statement-breakpoint
ALTER TABLE "shop_members" DROP CONSTRAINT "shop_members_shop_id_shops_id_fk";
--> statement-breakpoint
ALTER TABLE "shop_members" DROP CONSTRAINT "shop_members_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "shop_members" ADD CONSTRAINT "shop_members_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_members" ADD CONSTRAINT "shop_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shop_members_user_id_idx" ON "shop_members" USING btree ("user_id");