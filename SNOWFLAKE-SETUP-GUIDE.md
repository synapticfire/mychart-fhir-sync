# Snowflake Setup Guide for MyChart Sync

## Quick Start

You already have a Snowflake account. Here's what to do:

### Step 1: Run SQL Setup Script

In Snowflake web console (as ACCOUNTADMIN):

```sql
-- Copy/paste from snowflake-setup.sql
-- This creates:
-- - Database: HENRY_CARE
-- - Schema: HEALTH
-- - Table: henry_health (with VECTOR column for embeddings)
-- - Warehouse: HENRY_CARE_WH (X-Small, auto-suspend)
-- - Service user: TOMMY_AI_SERVICE
-- - Role: HENRY_CARE_APP
```

See `snowflake-setup.sql` for the complete script.

### Step 2: Generate RSA Key Pair

On your local machine (in care/mychart-sync directory):

```bash
# Generate private key (unencrypted for service use)
openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -out snowflake_key.p8 -nocrypt

# Generate public key from private key
openssl rsa -in snowflake_key.p8 -pubout -out snowflake_key.pub

# Extract public key value (no headers)
cat snowflake_key.pub | grep -v "BEGIN PUBLIC" | grep -v "END PUBLIC" | tr -d '\n'
```

Copy the output from the last command (long string of characters).

### Step 3: Set Public Key on Snowflake User

In Snowflake web console (as ACCOUNTADMIN):

```sql
ALTER USER TOMMY_AI_SERVICE SET RSA_PUBLIC_KEY='<paste-public-key-here>';
```

Replace `<paste-public-key-here>` with the output from Step 2.

### Step 4: Configure .env File

Create `care/mychart-sync/.env`:

```bash
# Epic FHIR
EPIC_CLIENT_ID=<your-epic-client-id>
EPIC_FHIR_BASE_URL=https://wpprod.choa.org/FHIR_PRD/api/FHIR/R4
EPIC_REDIRECT_URI=http://localhost:8080/callback
EPIC_TOKEN_PATH=./epic-tokens.json

# Snowflake (Key Pair Auth)
SNOWFLAKE_ACCOUNT=<your-account>.<region>
SNOWFLAKE_USER=TOMMY_AI_SERVICE
SNOWFLAKE_PRIVATE_KEY_PATH=./snowflake_key.p8
SNOWFLAKE_WAREHOUSE=HENRY_CARE_WH
SNOWFLAKE_DATABASE=HENRY_CARE
SNOWFLAKE_SCHEMA=HEALTH
```

Replace:
- `<your-epic-client-id>` - from Epic registration
- `<your-account>.<region>` - your Snowflake account identifier

Example: `xy12345.us-east-1`

### Step 5: Update Code to Use Key Pair Client

The new `snowflake-keypair-client.js` supports both key pair and password auth.

Update files that import snowflake-client.js:
```javascript
const SnowflakeClient = require('./snowflake-keypair-client');
```

Or rename the file:
```bash
mv snowflake-keypair-client.js snowflake-client.js
```

### Step 6: Test Connection

```bash
cd care/mychart-sync
npm install  # if not done already
node test-queries.js
```

Should see: "Connected to Snowflake successfully!"

## Security Notes

✅ **What's safe:**
- Private key stored locally only (`.gitignore` blocks it)
- Public key in Snowflake (safe to be in Snowflake)
- No password stored anywhere

❌ **Never commit:**
- `snowflake_key.p8` (private key)
- `.env` (credentials)
- `epic-tokens.json` (OAuth tokens)

These are all gitignored, but double-check before pushing!

## Cost Monitoring

**Setup includes:**
- Resource monitor: 10 credits/month limit (~$40)
- Alerts at 80% usage
- Warehouse suspension at 100%

**Expected costs:**
- X-Small warehouse: $2/credit
- Auto-suspend: 60 seconds (minimal idle)
- Daily syncs + queries: ~2-3 credits/month
- **Estimated: $4-10/month**

## Verification Queries

After setup, run these in Snowflake:

```sql
-- Check database exists
SHOW DATABASES LIKE 'HENRY_CARE';

-- Check table structure
DESC TABLE HENRY_CARE.HEALTH.henry_health;

-- Check user has key pair
DESC USER TOMMY_AI_SERVICE;
-- Look for RSA_PUBLIC_KEY_FP (fingerprint)

-- Test empty table
SELECT COUNT(*) FROM HENRY_CARE.HEALTH.henry_health;
-- Should return 0
```

## Troubleshooting

**"Invalid JWT signature"**
- Public key not set on user
- Wrong private key being used
- Run: `DESC USER TOMMY_AI_SERVICE;` to check RSA_PUBLIC_KEY_FP exists

**"Authentication failed"**
- Check SNOWFLAKE_ACCOUNT format: `account.region` (lowercase)
- Check user name: `TOMMY_AI_SERVICE` (uppercase in Snowflake)

**"Object does not exist"**
- Database/schema/table not created yet
- Run snowflake-setup.sql script

**"No active warehouse"**
- Warehouse suspended (normal)
- Will auto-resume on first query
- Check: `SHOW WAREHOUSES;`

## Next Steps

After Snowflake is working:
1. Complete Epic app registration (get Client ID)
2. Run Epic OAuth flow: `node auth.js`
3. Initial sync: `node sync.js --initial`
4. Query data: `node test-queries.js`
