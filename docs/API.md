# Cartie API Documentation

## Overview
This document lists the verified API endpoints for the Cartie platform.
**Base URL**: `/api`
**Authentication**: Bearer Token (JWT) required for all non-public routes.

## 1. Public Routes (`/api/public`)
*No authentication required.*

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/leads` | Create a new lead |
| POST | `/requests` | Create a B2B request |
| POST | `/requests/:id/variants` | Submit variants for a request |
| POST | `/dealer/session` | Dealer login/session init |
| GET | `/bots` | List public bot configurations |
| GET | `/requests` | List public requests (filtered) |
| GET | `/proposals/:id` | View proposal details |
| POST | `/proposals/:id/view` | Track proposal view |
| POST | `/proposals/:id/feedback` | Submit feedback on proposal |

## 2. Entity Management (`/api/v1/entities`)
*Requires: Authenticated User*

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/meta` | Get all entity definitions |
| POST | `/definitions` | Create entity definition |
| PUT | `/definitions/:slug` | Update entity definition |
| POST | `/definitions/:slug/archive` | Archive definition |
| GET | `/:slug/records` | List records for entity |
| POST | `/:slug/records` | Create record |
| GET | `/:slug/records/:id` | Get record details |
| PATCH | `/:slug/records/:id` | Update record (partial) |
| DELETE | `/:slug/records/:id` | Delete record |

## 3. Core API (`/api`)
*Requires: Authenticated User (Role restrictions apply)*

### Bots & Communication
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/bots` | List bots |
| POST | `/bots` | Create bot |
| PUT | `/bots/:id` | Update bot |
| DELETE | `/bots/:id` | Delete bot |
| POST | `/bots/:id/webhook` | Set webhook |
| DELETE | `/bots/:id/webhook` | Remove webhook |
| POST | `/telegram/call` | Proxy Telegram API call |
| GET | `/messages` | List messages |
| POST | `/messages` | Send/Store message |
| GET | `/messages/logs` | Message audit logs |
| POST | `/messages/send` | Send message to channel/user |

### Scenarios
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/scenarios` | List scenarios |
| POST | `/scenarios` | Create/Update scenario |
| DELETE | `/scenarios/:id` | Delete scenario |

### CRM & Data
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/leads` | List leads |
| POST | `/leads` | Create lead |
| PUT | `/leads/:id` | Update lead |
| DELETE | `/leads/:id` | Delete lead |
| GET | `/destinations` | List Telegram destinations |
| POST | `/drafts/import` | Import external draft |
| GET | `/drafts` | List drafts |

### System & Settings
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/settings` | Get system settings |
| POST | `/settings` | Update system settings |
| GET | `/users` | List users |
| POST | `/users` | Create user |
| PUT | `/users/:id` | Update user |
| DELETE | `/users/:id` | Delete user |
| GET | `/logs` | System logs |
| GET | `/proxy` | HTML Proxy for parsers |

## 4. QA Routes (`/api/qa`)
*Development/Staging only*

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/parse` | Trigger parser |
| GET | `/simulate/start` | Start simulation |
| POST | `/simulate/message` | Send simulated message |
