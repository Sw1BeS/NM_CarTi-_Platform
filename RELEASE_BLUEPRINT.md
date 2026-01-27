# Release Blueprint: MП_Cartie_Final_UA

This document defines the architecture and processes for the **Release Version** of the platform.
It serves as the **Single Source of Truth** for data integrity and flow.

## 1. Core Principles

*   **Canonical Entities (Legacy Mode):** For this release, we prioritize stability over architectural purity. The "Legacy" tables are the source of truth for the bot and CRM logic.
*   **Dual Write Strategy:** Where V4.1 tables exist (e.g., `Contact`), they are populated *as a side effect* but not read from by the core UI.
*   **Tenancy:** All entities must belong to a `Workspace` (referenced as `companyId` in legacy tables).
*   **Auth:** JWT-based, stateless, but with a hydration step on `/me` to ensure full user context (roles, workspace settings).

## 2. Canonical Entities (The "Truth")

| Entity | DB Table (Legacy) | Description | Key Relations |
| :--- | :--- | :--- | :--- |
| **Workspace** | `Workspace` (mapped to `workspaces`) | The tenant/company. | `id` = `companyId` in other tables. |
| **User** | `GlobalUser` (mapped to `users`) | The system user. | `id`, `companyId`, `role`. |
| **Partner** | `PartnerCompany` | B2B Dealer/Partner. | `companyId` (owner), `users` (PartnerUser). |
| **Lead** | `Lead` | A potential customer or contact. | `botId`, `userTgId`, `phone`, `status`. |
| **Request** | `B2bRequest` | A Buy/Sell request. | `companyId`, `status`, `type` (via title/desc analysis or tag). |
| **Conversation** | `BotMessage` | The chat history. | `botId`, `chatId`, `requestId` (via `MessageLog`). |
| **Inventory** | `CarListing` | A vehicle for sale. | `companyId`, `price`, `year`, `status`. |
| **Variant** | `RequestVariant` | A specific car proposed for a request. | `requestId`, `status`, `price`. |
| **Proposal** | `Request` + `RequestVariant` | Public view of variants. | Accessed via `/p/proposal/:id`. |
| **Content** | `Draft` | Social media post draft. | `botId`, `scheduledAt`, `status`. |
| **Channel** | `ChannelSource` (MTProto) | Source of inventory ingestion. | `connectorId`, `channelId`. |

## 3. End-to-End Scenarios (Critical Paths)

### Scenario 1: Inbox to Lead to Request
1.  **Trigger:** User messages a connected Telegram bot.
2.  **System:**
    *   Bot receives webhook/poll.
    *   `BotMessage` created.
    *   `enrichContext` middleware checks for existing `Lead`.
    *   If no lead, creates `Lead` (Status: NEW).
3.  **User (Manager):**
    *   Opens `/inbox`.
    *   Sees conversation.
    *   Clicks "Create Request" (Buy or Sell).
4.  **System:**
    *   Creates `B2bRequest` linked to `Lead`.
    *   Redirects to `/requests/:id`.

### Scenario 2: Inventory Ingestion & Proposal
1.  **Trigger:** MTProto worker detects new post in monitored channel.
2.  **System:**
    *   Parses text (price, year, model).
    *   Creates `CarListing` (Status: AVAILABLE).
    *   (Optional) Creates `Draft` for re-posting.
3.  **User (Manager):**
    *   Opens `/requests/:id` (A "Buy" request).
    *   Clicks "Add Variant".
    *   Selects from Inventory (`CarListing`).
    *   Generates Proposal Link (`/p/proposal/:id`).
4.  **Client:**
    *   Opens link.
    *   Likes/Dislikes variants.
    *   Feedback saved to `RequestVariant` status.

### Scenario 3: Content Publishing
1.  **User (Manager):**
    *   Opens `/content`.
    *   Creates new `Draft` (or edits existing from Inventory).
    *   Sets schedule.
2.  **System:**
    *   Background worker picks up due `Draft`.
    *   Uses `BotEngine` to publish to configured Telegram Channel.
    *   Updates `Draft` status to POSTED.

## 4. Release Constraints
*   **Hidden:** Marketplace, Deep Analytics, "Superadmin" complex flows.
*   **Fixed:** `apiRoutes.ts` stability, Auth context loss.
