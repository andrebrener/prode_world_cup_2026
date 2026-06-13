CREATE TABLE `card_defs` (
	`id` text PRIMARY KEY NOT NULL,
	`pool_id` text NOT NULL,
	`mechanic` text NOT NULL,
	`name` text NOT NULL,
	`emoji` text NOT NULL,
	`description` text NOT NULL,
	`rarity` text NOT NULL,
	`weight` integer DEFAULT 1 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`pool_id`) REFERENCES `pools`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `pool_fun_config` (
	`pool_id` text PRIMARY KEY NOT NULL,
	`no_effect_share` integer DEFAULT 40 NOT NULL,
	`weight_comun` integer DEFAULT 50 NOT NULL,
	`weight_rara` integer DEFAULT 26 NOT NULL,
	`weight_legendaria` integer DEFAULT 9 NOT NULL,
	`weight_maldicion` integer DEFAULT 15 NOT NULL,
	FOREIGN KEY (`pool_id`) REFERENCES `pools`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `fun_cards` ADD `card_def_id` text REFERENCES card_defs(id);--> statement-breakpoint
ALTER TABLE `pool_members` ADD `role` text DEFAULT 'player' NOT NULL;