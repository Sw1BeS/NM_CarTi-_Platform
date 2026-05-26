# Product Knowledge

Generated: 2026-05-26T16:09:01.043Z
Root: `/srv/cartie`
Git: `bd69ae0`

## Product take

Cartie is a B2B automotive operations product with a Telegram/MiniApp front door, inventory/listing management, leads and requests, partner/dealer flows, and admin/superadmin operations.

## Main surfaces

- Public buyer/request surfaces: `/p/request`, `/p/app`, `/p/app/:slug`, `/p/dealer`, `/p/proposal/:id`.
- Internal app surfaces: inbox, requests, Telegram, leads, search, inventory, companies, entities, settings, content, calendar, partners, integrations, QA, health, superadmin.
- Server surfaces: `/api/telegram`, `/api/miniapp`, `/api/public`, `/api/inventory`, `/api/requests`, `/api/companies`, `/api/integrations`, `/api/b2b`, `/api/superadmin`, `/api/v2`.

## Domain backbone

- Workspaces/Auth: PartnerUser, BotSession, Workspace, GlobalUser, Membership
- CRM/Requests: Lead, LeadIdentity, LeadActivity, BotMessage, B2bRequest, RequestVariant, B2bAccessRequest, MessageLog, Pipeline, PipelineStage, Contact, Case
- Inventory/Vehicles: CompanyTemplate, CarListing, ChannelSource, AutomationSourceRef, ImportSource, PartnerCompany, RecordExternalKey, IngestionSource
- Telegram/MiniApp: Showcase, BotConfig, BotMessage, MiniAppFavorite, MTProtoConnector, ChannelSource, TelegramDestination, TelegramImportJob, ChannelPost, BotSession, TelegramUpdate, Channel
- Content/Automation: ScenarioTemplate, CompanyTemplate, Template, PlatformEvent, Scenario, Campaign, SystemSettings, ParserDefinition, ParserVersion, RawDocument
- Other: Integration, ChatMacro, ChatNote, Draft, PublicationJob, PublicationResult, IntegrationEventLog, QuotaUsage, SupportTicket, PublicSequence, ParsingJob, ScheduledJob

## Current strategic artifacts

- `NERD-METHOD_СarTie_SalesDrive_Meta_Roadmap_.pdf` is present as a product/business artifact. Decide whether it belongs in versioned docs or external product storage.
