ALTER TABLE `auditLogs` MODIFY COLUMN `metadata` text NOT NULL;--> statement-breakpoint
ALTER TABLE `incidentEvents` MODIFY COLUMN `metadata` text NOT NULL;--> statement-breakpoint
ALTER TABLE `incidents` MODIFY COLUMN `structuredAnswers` text NOT NULL;--> statement-breakpoint
ALTER TABLE `incidents` ADD `reporterPhone` varchar(32);--> statement-breakpoint
ALTER TABLE `incidents` ADD `reporterEmail` varchar(320);