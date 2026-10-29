CREATE TABLE `tg_subscribers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chat_id` integer NOT NULL,
	`name` text NOT NULL,
	`username` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`approved_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tg_subscribers_chat_id_unique` ON `tg_subscribers` (`chat_id`);