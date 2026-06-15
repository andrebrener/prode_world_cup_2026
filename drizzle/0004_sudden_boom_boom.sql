CREATE TABLE `pool_day_rank` (
	`pool_id` text NOT NULL,
	`date` text NOT NULL,
	`participant_id` text NOT NULL,
	`rank` integer NOT NULL,
	`total` integer NOT NULL,
	PRIMARY KEY(`pool_id`, `date`, `participant_id`),
	FOREIGN KEY (`pool_id`) REFERENCES `pools`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade
);
