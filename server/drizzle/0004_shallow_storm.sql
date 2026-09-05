CREATE TABLE `dlsite_download` (
	`workno` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`kind` text,
	`total_bytes` integer,
	`downloaded_bytes` integer DEFAULT 0 NOT NULL,
	`file_path` text,
	`error` text,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`workno`) REFERENCES `dlsite_work`(`workno`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `dlsite_work` ADD `content_size` integer;--> statement-breakpoint
ALTER TABLE `dlsite_work` ADD `downloadable` integer DEFAULT true NOT NULL;