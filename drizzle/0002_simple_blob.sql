CREATE TABLE `deck_tombstones` (
	`pool_id` text NOT NULL,
	`mechanic` text NOT NULL,
	PRIMARY KEY(`pool_id`, `mechanic`),
	FOREIGN KEY (`pool_id`) REFERENCES `pools`(`id`) ON UPDATE no action ON DELETE cascade
);
