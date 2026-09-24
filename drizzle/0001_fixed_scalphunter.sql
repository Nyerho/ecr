CREATE TABLE `auditLogs` (
		`id` int AUTO_INCREMENT NOT NULL,
		`actorUserId` int,
		`action` varchar(96) NOT NULL,
		`resourceType` varchar(64) NOT NULL,
		`resourceId` varchar(64),
		`requestId` varchar(96),
		`metadata` text NOT NULL,
		`createdAt` timestamp NOT NULL DEFAULT (now()),
		CONSTRAINT `auditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `idempotencyKeys` (
		`id` int AUTO_INCREMENT NOT NULL,
		`userId` int NOT NULL,
		`commandKey` varchar(96) NOT NULL,
		`incidentId` int,
		`createdAt` timestamp NOT NULL DEFAULT (now()),
		CONSTRAINT `idempotencyKeys_id` PRIMARY KEY(`id`),
		CONSTRAINT `idempotency_user_command_idx` UNIQUE(`userId`,`commandKey`)
);
--> statement-breakpoint
CREATE TABLE `incidentEvents` (
		`id` int AUTO_INCREMENT NOT NULL,
		`incidentId` int NOT NULL,
		`actorUserId` int,
		`eventType` enum('created','received','triaged','routed','assigned','status_changed','note','closed') NOT NULL,
		`fromStatus` varchar(40),
		`toStatus` varchar(40),
		`note` text,
		`metadata` text NOT NULL,
		`createdAt` timestamp NOT NULL DEFAULT (now()),
		CONSTRAINT `incidentEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `incidents` (
		`id` int AUTO_INCREMENT NOT NULL,
		`publicReference` varchar(32) NOT NULL,
		`reporterUserId` int NOT NULL,
		`category` enum('medical','fire','security','road_accident','disaster','rescue','missing_person','other') NOT NULL,
		`status` enum('submitted','received','triaged','assigned','responding','arrived','resolved','cancelled','duplicate','unable_to_verify','escalated','closed') NOT NULL DEFAULT 'submitted',
		`priority` enum('critical','high','medium','low') NOT NULL DEFAULT 'medium',
		`description` text NOT NULL,
		`structuredAnswers` text NOT NULL,
		`latitude` varchar(32),
		`longitude` varchar(32),
		`locationLabel` varchar(220),
		`locationSource` enum('device','manual','operator','unknown') NOT NULL DEFAULT 'manual',
		`assignedOrganizationId` int,
		`assignedResponderId` int,
		`version` int NOT NULL DEFAULT 1,
		`createdAt` timestamp NOT NULL DEFAULT (now()),
		`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
		`resolvedAt` timestamp,
		CONSTRAINT `incidents_id` PRIMARY KEY(`id`),
		CONSTRAINT `incidents_publicReference_unique` UNIQUE(`publicReference`)
);
--> statement-breakpoint
CREATE TABLE `jurisdictions` (
		`id` int AUTO_INCREMENT NOT NULL,
		`code` varchar(32) NOT NULL,
		`name` varchar(160) NOT NULL,
		`level` enum('national','state','lga','community') NOT NULL,
		`isActive` boolean NOT NULL DEFAULT true,
		`createdAt` timestamp NOT NULL DEFAULT (now()),
		CONSTRAINT `jurisdictions_id` PRIMARY KEY(`id`),
		CONSTRAINT `jurisdictions_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `organizationMemberships` (
		`id` int AUTO_INCREMENT NOT NULL,
		`userId` int NOT NULL,
		`organizationId` int NOT NULL,
		`membershipRole` enum('dispatcher','coordinator','responder','community_responder') NOT NULL,
		`isActive` boolean NOT NULL DEFAULT true,
		`createdAt` timestamp NOT NULL DEFAULT (now()),
		CONSTRAINT `organizationMemberships_id` PRIMARY KEY(`id`),
		CONSTRAINT `membership_user_org_idx` UNIQUE(`userId`,`organizationId`)
);
--> statement-breakpoint
CREATE TABLE `organizations` (
		`id` int AUTO_INCREMENT NOT NULL,
		`jurisdictionId` int,
		`name` varchar(180) NOT NULL,
		`type` enum('dispatch','police','fire','medical','disaster','community','other') NOT NULL,
		`code` varchar(48) NOT NULL,
		`isVerified` boolean NOT NULL DEFAULT false,
		`isActive` boolean NOT NULL DEFAULT true,
		`createdAt` timestamp NOT NULL DEFAULT (now()),
		CONSTRAINT `organizations_id` PRIMARY KEY(`id`),
		CONSTRAINT `organizations_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
ALTER TABLE `auditLogs` ADD CONSTRAINT `auditLogs_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `idempotencyKeys` ADD CONSTRAINT `idempotencyKeys_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `idempotencyKeys` ADD CONSTRAINT `idempotencyKeys_incidentId_incidents_id_fk` FOREIGN KEY (`incidentId`) REFERENCES `incidents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incidentEvents` ADD CONSTRAINT `incidentEvents_incidentId_incidents_id_fk` FOREIGN KEY (`incidentId`) REFERENCES `incidents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incidentEvents` ADD CONSTRAINT `incidentEvents_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incidents` ADD CONSTRAINT `incidents_reporterUserId_users_id_fk` FOREIGN KEY (`reporterUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incidents` ADD CONSTRAINT `incidents_assignedOrganizationId_organizations_id_fk` FOREIGN KEY (`assignedOrganizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incidents` ADD CONSTRAINT `incidents_assignedResponderId_users_id_fk` FOREIGN KEY (`assignedResponderId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organizationMemberships` ADD CONSTRAINT `organizationMemberships_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organizationMemberships` ADD CONSTRAINT `organizationMemberships_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organizations` ADD CONSTRAINT `organizations_jurisdictionId_jurisdictions_id_fk` FOREIGN KEY (`jurisdictionId`) REFERENCES `jurisdictions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_resource_idx` ON `auditLogs` (`resourceType`,`resourceId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_actor_idx` ON `auditLogs` (`actorUserId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `incident_timeline_idx` ON `incidentEvents` (`incidentId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `incident_status_queue_idx` ON `incidents` (`status`,`priority`,`createdAt`);--> statement-breakpoint
CREATE INDEX `incident_reporter_idx` ON `incidents` (`reporterUserId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `incident_assigned_org_idx` ON `incidents` (`assignedOrganizationId`,`status`);--> statement-breakpoint
CREATE INDEX `membership_user_active_idx` ON `organizationMemberships` (`userId`,`isActive`);
