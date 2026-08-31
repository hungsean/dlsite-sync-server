CREATE TABLE `dlsite_account` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`login_id` text NOT NULL,
	`password_enc` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dlsite_account_login_id_unique` ON `dlsite_account` (`login_id`);--> statement-breakpoint
CREATE TABLE `dlsite_session` (
	`account_id` integer PRIMARY KEY NOT NULL,
	`cookie_jar` text NOT NULL,
	`is_valid` integer DEFAULT false NOT NULL,
	`last_validated_at` integer,
	FOREIGN KEY (`account_id`) REFERENCES `dlsite_account`(`id`) ON UPDATE no action ON DELETE cascade
);
