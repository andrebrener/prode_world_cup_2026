CREATE TABLE `bracket_meta` (
	`id` integer PRIMARY KEY NOT NULL,
	`generated_at` integer NOT NULL,
	`r32_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `extra_predictions` (
	`participant_id` text PRIMARY KEY NOT NULL,
	`champion` text,
	`runner_up` text,
	`top_scorer` text,
	`figure` text,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `fun_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`pool_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`draw_date` text NOT NULL,
	`card_type` text NOT NULL,
	`status` text DEFAULT 'held' NOT NULL,
	`drawn_at` integer NOT NULL,
	`played_at` integer,
	`target_participant_id` text,
	`effect_match_id` text,
	`effect_date` text,
	`payload` text,
	`reflected` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`pool_id`) REFERENCES `pools`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fun_cards_one_draw_per_day` ON `fun_cards` (`pool_id`,`participant_id`,`draw_date`);--> statement-breakpoint
CREATE TABLE `knockout_predictions` (
	`participant_id` text NOT NULL,
	`match_id` text NOT NULL,
	`home_goals` integer NOT NULL,
	`away_goals` integer NOT NULL,
	`advance` text NOT NULL,
	PRIMARY KEY(`participant_id`, `match_id`),
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `knockout_results` (
	`match_id` text PRIMARY KEY NOT NULL,
	`home_goals` integer NOT NULL,
	`away_goals` integer NOT NULL,
	`penalties` integer DEFAULT false NOT NULL,
	`pen_winner` text
);
--> statement-breakpoint
CREATE TABLE `match_predictions` (
	`participant_id` text NOT NULL,
	`match_id` text NOT NULL,
	`home_goals` integer NOT NULL,
	`away_goals` integer NOT NULL,
	PRIMARY KEY(`participant_id`, `match_id`),
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `match_results` (
	`match_id` text PRIMARY KEY NOT NULL,
	`home_goals` integer NOT NULL,
	`away_goals` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `participants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`avatar` text,
	`email` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `participants_name_lower_unique` ON `participants` (lower("name"));--> statement-breakpoint
CREATE TABLE `pool_members` (
	`pool_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`pool_id`, `participant_id`),
	FOREIGN KEY (`pool_id`) REFERENCES `pools`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `pools` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`code` text NOT NULL,
	`is_public` integer DEFAULT false NOT NULL,
	`mode` text DEFAULT 'normal' NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pools_slug_unique` ON `pools` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `pools_code_unique` ON `pools` (`code`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`participant_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE TABLE `tournament_result` (
	`id` integer PRIMARY KEY NOT NULL,
	`champion` text,
	`runner_up` text,
	`top_scorer` text,
	`figure` text
);
