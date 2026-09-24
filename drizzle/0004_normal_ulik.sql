CREATE TABLE `agencyNotifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`incidentId` int NOT NULL,
	`organizationId` int NOT NULL,
	`channel` enum('in_app','sms','voice','webhook') NOT NULL DEFAULT 'in_app',
	`deliveryStatus` enum('queued','sent','failed','acknowledged') NOT NULL DEFAULT 'queued',
	`deliveryProvider` varchar(64) DEFAULT 'pending_connector',
	`destination` varchar(220) NOT NULL,
	`payload` text NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`sentAt` timestamp,
	CONSTRAINT `agencyNotifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `agency_notification_unique_idx` UNIQUE(`incidentId`,`organizationId`,`channel`)
);
--> statement-breakpoint
ALTER TABLE `organizations` ADD `latitude` varchar(32);--> statement-breakpoint
ALTER TABLE `organizations` ADD `longitude` varchar(32);--> statement-breakpoint
ALTER TABLE `agencyNotifications` ADD CONSTRAINT `agencyNotifications_incidentId_incidents_id_fk` FOREIGN KEY (`incidentId`) REFERENCES `incidents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agencyNotifications` ADD CONSTRAINT `agencyNotifications_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `agency_notification_incident_idx` ON `agencyNotifications` (`incidentId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `agency_notification_org_idx` ON `agencyNotifications` (`organizationId`,`deliveryStatus`,`createdAt`);