ALTER TABLE `auditLogs` MODIFY COLUMN `metadata` text NOT NULL DEFAULT ('{}');--> statement-breakpoint
ALTER TABLE `incidentEvents` MODIFY COLUMN `metadata` text NOT NULL DEFAULT ('{}');--> statement-breakpoint
ALTER TABLE `incidents` MODIFY COLUMN `structuredAnswers` text NOT NULL DEFAULT ('{}');