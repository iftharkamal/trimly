CREATE TYPE "public"."member_role" AS ENUM('OWNER', 'BARBER');--> statement-breakpoint
CREATE TABLE "shop_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_members_shop_user_unique" UNIQUE("shop_id","user_id"),
	CONSTRAINT "shop_members_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "shops" DROP CONSTRAINT "shops_owner_user_id_unique";--> statement-breakpoint
ALTER TABLE "shops" DROP CONSTRAINT "shops_owner_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "phone_number" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "phone_number_verified" boolean;--> statement-breakpoint
ALTER TABLE "shop_members" ADD CONSTRAINT "shop_members_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_members" ADD CONSTRAINT "shop_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shop_members_one_owner_per_shop" ON "shop_members" USING btree ("shop_id") WHERE "shop_members"."role" = 'OWNER';--> statement-breakpoint
-- Every existing shop owner becomes the OWNER member of their shop, before the column goes.
INSERT INTO "shop_members" ("shop_id", "user_id", "role") SELECT "id", "owner_user_id", 'OWNER' FROM "shops";--> statement-breakpoint
ALTER TABLE "shops" DROP COLUMN "owner_user_id";--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_phone_number_unique" UNIQUE("phone_number");