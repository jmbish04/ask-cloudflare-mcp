CREATE TABLE IF NOT EXISTS `health_checks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`check_type` text NOT NULL,
	`status` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`steps_json` text NOT NULL,
	`error` text
);

