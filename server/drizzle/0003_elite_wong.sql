CREATE TABLE `dlsite_account_work` (
	`account_id` integer NOT NULL,
	`workno` text NOT NULL,
	`sales_date` text,
	`synced_at` integer NOT NULL,
	PRIMARY KEY(`account_id`, `workno`),
	FOREIGN KEY (`account_id`) REFERENCES `dlsite_account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workno`) REFERENCES `dlsite_work`(`workno`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `dlsite_work` (
	`workno` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`maker_name` text,
	`work_type` text,
	`age_category` text,
	`thumbnail_url` text,
	`regist_date` text,
	`update_date` text,
	`raw` text NOT NULL,
	`updated_at` integer NOT NULL
);
