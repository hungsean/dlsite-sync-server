PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_dlsite_download` (
	`workno` text PRIMARY KEY NOT NULL,
	`account_id` integer,
	`status` text DEFAULT 'queued' NOT NULL,
	`kind` text,
	`total_bytes` integer,
	`downloaded_bytes` integer DEFAULT 0 NOT NULL,
	`file_path` text,
	`error` text,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`account_id`) REFERENCES `dlsite_account`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`workno`) REFERENCES `dlsite_work`(`workno`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_dlsite_download`(`workno`, `account_id`, `status`, `kind`, `total_bytes`, `downloaded_bytes`, `file_path`, `error`, `updated_at`, `completed_at`) SELECT `workno`, `account_id`, `status`, `kind`, `total_bytes`, `downloaded_bytes`, `file_path`, `error`, `updated_at`, `completed_at` FROM `dlsite_download`;--> statement-breakpoint
DROP TABLE `dlsite_download`;--> statement-breakpoint
ALTER TABLE `__new_dlsite_download` RENAME TO `dlsite_download`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
