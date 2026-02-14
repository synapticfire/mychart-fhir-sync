# MyChart Sync - Quick Start Guide

**When you're ready to set this up, follow these steps:**

---

## Prerequisites

### 1. Epic App Registration
1. Go to https://open.epic.com
2. Sign in / create account
3. Click "Build Apps"
4. Register new app:
   - **App Name:** Henry Care Assistant
   - **Redirect URI:** `http://localhost:8080/callback`
   - **FHIR Version:** R4
   - **App Type:** Patient Standalone Launch
   - **Scopes:** `launch/patient patient/*.read`
5. Save your **Client ID**

### 2. Snowflake Database Setup
1. Run the SQL script from `../mychart-integration-plan.md` section 8
2. Creates:
   - Database: `HENRY_CARE`
   - Schema: `HEALTH`
   - Table: `henry_health`
   - Warehouse: `HENRY_CARE_WH` (X-Small, 60sec auto-suspend)
3. Note your credentials:
   - Account: `<account>.<region>.snowflakecomputing.com`
   - Username
   - Password

---

## Installation

```bash
cd care/mychart-sync
npm install
cp .env.example .env
```

Edit `.env`:
```bash
# Epic (from app registration)
EPIC_CLIENT_ID=your-client-id-here
EPIC_FHIR_BASE_URL=https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4

# Snowflake (from database setup)
SNOWFLAKE_ACCOUNT=your-account.region
SNOWFLAKE_USER=your-username
SNOWFLAKE_PASSWORD=your-password
```

---

## First Run

### Step 1: Authenticate
```bash
node auth.js
```
- Opens browser
- Sign into MyChart (Eric or Valerie's account)
- Authorize the app
- Tokens saved to `epic-tokens.json`

### Step 2: Initial Sync
```bash
node sync.js --initial
```
- Fetches all appointments, meds, labs from Epic
- Parses FHIR resources
- Inserts into Snowflake with embeddings
- May take 1-2 minutes

### Step 3: Test Queries
```bash
node test-queries.js
```
- Runs sample queries
- Verifies Snowflake connection
- Shows next appointment, active meds, etc.

---

## Ongoing Use

### Daily Sync (cron job)
Add to crontab:
```bash
crontab -e
```

Add line:
```cron
0 6 * * * cd /Users/tommy-ai/.openclaw/workspace/care/mychart-sync && node sync.js >> sync.log 2>&1
```

This runs incremental sync daily at 6 AM.

### Query from Node.js
```javascript
const queries = require('./queries');

// Next appointment
const next = await queries.nextAppointment();
console.log(next.CONTENT);

// Semantic search
const results = await queries.search('respiratory issues');
results.forEach(r => console.log(r.CONTENT));

// Close connection
await queries.close();
```

---

## Integration with Tommy

**Phase 1: Manual queries (now)**
- Use `node test-queries.js` to check data
- Run `node sync.js` to update

**Phase 2: OpenClaw tool (next)**
- Create tool wrapper in OpenClaw
- Expose query functions to Tommy
- "When is Henry's next appointment?" → calls `nextAppointment()`

**Phase 3: Heartbeat (later)**
- Add check to `HEARTBEAT.md`
- Alert if appointment in next 48h
- Daily sync via cron

---

## Troubleshooting

**Auth fails:**
- Check EPIC_CLIENT_ID is correct
- Verify redirect URI matches app registration: `http://localhost:8080/callback`
- Ensure port 8080 is free

**Sync fails:**
- Check tokens exist: `ls epic-tokens.json`
- Try re-authenticating: `node auth.js`
- Check Epic FHIR base URL is correct for CHOA

**Snowflake fails:**
- Verify credentials in `.env`
- Test connection: `node test-queries.js`
- Check warehouse is created and not suspended manually

**No data returned:**
- Verify `henry_health` table exists
- Check sync completed: `node sync.js --initial`
- Query Snowflake directly: `SELECT COUNT(*) FROM henry_health;`

---

## Cost Monitoring

**Snowflake:**
- Check usage: `SELECT * FROM SNOWFLAKE.ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY WHERE WAREHOUSE_NAME = 'HENRY_CARE_WH';`
- Should be <5 credits/month (~$10)
- Set up resource monitor (see mychart-integration-plan.md section 8)

**Epic:**
- Free for patient apps ✅

---

**Questions?** Check `IMPLEMENTATION.md` for technical details or ask Tommy!
