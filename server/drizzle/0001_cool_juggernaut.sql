CREATE TABLE `dlsite_content_count` (
	`account_id` integer PRIMARY KEY NOT NULL,
	`user_count` integer NOT NULL,
	`production_count` integer DEFAULT 0 NOT NULL,
	`synced_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `dlsite_account`(`id`) ON UPDATE no action ON DELETE cascade
);
