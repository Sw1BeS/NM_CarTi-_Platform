# Data Model Map

Generated: 2026-05-26T16:09:01.043Z
Root: `/srv/cartie`
Git: `bd69ae0`

Datasource: `db`
Generator: `client`

Models: 90. Enums: 22.

## Model groups

| Domain | Count | Models |
| --- | --- | --- |
| Workspaces/Auth | 5 | `PartnerUser`, `BotSession`, `Workspace`, `GlobalUser`, `Membership` |
| CRM/Requests | 16 | `Lead`, `LeadIdentity`, `LeadActivity`, `BotMessage`, `B2bRequest`, `RequestVariant`, `B2bAccessRequest`, `MessageLog`, `Pipeline`, `PipelineStage`, `Contact`, `Case`, `CaseContactLink`, `Conversation`, `Message`, `MessageDelivery` |
| Inventory/Vehicles | 8 | `CompanyTemplate`, `CarListing`, `ChannelSource`, `AutomationSourceRef`, `ImportSource`, `PartnerCompany`, `RecordExternalKey`, `IngestionSource` |
| Telegram/MiniApp | 12 | `Showcase`, `BotConfig`, `BotMessage`, `MiniAppFavorite`, `MTProtoConnector`, `ChannelSource`, `TelegramDestination`, `TelegramImportJob`, `ChannelPost`, `BotSession`, `TelegramUpdate`, `Channel` |
| Content/Automation | 10 | `ScenarioTemplate`, `CompanyTemplate`, `Template`, `PlatformEvent`, `Scenario`, `Campaign`, `SystemSettings`, `ParserDefinition`, `ParserVersion`, `RawDocument` |
| Other | 43 | `Integration`, `ChatMacro`, `ChatNote`, `Draft`, `PublicationJob`, `PublicationResult`, `IntegrationEventLog`, `QuotaUsage`, `SupportTicket`, `PublicSequence`, `ParsingJob`, `ScheduledJob`, `OrchestrationPolicy`, `AutomationIntake`, `AutomationSkillPack`, `AutomationRun`, `AutomationRunStep`, `ImportBatch`, `ImportItem`, `ImportLinkageCandidate`, `ImportRecommendedAction`, `ImportWriteCandidate`, `AutomationReviewQueue`, `NormalizationAlias`, `SystemLog`, `EntityDefinition`, `EntityField`, `EntityRecord`, `Account`, `EntityType`, `FieldDefinition`, `Record`, `RecordSearchIndex`, `RelationType`, `RecordRelation`, `DictionarySet`, `DictionaryEntry`, `DictionaryAlias`, `Identity`, `IngestionJob`, `ExtractedEntity`, `FormDefinition`, `ViewDefinition` |

## Enums

| Enum |
| --- |
| `BotTemplate` |
| `BotDeliveryMode` |
| `LeadStatus` |
| `MessageDirection` |
| `RequestStatus` |
| `RequestType` |
| `VariantStatus` |
| `RequesterDecision` |
| `FitQueueStatus` |
| `AccessRequestStatus` |
| `ExternalSourceProvider` |
| `VehicleAvailabilityState` |
| `VehiclePublicationStatus` |
| `PartnerUserRole` |
| `SupportTicketStatus` |
| `DraftSource` |
| `ScenarioStatus` |
| `NormalizationType` |
| `IntegrationType` |
| `CompanyPlan` |
| `UserRole` |
| `FieldType` |
