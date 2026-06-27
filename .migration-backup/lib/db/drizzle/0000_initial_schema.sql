CREATE TABLE "announcements" (
        "id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "title" text NOT NULL,
        "content" text NOT NULL,
        "target_audience" text DEFAULT 'all' NOT NULL,
        "badge_text" text,
        "is_active" boolean DEFAULT true NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_details" (
        "driver_id" text PRIMARY KEY NOT NULL,
        "wilaya" text DEFAULT '' NOT NULL,
        "commune" text DEFAULT '' NOT NULL,
        "truck_front_photo_url" text,
        "driver_license_url" text,
        "truck_video_url" text,
        "truck_side_photo_url" text
);
--> statement-breakpoint
CREATE TABLE "driver_status" (
        "driver_id" text PRIMARY KEY NOT NULL,
        "current_status" text DEFAULT 'مغلق' NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
        "id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" text NOT NULL,
        "driver_id" text,
        "water_volume" text NOT NULL,
        "barrel_count" integer DEFAULT 0 NOT NULL,
        "total_price" numeric NOT NULL,
        "latitude" text,
        "longitude" text,
        "status" text DEFAULT 'معلق' NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ratings" (
        "id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "order_id" text NOT NULL,
        "rater_user_id" text NOT NULL,
        "rated_user_id" text NOT NULL,
        "rater_type" text NOT NULL,
        "stars" integer NOT NULL,
        "dispute_reason" text,
        "is_disputed" boolean DEFAULT false NOT NULL,
        "dispute_count" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_payments" (
        "id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "driver_id" text NOT NULL,
        "receipt_image" text NOT NULL,
        "status" text DEFAULT 'pending' NOT NULL,
        "admin_notes" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "reviewed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "users" (
        "id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" text NOT NULL,
        "email" text NOT NULL,
        "phone" text NOT NULL,
        "password_hash" text NOT NULL,
        "user_type" text NOT NULL,
        "wilaya" text DEFAULT '' NOT NULL,
        "commune" text DEFAULT '' NOT NULL,
        "account_status" text DEFAULT 'pending' NOT NULL,
        "subscription_expires_at" timestamp,
        "free_trial_claimed" boolean DEFAULT false NOT NULL,
        CONSTRAINT "users_email_unique" UNIQUE("email"),
        CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
