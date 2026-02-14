-- ============================================================================
-- Snowflake Setup for Henry Care MyChart Sync
-- ============================================================================
-- 
-- This script creates:
-- - Database and schema for health data
-- - Warehouse for compute
-- - Service user with key-pair authentication
-- - Health data table with vector embeddings
-- - Proper grants and permissions
--
-- Run this as ACCOUNTADMIN or a role with CREATE DATABASE privileges
-- ============================================================================

-- Step 1: Create database and schema
CREATE DATABASE IF NOT EXISTS HENRY_CARE
  COMMENT = 'Health data for Henry care coordination';

USE DATABASE HENRY_CARE;

CREATE SCHEMA IF NOT EXISTS HEALTH
  COMMENT = 'FHIR and care tracking data';

USE SCHEMA HEALTH;

-- Step 2: Create warehouse (X-Small, auto-suspend after 60 seconds)
CREATE WAREHOUSE IF NOT EXISTS HENRY_CARE_WH
  WAREHOUSE_SIZE = 'X-SMALL'
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE
  INITIALLY_SUSPENDED = TRUE
  COMMENT = 'Warehouse for health data queries and embeddings';

-- Step 3: Create service user for application
CREATE USER IF NOT EXISTS TOMMY_AI_SERVICE
  COMMENT = 'Service user for Tommy AI MyChart sync'
  DEFAULT_WAREHOUSE = HENRY_CARE_WH
  DEFAULT_NAMESPACE = HENRY_CARE.HEALTH
  MUST_CHANGE_PASSWORD = FALSE;

-- Note: RSA key pair will be added separately (see key generation below)

-- Step 4: Create role for service user
CREATE ROLE IF NOT EXISTS HENRY_CARE_APP;

-- Grant role to user
GRANT ROLE HENRY_CARE_APP TO USER TOMMY_AI_SERVICE;

-- Step 5: Grant database/schema/warehouse usage to role
GRANT USAGE ON DATABASE HENRY_CARE TO ROLE HENRY_CARE_APP;
GRANT USAGE ON SCHEMA HENRY_CARE.HEALTH TO ROLE HENRY_CARE_APP;
GRANT USAGE ON WAREHOUSE HENRY_CARE_WH TO ROLE HENRY_CARE_APP;

-- Grant ability to create tables and operate on them
GRANT CREATE TABLE ON SCHEMA HENRY_CARE.HEALTH TO ROLE HENRY_CARE_APP;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA HENRY_CARE.HEALTH TO ROLE HENRY_CARE_APP;
GRANT SELECT, INSERT, UPDATE, DELETE ON FUTURE TABLES IN SCHEMA HENRY_CARE.HEALTH TO ROLE HENRY_CARE_APP;

-- Step 6: Create health data table with vector embeddings
CREATE TABLE IF NOT EXISTS henry_health (
  -- Primary key
  event_id VARCHAR(50) PRIMARY KEY,
  
  -- Event metadata
  event_type VARCHAR(50) NOT NULL,  -- 'appointment', 'medication', 'observation', 'condition', 'tube_feed', etc.
  event_date TIMESTAMP_NTZ NOT NULL,
  
  -- FHIR source (if applicable)
  fhir_resource_type VARCHAR(50),
  fhir_resource_id VARCHAR(100),
  
  -- Content (human-readable summary)
  content VARCHAR(5000) NOT NULL,
  
  -- Structured data (JSON)
  data VARIANT,
  
  -- Vector embedding for semantic search (768 dimensions for arctic-embed-m)
  embedding VECTOR(FLOAT, 768),
  
  -- Audit fields
  created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  source VARCHAR(50) DEFAULT 'mychart_sync'
)
COMMENT = 'Health events and care tracking data with semantic embeddings';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_event_type ON henry_health(event_type);
CREATE INDEX IF NOT EXISTS idx_event_date ON henry_health(event_date);
CREATE INDEX IF NOT EXISTS idx_fhir_resource ON henry_health(fhir_resource_type, fhir_resource_id);

-- Step 7: Set up resource monitor (optional but recommended)
-- Prevents runaway costs by suspending warehouse at threshold
CREATE RESOURCE MONITOR IF NOT EXISTS HENRY_CARE_MONITOR
  CREDIT_QUOTA = 10  -- 10 credits per month (~$40)
  FREQUENCY = MONTHLY
  START_TIMESTAMP = CURRENT_TIMESTAMP
  TRIGGERS
    ON 80 PERCENT DO NOTIFY
    ON 100 PERCENT DO SUSPEND;

ALTER WAREHOUSE HENRY_CARE_WH SET RESOURCE_MONITOR = HENRY_CARE_MONITOR;

-- ============================================================================
-- Key Pair Generation Instructions
-- ============================================================================
-- 
-- Run these commands on your local machine (in care/mychart-sync directory):
-- 
-- 1. Generate private key (encrypted):
--    openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -out snowflake_key.p8 -nocrypt
-- 
-- 2. Generate public key from private key:
--    openssl rsa -in snowflake_key.p8 -pubout -out snowflake_key.pub
-- 
-- 3. Get public key value (copy output without BEGIN/END lines):
--    cat snowflake_key.pub | grep -v "BEGIN PUBLIC" | grep -v "END PUBLIC" | tr -d '\n'
-- 
-- 4. Set public key on Snowflake user (run as ACCOUNTADMIN):
--    ALTER USER TOMMY_AI_SERVICE SET RSA_PUBLIC_KEY='<paste-public-key-here>';
-- 
-- 5. Update .env file:
--    SNOWFLAKE_ACCOUNT=<your-account>.<region>
--    SNOWFLAKE_USER=TOMMY_AI_SERVICE
--    SNOWFLAKE_PRIVATE_KEY_PATH=./snowflake_key.p8
--    SNOWFLAKE_WAREHOUSE=HENRY_CARE_WH
--    SNOWFLAKE_DATABASE=HENRY_CARE
--    SNOWFLAKE_SCHEMA=HEALTH
-- 
-- 6. Add to .gitignore:
--    snowflake_key.p8
--    snowflake_key.pub
-- 
-- ============================================================================

-- Verification queries (run after setup)
SHOW DATABASES LIKE 'HENRY_CARE';
SHOW SCHEMAS IN DATABASE HENRY_CARE;
SHOW TABLES IN SCHEMA HENRY_CARE.HEALTH;
SHOW WAREHOUSES LIKE 'HENRY_CARE_WH';
SHOW USERS LIKE 'TOMMY_AI_SERVICE';

-- Test query (should return 0 rows initially)
SELECT COUNT(*) FROM henry_health;

-- ============================================================================
-- Cost Estimates
-- ============================================================================
-- 
-- X-Small warehouse: $2/credit
-- Auto-suspend: 60 seconds (minimal idle charges)
-- Expected usage: ~2-3 credits/month for daily syncs + occasional queries
-- Estimated cost: $4-10/month
-- 
-- Resource monitor set at 10 credits ($20) provides safety margin
-- ============================================================================
