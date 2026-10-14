PRAGMA foreign_keys=OFF;--> statement-breakpoint
-- The migrator runs inside a transaction where PRAGMA foreign_keys has no effect, so dropping
-- `subscriptions` would cascade-delete its owners. Keep a copy and restore it after the rebuild.
CREATE TABLE `__owners_backup` AS SELECT * FROM `subscription_owners`;--> statement-breakpoint
CREATE TABLE `__new_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`provider` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'subscription' NOT NULL,
	`category` text NOT NULL,
	`amount` integer NOT NULL,
	`billing` text NOT NULL,
	`term_months` integer NOT NULL,
	`renewal` text,
	`notice_months` integer,
	`end_date` text,
	`notes` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_subscriptions`("id", "name", "provider", "kind", "category", "amount", "billing", "term_months", "renewal", "notice_months", "end_date", "notes") SELECT "id", "name", "provider", 'subscription', "category", "amount", "billing", "term_months", "renewal", "notice_months", "end_date", "notes" FROM `subscriptions`;--> statement-breakpoint
DROP TABLE `subscriptions`;--> statement-breakpoint
ALTER TABLE `__new_subscriptions` RENAME TO `subscriptions`;--> statement-breakpoint
INSERT INTO `subscription_owners` SELECT * FROM `__owners_backup`;--> statement-breakpoint
DROP TABLE `__owners_backup`;--> statement-breakpoint
PRAGMA foreign_keys=ON;