# mychart-sync

MyChart FHIR API integration for Henry's health data.

## Overview

Syncs data from Epic MyChart (CHOA) to Snowflake for semantic search and care coordination.

**Components:**
- `fhir-client.js` - Epic FHIR OAuth2 client
- `snowflake-client.js` - Snowflake REST API client
- `parsers.js` - FHIR → Snowflake transformers
- `sync.js` - Main sync orchestrator
- `queries.js` - Query helpers (next appointment, active meds, etc.)

**Data Flow:**
```
Epic FHIR API (OAuth2)
    ↓
FHIR Resources (Appointment, MedicationRequest, Observation)
    ↓
Transform to henry_health schema
    ↓
Snowflake REST API
    ↓
INSERT with Cortex embeddings
```

## Setup

1. Register app at https://open.epic.com
2. Configure Snowflake credentials
3. Set environment variables:
   - `EPIC_CLIENT_ID`
   - `EPIC_FHIR_BASE_URL`
   - `SNOWFLAKE_ACCOUNT`
   - `SNOWFLAKE_USER`
   - `SNOWFLAKE_PASSWORD`
   - `SNOWFLAKE_WAREHOUSE`
   - `SNOWFLAKE_DATABASE`
   - `SNOWFLAKE_SCHEMA`

## Usage

**Sync FHIR data:**
```bash
node sync.js --initial  # Full sync
node sync.js           # Incremental (last 7 days)
```

**Query helpers:**
```javascript
const { nextAppointment, activeMedications } = require('./queries');

const next = await nextAppointment();
console.log(next);
// { date: '2026-02-25', content: 'Spinraza infusion...' }
```

## Schema

See `../mychart-integration-plan.md` for full Snowflake schema.

## Installation

```bash
cd care/mychart-sync
npm install
cp .env.example .env
# Edit .env with your credentials
```

## Quick Start

**1. Authenticate with Epic MyChart:**
```bash
node auth.js
# Follow browser prompts to authorize
```

**2. Run initial sync:**
```bash
node sync.js --initial
```

**3. Test queries:**
```bash
node test-queries.js
```

**4. Schedule incremental syncs (add to crontab):**
```bash
# Daily at 6 AM
0 6 * * * cd /path/to/care/mychart-sync && node sync.js
```

## Status

- [x] FHIR OAuth2 client (PKCE flow)
- [x] Snowflake REST API client
- [x] FHIR parsers (Appointment, MedicationRequest, Observation, Condition)
- [x] Sync orchestrator
- [x] Query helpers
- [ ] OpenClaw tool integration
- [ ] Cron job for daily sync (manual setup for now)
- [ ] Epic app registration (pending CHOA confirmation)
- [ ] Snowflake database setup

## Next Steps

1. Confirm CHOA uses Epic
2. Register app at https://open.epic.com
3. Set up Snowflake database (see ../mychart-integration-plan.md)
4. Configure .env credentials
5. Run auth flow
6. Test sync
7. Integrate into OpenClaw heartbeat
