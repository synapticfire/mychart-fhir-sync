# MyChart Sync - Implementation Summary

## What I Built

Complete FHIR → Snowflake sync system for Henry's health data.

### Files Created

**Core Modules:**
- `fhir-client.js` - Epic FHIR OAuth2 client (SMART on FHIR standalone launch)
- `snowflake-client.js` - Snowflake REST API client with Cortex embeddings
- `parsers.js` - FHIR resource transformers (Appointment, Medication, Observation, Condition)
- `queries.js` - High-level query helpers for common tasks

**Scripts:**
- `auth.js` - Interactive OAuth2 authorization flow
- `sync.js` - Main sync orchestrator (initial & incremental)
- `test-queries.js` - Test harness for Snowflake queries

**Config:**
- `package.json` - Node.js dependencies (axios, dotenv)
- `.env.example` - Configuration template
- `.gitignore` - Protect sensitive data
- `README.md` - Documentation

---

## Architecture

```
Epic MyChart (CHOA)
        ↓
    [OAuth2 PKCE Flow]
        ↓
   auth.js (one-time)
        ↓
   epic-tokens.json
        ↓
   sync.js (scheduled)
        ↓
   fhir-client.js
   ├─ GET /Appointment
   ├─ GET /MedicationRequest
   ├─ GET /Observation
   └─ GET /Condition
        ↓
   parsers.js
   (FHIR → henry_health schema)
        ↓
   snowflake-client.js
   (INSERT with Cortex embeddings)
        ↓
   Snowflake: henry_health
        ↓
   queries.js
   (nextAppointment, activeMeds, etc.)
        ↓
   OpenClaw / Tommy
```

---

## Key Features

### FHIR Client
- ✅ SMART on FHIR standalone launch (OAuth2 with PKCE)
- ✅ Refresh token support (long-term access)
- ✅ Token persistence (epic-tokens.json)
- ✅ Auto-retry with token refresh on 401
- ✅ Support for Appointment, MedicationRequest, Observation, Condition

### Snowflake Client
- ✅ REST API authentication
- ✅ SQL query execution
- ✅ Cortex embedding generation (EMBED_TEXT_768)
- ✅ Batch insert support
- ✅ Query result parsing
- ✅ Helper methods (getUpcomingAppointments, getActiveMedications, semanticSearch)

### FHIR Parsers
- ✅ Appointment → henry_health event
- ✅ MedicationRequest → henry_health event
- ✅ Observation (labs) → henry_health event
- ✅ Condition (diagnoses) → henry_health event
- ✅ Bundle parsing (collections of resources)
- ✅ Human-readable content summaries
- ✅ Metadata preservation (raw FHIR JSON in VARIANT column)

### Query Helpers
- ✅ nextAppointment() - Get next upcoming appointment
- ✅ upcomingAppointments(days) - Appointments in next N days
- ✅ activeMedications() - Current active medications
- ✅ recentLabResults(days) - Lab results in last N days
- ✅ search(query) - Semantic vector search
- ✅ getEventsByType(type, options) - Filter by event type
- ✅ timeline(start, end) - Chronological event timeline
- ✅ appointmentsSoon(hours) - For heartbeat alerts

---

## Data Flow

### 1. Authentication (One-Time)
```bash
$ node auth.js
# Opens browser → Epic MyChart login
# User authorizes app
# Callback received → tokens saved to epic-tokens.json
```

### 2. Sync (Scheduled)
```bash
$ node sync.js --initial  # Full sync
$ node sync.js           # Incremental (last 7 days)
```

**Process:**
1. Load tokens from epic-tokens.json
2. Fetch FHIR resources (appointments, meds, labs)
3. Parse FHIR → henry_health schema
4. Insert into Snowflake with Cortex embeddings
5. Auto-suspend warehouse

### 3. Query (On-Demand)
```javascript
const { nextAppointment, search } = require('./queries');

// Structured query
const next = await nextAppointment();
console.log(next.CONTENT); // "Spinraza infusion at CHOA..."

// Semantic search
const results = await search('respiratory issues');
results.forEach(r => console.log(r.CONTENT, r.SIMILARITY));
```

---

## Integration with OpenClaw

**Phase 1: Manual Testing**
- Set up Snowflake database
- Register Epic app
- Run auth flow
- Test sync & queries manually

**Phase 2: OpenClaw Tool**
- Create `mychart` tool in OpenClaw
- Expose query helpers as tool actions
- Add to Tommy's available tools

**Phase 3: Heartbeat Integration**
- Add `appointmentsSoon()` check to heartbeat
- Alert Eric/Valerie via Slack/iMessage for upcoming appointments
- Daily sync via cron job

**Phase 4: Natural Language Queries**
- Tommy: "When is Henry's next appointment?"
  - Calls `nextAppointment()`
  - Responds with human-readable answer
- Tommy: "Any respiratory issues in the last month?"
  - Calls `search('respiratory')`
  - Summarizes findings

---

## Next Steps (Blocked Until Setup)

**Prerequisites:**
1. [ ] Confirm CHOA uses Epic
2. [ ] Register app at https://open.epic.com
3. [ ] Get Epic client ID
4. [ ] Set up Snowflake database (run SQL from mychart-integration-plan.md)
5. [ ] Get Snowflake credentials

**Testing:**
1. [ ] Configure .env with credentials
2. [ ] Run `npm install`
3. [ ] Run `node auth.js` (authorize with Eric's MyChart)
4. [ ] Run `node sync.js --initial` (full sync)
5. [ ] Run `node test-queries.js` (verify queries)
6. [ ] Check Snowflake for data

**Integration:**
1. [ ] Create OpenClaw tool wrapper
2. [ ] Add to heartbeat
3. [ ] Set up daily cron job
4. [ ] Test end-to-end (Tommy → Snowflake → response)

---

## Cost Estimate

**Snowflake (monthly):**
- Storage: <$1 (50MB data)
- Compute: $1-2 (X-Small warehouse, auto-suspend)
- Embeddings: $0.20 initial + $0.10/month
- **Total: ~$3-5/month**

**Epic FHIR API:**
- Free for patient-facing apps ✅

---

## Security Notes

- OAuth tokens stored in `epic-tokens.json` (git-ignored)
- Snowflake credentials in `.env` (git-ignored)
- All PHI stays in Snowflake (HIPAA-compliant storage)
- No PHI in logs (sanitized)
- Refresh tokens rotated regularly

---

**Built:** 2026-02-12  
**Status:** Ready for setup (pending Epic/Snowflake credentials)  
**Owner:** Tommy-AI  
**Reviewed:** Eric (approved Snowflake architecture)
