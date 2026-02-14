#!/usr/bin/env node

/**
 * Test query functions
 * 
 * Simple test script to verify Snowflake connection and queries.
 * 
 * Usage:
 *   node test-queries.js
 */

require('dotenv').config();
const queries = require('./queries');

async function runTests() {
  console.log('=== Testing Snowflake Queries ===\n');

  try {
    // Test 1: Next appointment
    console.log('1. Next appointment:');
    const next = await queries.nextAppointment();
    if (next) {
      console.log(`   ${next.EVENT_DATE}: ${next.CONTENT}`);
    } else {
      console.log('   No upcoming appointments');
    }

    // Test 2: Upcoming appointments (next 30 days)
    console.log('\n2. Upcoming appointments (next 30 days):');
    const upcoming = await queries.upcomingAppointments(30);
    console.log(`   Found ${upcoming.length} appointments`);
    upcoming.slice(0, 5).forEach(appt => {
      console.log(`   - ${appt.EVENT_DATE}: ${appt.CONTENT}`);
    });

    // Test 3: Active medications
    console.log('\n3. Active medications:');
    const meds = await queries.activeMedications();
    console.log(`   Found ${meds.length} active medications`);
    meds.slice(0, 5).forEach(med => {
      console.log(`   - ${med.CONTENT}`);
    });

    // Test 4: Recent lab results
    console.log('\n4. Recent lab results (last 30 days):');
    const labs = await queries.recentLabResults(30);
    console.log(`   Found ${labs.length} lab results`);
    labs.slice(0, 5).forEach(lab => {
      console.log(`   - ${lab.EVENT_DATE}: ${lab.CONTENT}`);
    });

    // Test 5: Semantic search
    console.log('\n5. Semantic search ("respiratory"):');
    const results = await queries.search('respiratory breathing lungs', 5);
    console.log(`   Found ${results.length} results`);
    results.forEach(result => {
      console.log(`   - ${result.EVENT_DATE}: ${result.CONTENT} (similarity: ${result.SIMILARITY.toFixed(3)})`);
    });

    console.log('\n✓ All tests complete!');

  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  } finally {
    await queries.close();
  }
}

if (require.main === module) {
  runTests()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = runTests;
