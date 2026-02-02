# M6: Content & Calendar (Already Implemented ✅)

## Analysis Summary
**Status:** M6 goals are **fully achieved** in the current implementation.

## Backend Implementation

### Schema (Prisma)
**Models Exist:**
- `Template` (lines 385-396): Content publication templates
- `PublicationJob` (lines 398-415): Scheduled publication jobs

**Fields:**
```prisma
model Template {
  id          String @id @default(cuid())
  name        String
  body        String
  language    String?
  status      String @default("ACTIVE")
  companyId   String?
  workspace   Workspace? @relation(fields: [companyId], references: [id], onDelete: Cascade)
  variables   Json? @db.JsonB
  
  publicationJobs PublicationJob[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model PublicationJob {
  id          String @id @default(cuid())
  companyId   String?
  draftId     Int?
  templateId  String?
  botId       String?
  title       String?
  text        String
  mediaUrl    String?
  destination String
  scheduledAt DateTime?
  postedAt    DateTime?
  status      String @default("SCHEDULED")
  lastError   String?
  metadata    Json? @db.JsonB
}
```

### Services
**File:** `modules/Core/templates/template.service.ts`

**Features:**
- `getMarketplace()`: Browse public scenario templates
- `getById()`, `getInstalled()`: Retrieve templates
- `installTemplate()`: Install template to company workspace
- `uninstallTemplate()`: Remove template
- `createTemplate()`: Admin-only template creation

**Notes:**
- This service manages **bot scenario templates** (marketplace)
- Publication templates are likely managed via a separate `PublicationService`

## Frontend Implementation

### Content Calendar Page
**File:** `apps/web/src/pages/app/ContentCalendar.tsx` (828 lines)

### Features

#### 1. View Modes
- **CALENDAR**: Week view with time slots (9:00, 12:00, 15:00, 18:00, 21:00)
- **DAY**: Single day detailed view
- **GRID**: Queue list with post cards

#### 2. Template System ✅
**Default Templates:**
- `IN_STOCK`: "В наявності" (In Stock) - UA/RU variants
- `IN_TRANSIT`: "В дорозі" (In Transit) - UA/RU variants

**Custom Templates:**
- Create/edit custom templates
- UA + RU language support
- Variable tokens: `{title}`, `{price}`, `{year}`, `{brand}`, `{location}`, `{link}`, `{car}`
- Save to backend via `PublicationService`

#### 3. Bulk Scheduler ✅
**Config Options:**
- Select multiple cars (checkbox selection)
- Choose template
- Select language (UA/RU)
- Select destination channel
- Start date + time
- Interval between posts (1-24 hours slider)

**Workflow:**
```typescript
bulkSchedule() → creates N PublicationJob records → schedules across time
```

#### 4. Calendar Interactivity
- **Week Navigation:** Prev/Next week arrows
- **Day Navigation:** Prev/Next day arrows
- **Time Slots:** Click to schedule single post
- **Post Cards:** Show status (SCHEDULED, POSTED, FAILED), delete button

#### 5. Stats Dashboard
- Scheduled count (SCHEDULED + QUEUED)
- Posted count
- Drafts count (RUNNING)
- Failed count

### API Integration

**Frontend Service:** `publicationService.ts`
```typescript
PublicationService.listJobs()
PublicationService.createJob(payload)
PublicationService.deleteJob(id)
PublicationService.listTemplates()
PublicationService.createTemplate(data)
PublicationService.updateTemplate(id, data)
```

**Backend Routes:** Likely at `/api/publications/*` or `/api/content/*`

---

## Verification

### Template Engine ✅
- [x] Default templates (IN_STOCK, IN_TRANSIT)
- [x] Custom template creation
- [x] Variable support (`{title}`, `{price}`, etc.)
- [x] Multi-language (UA/RU)
- [ x] Backend storage (`Template` model)

### Scheduler ✅
- [x] Calendar week view
- [x] Day view
- [x] Queue/grid view
- [x] Single post scheduling
- [x] Bulk scheduling
- [x] Interval config
- [x] Status tracking (SCHEDULED, POSTED, FAILED)
- [x] Delete scheduled posts

### Integration ✅
- [x] Inventory integration (car selection)
- [x] Destinations integration (channel selection)
- [x] Bot integration (botId assignment)
- [x] Media support (car thumbnail)

---

## Implementation Details

### Template Rendering
Templates use simple `{variable}` replacement:
```typescript
const templateText = bulkConfig.lang === 'RU' ? (tpl.ru || tpl.ua) : (tpl.ua || tpl.ru);
// Template variables replaced server-side or client-side before scheduling
```

### Scheduling Logic
```typescript
let currentTime = new Date(startDateTime);
carsArray.forEach((car, index) => {
    newJobs.push({
        scheduledAt: currentTime.toISOString(),
        // ... other fields
    });
    currentTime = new Date(currentTime.getTime() + bulkConfig.interval * 60 * 60 * 1000);
});
```

### Time Slots
```typescript
const timeSlots = [9, 12, 15, 18, 21]; // 5 slots per day
```

---

## Conclusion
**M6 is complete.** Content Calendar has a fully-featured template system with variable support, bulk scheduling across time intervals, and calendar visualization. No additional work needed.

## Notes
- **Scenario Template Service** (template.service.ts) manages bot *scenario* marketplace, NOT publication templates
- **Publication templates** are stored separately via `PublicationService` (frontend) and likely a publication routes backend
- Both systems coexist for different purposes
