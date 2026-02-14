/**
 * Snowflake REST API Client
 * 
 * Connects to Snowflake and executes SQL queries via REST API.
 * Handles authentication, query execution, and result parsing.
 */

const axios = require('axios');

class SnowflakeClient {
  constructor(config) {
    this.account = config.account;
    this.user = config.user;
    this.password = config.password;
    this.warehouse = config.warehouse;
    this.database = config.database;
    this.schema = config.schema;
    this.baseUrl = `https://${this.account}.snowflakecomputing.com`;
    this.sessionToken = null;
  }

  /**
   * Authenticate and get session token
   */
  async authenticate() {
    const response = await axios.post(
      `${this.baseUrl}/session/v1/login-request`,
      {
        data: {
          CLIENT_APP_ID: 'mychart-sync',
          CLIENT_APP_VERSION: '0.1.0',
          LOGIN_NAME: this.user,
          PASSWORD: this.password,
          WAREHOUSE: this.warehouse,
          DATABASE: this.database,
          SCHEMA: this.schema
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    if (!response.data.success) {
      throw new Error(`Snowflake authentication failed: ${response.data.message}`);
    }

    this.sessionToken = response.data.data.token;
    return this.sessionToken;
  }

  /**
   * Execute SQL query
   * @param {string} sql - SQL query to execute
   * @returns {Promise<Array>} Query results
   */
  async query(sql) {
    if (!this.sessionToken) {
      await this.authenticate();
    }

    const response = await axios.post(
      `${this.baseUrl}/api/v2/statements`,
      {
        statement: sql,
        timeout: 60,
        database: this.database,
        schema: this.schema,
        warehouse: this.warehouse
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Snowflake Token="${this.sessionToken}"`
        }
      }
    );

    if (response.data.code) {
      throw new Error(`Snowflake query failed: ${response.data.message}`);
    }

    return this.parseResults(response.data);
  }

  /**
   * Parse query results into JavaScript objects
   */
  parseResults(data) {
    if (!data.data || !data.data.length) {
      return [];
    }

    // Extract column names from metadata
    const columns = data.resultSetMetaData.rowType.map(col => col.name);

    // Map rows to objects
    return data.data.map(row => {
      const obj = {};
      columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });
  }

  /**
   * Insert event into henry_health table with Cortex embedding
   * @param {Object} event - Event data
   * @returns {Promise<void>}
   */
  async insertEvent(event) {
    const sql = `
      INSERT INTO henry_health (
        event_id,
        event_type,
        event_date,
        event_timestamp,
        content,
        embedding,
        metadata,
        source
      )
      SELECT
        '${this.escape(event.id)}',
        '${this.escape(event.type)}',
        '${event.date}'::DATE,
        ${event.timestamp ? `'${event.timestamp}'::TIMESTAMP_NTZ` : 'NULL'},
        '${this.escape(event.content)}',
        SNOWFLAKE.CORTEX.EMBED_TEXT_768(
          'snowflake-arctic-embed-m',
          '${this.escape(event.content)}'
        ),
        PARSE_JSON('${this.escape(JSON.stringify(event.metadata))}'),
        '${this.escape(event.source || 'fhir')}'
    `;

    await this.query(sql);
  }

  /**
   * Batch insert events
   * @param {Array<Object>} events - Array of events
   * @returns {Promise<void>}
   */
  async insertEvents(events) {
    if (!events || !events.length) {
      return;
    }

    // Process in batches of 100 to avoid query size limits
    const batchSize = 100;
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);
      await Promise.all(batch.map(event => this.insertEvent(event)));
    }
  }

  /**
   * Get upcoming appointments
   * @param {number} days - Number of days to look ahead
   * @returns {Promise<Array>}
   */
  async getUpcomingAppointments(days = 7) {
    const sql = `
      SELECT event_id, event_date, content, metadata
      FROM henry_health
      WHERE event_type = 'appointment'
        AND event_date >= CURRENT_DATE()
        AND event_date <= DATEADD(day, ${days}, CURRENT_DATE())
      ORDER BY event_date
    `;

    return await this.query(sql);
  }

  /**
   * Get active medications
   * @returns {Promise<Array>}
   */
  async getActiveMedications() {
    const sql = `
      SELECT event_id, content, metadata, updated_at
      FROM henry_health
      WHERE event_type = 'medication'
        AND metadata:status::STRING = 'active'
      ORDER BY updated_at DESC
    `;

    return await this.query(sql);
  }

  /**
   * Semantic search using vector similarity
   * @param {string} query - Search query
   * @param {number} limit - Number of results
   * @returns {Promise<Array>}
   */
  async semanticSearch(query, limit = 10) {
    const sql = `
      SELECT
        event_id,
        event_type,
        event_date,
        content,
        metadata,
        VECTOR_COSINE_SIMILARITY(
          embedding,
          SNOWFLAKE.CORTEX.EMBED_TEXT_768('snowflake-arctic-embed-m', '${this.escape(query)}')
        ) AS similarity
      FROM henry_health
      ORDER BY similarity DESC
      LIMIT ${limit}
    `;

    return await this.query(sql);
  }

  /**
   * Close session
   */
  async close() {
    if (this.sessionToken) {
      try {
        await axios.post(
          `${this.baseUrl}/session`,
          {},
          {
            headers: {
              'Authorization': `Snowflake Token="${this.sessionToken}"`,
              'X-Snowflake-Authorization-Token-Type': 'KEYPAIR_JWT'
            },
            params: { delete: 'true' }
          }
        );
      } catch (err) {
        // Ignore errors on close
      }
      this.sessionToken = null;
    }
  }

  /**
   * Escape single quotes for SQL
   */
  escape(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/'/g, "''");
  }
}

module.exports = SnowflakeClient;
