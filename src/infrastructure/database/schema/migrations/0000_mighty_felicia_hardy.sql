CREATE TABLE `accessTokens` (
	`id` text(32) PRIMARY KEY NOT NULL,
	`userId` text(32),
	`teamId` text(32),
	`type` text(16) NOT NULL,
	`name` text(32),
	`hash` text(100) NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`lastUsedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`expiresAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `audiences` (
	`id` text(32) PRIMARY KEY NOT NULL,
	`name` text(50) NOT NULL,
	`teamId` text(32) NOT NULL,
	FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `automationSteps` (
	`id` text(32) PRIMARY KEY NOT NULL,
	`automationId` text(32) NOT NULL,
	`name` text(50) NOT NULL,
	`description` text(512),
	`type` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`subtype` text NOT NULL,
	`parentId` text(32),
	`branchIndex` integer,
	`configuration` text NOT NULL,
	FOREIGN KEY (`automationId`) REFERENCES `automations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parentId`) REFERENCES `automationSteps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `automations` (
	`id` text(32) PRIMARY KEY NOT NULL,
	`name` text(50) NOT NULL,
	`description` text(512),
	`audienceId` text(32) NOT NULL,
	FOREIGN KEY (`audienceId`) REFERENCES `audiences`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `contactAutomationSteps` (
	`id` text(32) PRIMARY KEY NOT NULL,
	`automationStepId` text(32) NOT NULL,
	`contactId` text(32) NOT NULL,
	`haltedAt` integer,
	`failedAt` integer,
	`startedAt` integer,
	`completedAt` integer,
	`output` text,
	FOREIGN KEY (`automationStepId`) REFERENCES `automationSteps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text(32) PRIMARY KEY NOT NULL,
	`firstName` text(50),
	`lastName` text(50),
	`email` text(80) NOT NULL,
	`avatarUrl` text(256),
	`subscribedAt` integer,
	`unsubscribedAt` integer,
	`audienceId` text(32) NOT NULL,
	`attributes` text,
	FOREIGN KEY (`audienceId`) REFERENCES `audiences`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `mailerIdentities` (
	`id` text(32) PRIMARY KEY NOT NULL,
	`mailerId` text(32),
	`value` text(50) NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`configuration` text,
	`confirmedApprovalAt` integer,
	FOREIGN KEY (`mailerId`) REFERENCES `mailers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `mailers` (
	`id` text(32) PRIMARY KEY NOT NULL,
	`name` text(50) NOT NULL,
	`configuration` text(512) NOT NULL,
	`default` integer,
	`provider` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`teamId` text(512) NOT NULL,
	`sendingEnabled` integer DEFAULT false NOT NULL,
	`inSandboxMode` integer DEFAULT true NOT NULL,
	`max24HourSend` integer,
	`maxSendRate` integer,
	`sentLast24Hours` integer,
	`testEmailSentAt` integer,
	`installationCompletedAt` integer,
	FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text(32) PRIMARY KEY NOT NULL,
	`url` text(256),
	`domain` text(50) NOT NULL,
	`installedSslCertificate` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text(32) PRIMARY KEY NOT NULL,
	`name` text(256) NOT NULL,
	`description` text(256),
	`audienceId` text(32) NOT NULL,
	FOREIGN KEY (`audienceId`) REFERENCES `audiences`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tagsOnContacts` (
	`tagId` text(32) NOT NULL,
	`contactId` text(32) NOT NULL,
	`assignedAt` integer,
	FOREIGN KEY (`tagId`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `teamMemberships` (
	`id` text(32) PRIMARY KEY NOT NULL,
	`userId` text(32),
	`email` text(50) NOT NULL,
	`teamId` text(32) NOT NULL,
	`role` text,
	`invitedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`expiresAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text(32) PRIMARY KEY NOT NULL,
	`name` text(100) NOT NULL,
	`userId` text(32) NOT NULL,
	`trackClicks` integer,
	`trackOpens` integer,
	`configurationKey` text(512) NOT NULL,
	`broadcastEditor` text,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text(32) PRIMARY KEY NOT NULL,
	`email` text(80) NOT NULL,
	`name` text(80),
	`avatarUrl` text(256),
	`password` text(256) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `webhooks` (
	`id` text(32) PRIMARY KEY NOT NULL,
	`name` text(50) NOT NULL,
	`url` text(256) NOT NULL,
	`webhookEvent` text,
	`teamId` text(32) NOT NULL,
	FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Contact_email_audienceId_key` ON `contacts` (`email`,`audienceId`);--> statement-breakpoint
CREATE UNIQUE INDEX `mailers_teamId_unique` ON `mailers` (`teamId`);--> statement-breakpoint
CREATE UNIQUE INDEX `settings_url_unique` ON `settings` (`url`);--> statement-breakpoint
CREATE UNIQUE INDEX `settings_domain_unique` ON `settings` (`domain`);--> statement-breakpoint
CREATE UNIQUE INDEX `tagsOnContactsTagIdContactIdKey` ON `tagsOnContacts` (`tagId`,`contactId`);--> statement-breakpoint
CREATE INDEX `tagsOnContactsTagIdContactIdIdx` ON `tagsOnContacts` (`tagId`,`contactId`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);