# MyChart FHIR Sync

Personal health data integration using Epic's FHIR API and Snowflake for a family care assistant.

## Overview

This project syncs patient health data from Epic MyChart (via FHIR R4 API) into Snowflake for analysis and care coordination. Built to support care management for a family member with complex medical needs.

**Features:**
- OAuth2 authentication with Epic FHIR API (SMART on FHIR)
- FHIR resource parsing (Appointments, Medications, Observations, Conditions)
- Snowflake storage with Cortex embeddings for semantic search
- Structured SQL queries and vector similarity search
- Incremental sync with refresh token management

## Architecture

```
Epic MyChart (FHIR R4) → OAuth2 → Node.js Client → Snowflake
                                                    ├─ Structured data (event_type, dates, content)
                                                    └─ Vector embeddings (semantic search)
```

**Tech Stack:**
- Node.js (FHIR client + Snowflake REST API)
- Epic FHIR R4 API (Patient Standalone Launch)
- Snowflake (data warehouse + Cortex embeddings)
- PKCE OAuth2 flow (secure patient app authentication)

## Setup

### Prerequisites
1. **Epic FHIR App Registration** at [open.epic.com](https://open.epic.com)
   - Redirect URI: `http://localhost:8080/callback`
   - Scopes: `launch/patient patient/*.read`
   - Save Client ID

2. **Snowflake Account** with:
   - Database, schema, and warehouse created
   - VECTOR data type support
   - Cortex embedding function available

### Installation

```bash
npm install
cp .env.example .env
```

Edit `.env`:
```bash
EPIC_CLIENT_ID=your-epic-client-id
EPIC_FHIR_BASE_URL=https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4
SNOWFLAKE_ACCOUNT=your-account.region
SNOWFLAKE_USER=your-username
SNOWFLAKE_PASSWORD=your-password
```

### First Run

1. **Authenticate:**
   ```bash
   node auth.js
   ```
   Opens browser → log into MyChart → authorize app → tokens saved

2. **Initial Sync:**
   ```bash
   node sync.js --initial
   ```
   Fetches all FHIR data and loads into Snowflake

3. **Test Queries:**
   ```bash
   node test-queries.js
   ```
   Verifies connection and runs sample queries

## Usage

### Query Examples

```javascript
const queries = require('./queries');

// Next upcoming appointment
const next = await queries.nextAppointment();
console.log(next.CONTENT);

// Active medications
const meds = await queries.activeMedications();
meds.forEach(m => console.log(m.CONTENT));

// Semantic search
const results = await queries.search('respiratory issues');
results.forEach(r => console.log(r.CONTENT));

await queries.close();
```

### Daily Sync (cron)

```bash
crontab -e
```

Add:
```cron
0 6 * * * cd /path/to/mychart-sync && node sync.js >> sync.log 2>&1
```

## Security

**This repo does NOT contain:**
- ❌ Patient health data (PHI)
- ❌ OAuth tokens
- ❌ Snowflake credentials
- ❌ Epic Client secrets

**Sensitive files (gitignored):**
- `.env` - credentials and API keys
- `epic-tokens.json` - OAuth access/refresh tokens
- `*.log` - may contain query results

**All PHI remains in:**
- Epic MyChart (source of truth)
- Your Snowflake instance (private)
- Local token files (never committed)

## Cost

**Snowflake:** ~$3-5/month
- X-Small warehouse with 60-second auto-suspend
- Minimal compute for daily syncs + occasional queries

**Epic FHIR API:** Free for patient-facing apps ✅

## Documentation

- `IMPLEMENTATION.md` - Technical architecture and code walkthrough
- `QUICKSTART.md` - Step-by-step setup guide
- `.env.example` - Environment variable template

## License

MIT (see LICENSE file)

---

**Personal Project:** Built for family care coordination. Not intended for production healthcare use without proper BAA, HIPAA compliance review, and security hardening.
