#!/usr/bin/env node

/**
 * MyChart Sync
 * 
 * Syncs FHIR data from Epic MyChart to Snowflake.
 * 
 * Usage:
 *   node sync.js --initial   # Full sync
 *   node sync.js            # Incremental (last 7 days)
 */

require('dotenv').config();
const FHIRClient = require('./fhir-client');
const SnowflakeClient = require('./snowflake-client');
const { parseBundle, parseAppointment, parseMedicationRequest, parseObservation } = require('./parsers');

// Configuration
const config = {
  fhir: {
    clientId: process.env.EPIC_CLIENT_ID,
    fhirBaseUrl: process.env.EPIC_FHIR_BASE_URL,
    tokenPath: process.env.EPIC_TOKEN_PATH || './epic-tokens.json'
  },
  snowflake: {
    account: process.env.SNOWFLAKE_ACCOUNT,
    user: process.env.SNOWFLAKE_USER,
    password: process.env.SNOWFLAKE_PASSWORD,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE || 'HENRY_CARE_WH',
    database: process.env.SNOWFLAKE_DATABASE || 'HENRY_CARE',
    schema: process.env.SNOWFLAKE_SCHEMA || 'HEALTH'
  }
};

/**
 * Main sync function
 */
async function sync(options = {}) {
  const { initial = false } = options;

  console.log(`Starting ${initial ? 'initial' : 'incremental'} sync...`);

  // Initialize clients
  const fhir = new FHIRClient(config.fhir);
  const snowflake = new SnowflakeClient(config.snowflake);

  try {
    // Load FHIR tokens
    const hasTokens = fhir.loadTokens(config.fhir.tokenPath);
    if (!hasTokens) {
      console.error('No FHIR tokens found. Run auth flow first:');
      console.error('  node auth.js');
      process.exit(1);
    }

    console.log('✓ Loaded FHIR tokens');

    // Build date filter for incremental sync
    const dateFilter = initial ? {} : {
      date: `ge${getPastDate(7)}` // Last 7 days
    };

    // Fetch appointments
    console.log('Fetching appointments...');
    const appointments = await fhir.getAppointments(dateFilter);
    const appointmentEvents = parseBundle(appointments, parseAppointment);
    console.log(`  Found ${appointmentEvents.length} appointments`);

    // Fetch medications
    console.log('Fetching medications...');
    const medications = await fhir.getMedications(dateFilter);
    const medicationEvents = parseBundle(medications, parseMedicationRequest);
    console.log(`  Found ${medicationEvents.length} medications`);

    // Fetch lab results
    console.log('Fetching lab results...');
    const observations = await fhir.getObservations(dateFilter);
    const labEvents = parseBundle(observations, parseObservation);
    console.log(`  Found ${labEvents.length} lab results`);

    // Combine all events
    const allEvents = [
      ...appointmentEvents,
      ...medicationEvents,
      ...labEvents
    ];

    console.log(`\nTotal events: ${allEvents.length}`);

    if (allEvents.length === 0) {
      console.log('No new data to sync.');
      return;
    }

    // Insert into Snowflake
    console.log('\nInserting into Snowflake...');
    await snowflake.insertEvents(allEvents);
    console.log('✓ Sync complete!');

  } catch (error) {
    console.error('Sync failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  } finally {
    await snowflake.close();
  }
}

/**
 * Get date N days ago in FHIR format (YYYY-MM-DD)
 */
function getPastDate(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

/**
 * CLI entry point
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  const initial = args.includes('--initial');

  sync({ initial })
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = sync;
