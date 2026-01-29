# Telegram Release Stage 3: Interactive Visual Mapper

## Goal
Implement a "Teach & Remember" parsing system. Instead of hardcoded Regex or AI, the user defines parsing rules for each Channel/Source visually.

## Phases

### Phase A: Parsing Logic (Backend)
- [ ] **Rule Engine**: Create `ParsingService` that accepts `text` + `template`.
    - Supports: `Regex Extraction`, `Line Index`, `Split & Index`, `Keyword Anchor`.
- [ ] **Preview API**: `POST /api/qa/parse/preview` (Test rules against raw text).

### Phase B: Mapping UI (Frontend)
- [ ] **Template Editor**:
    - Show raw Telegram message.
    - Allow user to highlight/select text.
    - Assign selection to Field (`Price`, `Year`, `Make`).
    - Auto-generate Regex/Rule based on selection.
- [ ] **Source Config**:
    - Allow saving these rules into `ChannelSource.importRules`.

### Phase C: Integration
- [ ] **Middleware**:
    - When `syncChannel` runs:
    - Check if `importRules` exist.
    - If yes -> Use them.
    - If no -> Use partial heuristic or flag as "Needs Mapping".

## Technical Approach
**Data Structure (`importRules`):**
```json
{
  "templateName": "Dubai Cars Format",
  "fields": [
    { "target": "price", "type": "regex", "pattern": "Price:\\s*(\\d+)" },
    { "target": "year", "type": "line", "index": 1 },
    { "target": "make", "type": "keyword_proximity", "keyword": "Make:" }
  ]
}
```
