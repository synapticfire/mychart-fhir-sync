/**
 * Query Helpers
 * 
 * High-level query functions for common care coordination tasks.
 * Used by OpenClaw tools and heartbeat checks.
 */

require('dotenv').config();
const SnowflakeClient = require('./snowflake-client');

// Singleton client
let client = null;

function getClient() {
  if (!client) {
    client = new SnowflakeClient({
      account: process.env.SNOWFLAKE_ACCOUNT,
      user: process.env.SNOWFLAKE_USER,
      password: process.env.SNOWFLAKE_PASSWORD,
      warehouse: process.env.SNOWFLAKE_WAREHOUSE || 'HENRY_CARE_WH',
      database: process.env.SNOWFLAKE_DATABASE || 'HENRY_CARE',
      schema: process.env.SNOWFLAKE_SCHEMA || 'HEALTH'
    });
  }
  return client;
}

/**
 * Get next appointment
 * @returns {Promise<Object|null>} Next upcoming appointment
 */
async function nextAppointment() {
  const appointments = await getClient().getUpcomingAppointments(365);
  return appointments[0] || null;
}

/**
 * Get all upcoming appointments within N days
 * @param {number} days - Number of days to look ahead
 * @returns {Promise<Array>} Array of appointments
 */
async function upcomingAppointments(days = 30) {
  return await getClient().getUpcomingAppointments(days);
}

/**
 * Get active medications
 * @returns {Promise<Array>} Array of active medications
 */
async function activeMedications() {
  return await getClient().getActiveMedications();
}

/**
 * Get recent lab results
 * @param {number} days - Number of days to look back
 * @returns {Promise<Array>} Array of lab results
 */
async function recentLabResults(days = 30) {
  const sql = `
    SELECT event_id, event_date, content, metadata
    FROM henry_health
    WHERE event_type = 'lab_result'
      AND event_date >= DATEADD(day, -${days}, CURRENT_DATE())
    ORDER BY event_date DESC
  `;

  return await getClient().query(sql);
}

/**
 * Search health records semantically
 * @param {string} query - Natural language query
 * @param {number} limit - Number of results
 * @returns {Promise<Array>} Matching events
 */
async function search(query, limit = 10) {
  return await getClient().semanticSearch(query, limit);
}

/**
 * Get events by type within date range
 * @param {string} type - Event type (appointment, medication, lab_result, etc.)
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Matching events
 */
async function getEventsByType(type, options = {}) {
  const { startDate, endDate, limit = 100 } = options;

  let sql = `
    SELECT event_id, event_date, event_timestamp, content, metadata
    FROM henry_health
    WHERE event_type = '${type}'
  `;

  if (startDate) {
    sql += ` AND event_date >= '${startDate}'::DATE`;
  }
  if (endDate) {
    sql += ` AND event_date <= '${endDate}'::DATE`;
  }

  sql += ` ORDER BY event_date DESC LIMIT ${limit}`;

  return await getClient().query(sql);
}

/**
 * Get timeline of events for specific date range
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Array>} Events in chronological order
 */
async function timeline(startDate, endDate) {
  const sql = `
    SELECT event_id, event_type, event_date, event_timestamp, content
    FROM henry_health
    WHERE event_date BETWEEN '${startDate}'::DATE AND '${endDate}'::DATE
    ORDER BY event_date, event_timestamp
  `;

  return await getClient().query(sql);
}

/**
 * Check for appointments in next N hours (for heartbeat alerts)
 * @param {number} hours - Number of hours to look ahead
 * @returns {Promise<Array>} Upcoming appointments
 */
async function appointmentsSoon(hours = 48) {
  const sql = `
    SELECT event_id, event_date, event_timestamp, content, metadata
    FROM henry_health
    WHERE event_type = 'appointment'
      AND event_timestamp >= CURRENT_TIMESTAMP()
      AND event_timestamp <= DATEADD(hour, ${hours}, CURRENT_TIMESTAMP())
    ORDER BY event_timestamp
  `;

  return await getClient().query(sql);
}

/**
 * Close connection
 */
async function close() {
  if (client) {
    await client.close();
    client = null;
  }
}

module.exports = {
  nextAppointment,
  upcomingAppointments,
  activeMedications,
  recentLabResults,
  search,
  getEventsByType,
  timeline,
  appointmentsSoon,
  close
};
