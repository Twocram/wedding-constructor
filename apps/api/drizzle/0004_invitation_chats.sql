CREATE TABLE `invitation_chats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invitation_id` integer NOT NULL,
	`chat_id` integer NOT NULL,
	`name` text NOT NULL,
	`username` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`invitation_id`) REFERENCES `invitations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitation_chats_unique` ON `invitation_chats` (`invitation_id`,`chat_id`);--> statement-breakpoint
CREATE INDEX `invitation_chats_chat_idx` ON `invitation_chats` (`chat_id`);--> statement-breakpoint
ALTER TABLE `invitations` ADD `notify_token` text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `invitations` SET `notify_token` = lower(hex(randomblob(16))) WHERE `notify_token` = '';--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_notify_token_unique` ON `invitations` (`notify_token`);