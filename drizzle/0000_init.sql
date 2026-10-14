CREATE TABLE `account_owners` (
	`account_id` text NOT NULL,
	`person_id` text NOT NULL,
	PRIMARY KEY(`account_id`, `person_id`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `persons`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`institution` text DEFAULT '' NOT NULL,
	`type` text NOT NULL,
	`pension_kind` text,
	`notes` text DEFAULT '' NOT NULL,
	`closed_at` text
);
--> statement-breakpoint
CREATE TABLE `persons` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `balance_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`balance` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_account_date` ON `balance_snapshots` (`account_id`,`date`);--> statement-breakpoint
CREATE TABLE `subscription_owners` (
	`subscription_id` text NOT NULL,
	`person_id` text NOT NULL,
	PRIMARY KEY(`subscription_id`, `person_id`),
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `persons`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`provider` text DEFAULT '' NOT NULL,
	`category` text NOT NULL,
	`amount` integer NOT NULL,
	`billing` text NOT NULL,
	`term_months` integer NOT NULL,
	`renewal` text NOT NULL,
	`notice_months` integer,
	`end_date` text,
	`notes` text DEFAULT '' NOT NULL
);
