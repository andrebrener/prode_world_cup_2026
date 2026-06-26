DROP INDEX "fun_cards_one_draw_per_day";--> statement-breakpoint
DROP INDEX "participants_name_lower_unique";--> statement-breakpoint
DROP INDEX "pools_slug_unique";--> statement-breakpoint
DROP INDEX "pools_code_unique";--> statement-breakpoint
DROP INDEX "push_subscriptions_endpoint_unique";--> statement-breakpoint
ALTER TABLE `pool_fun_config` ALTER COLUMN "weight_rara" TO "weight_rara" integer NOT NULL DEFAULT 25;--> statement-breakpoint
CREATE UNIQUE INDEX `fun_cards_one_draw_per_day` ON `fun_cards` (`pool_id`,`participant_id`,`draw_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `participants_name_lower_unique` ON `participants` (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `pools_slug_unique` ON `pools` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `pools_code_unique` ON `pools` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
ALTER TABLE `pool_fun_config` ALTER COLUMN "weight_legendaria" TO "weight_legendaria" integer NOT NULL DEFAULT 10;--> statement-breakpoint
ALTER TABLE `pool_fun_config` ADD `pos_remontada_bottom` integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE `pool_fun_config` ADD `pos_golpe_podio` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `pool_fun_config` ADD `pos_caparazon_odds` integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE `pool_fun_config` ADD `pos_golpe_odds` integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE `pool_fun_config` ADD `pos_remontada_odds` integer DEFAULT 5 NOT NULL;