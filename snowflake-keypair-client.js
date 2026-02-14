/**
 * Snowflake REST API Client with Key Pair Authentication
 * 
 * Connects to Snowflake using RSA key pair authentication.
 * More secure than password-based auth for service accounts.
 */

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');

class SnowflakeClient {
  constructor(config) {
    this.account = config.account;
    this.user = config.user;
    this.warehouse = config.warehouse;
    this.database = config.database;
    this.schema = config.schema;
    this.baseUrl = `https://${this.account}.snowflakecomputing.com`;
    
    // Support both password and key pair auth
    this.password = config.password;
    this.privateKeyPath = config.privateKeyPath;
    
    this.sessionToken = null;
  }

  /**
   * Generate JWT token from private key for authentication
   */
  generateJWT() {
    if (!this.privateKeyPath) {
      throw new Error('Private key path not configured');
    }

    // Read private key
    const privateKey = fs.readFileSync(this.privateKeyPath, 'utf8');

    // Extract public key fingerprint
    const publicKey = crypto.createPublicKey(privateKey);
    const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' });
    const fingerprint = crypto.createHash('sha256').update(publicKeyDer).digest('base64');

    // Build JWT
    const accountIdentifier = this.account.toUpperCase();
    const userIdentifier = this.user.toUpperCase();
    const qualifiedUsername = `${accountIdentifier}.${userIdentifier}`;

    const header = {
      alg: 'RS256',
      typ: 'JWT'
    };

    const payload = {
      iss: `${qualifiedUsername}.SHA256:${fingerprint}`,
      sub: qualifiedUsername,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour expiry
    };

    // Sign JWT
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signatureInput = `${encodedHeader}.${encodedPayload}`;

    const signature = crypto.sign('RSA-SHA256', Buffer.from(signatureInput), {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PADDING
    });

    const encodedSignature = signature.toString('base64url');
    return `${signatureInput}.${encodedSignature}`;
  }

  /**
   * Authenticate using JWT (key pair) or password
   */
  async authenticate() {
    let authData;

    if (this.privateKeyPath) {
      // Key pair authentication
      const jwt = this.generateJWT();
      authData = {
        data: {
          CLIENT_APP_ID: 'mychart-sync',
          CLIENT_APP_VERSION: '0.1.0',
          AUTHENTICATOR: 'SNOWFLAKE_JWT',
          TOKEN: jwt,
          WAREHOUSE: this.warehouse,
          DATABASE: this.database,
          SCHEMA: this.schema
        }
      };
    } else if (this.password) {
      // Password authentication (fallback)
      authData = {
        data: {
          CLIENT_APP_ID: 'mychart-sync',
          CLIENT_APP_VERSION: '0.1.0',
          LOGIN_NAME: this.user,
          PASSWORD: this.password,
          WAREHOUSE: this.warehouse,
          DATABASE: this.database,
          SCHEMA: this.schema
        }
      };
    } else {
      throw new Error('No authentication method configured (need privateKeyPath or password)');
    }

    const response = await axios.post(
      `${this.baseUrl}/session/v1/login-request`,
      authData,
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

    const columns = data.resultSetMetaData.rowType.map(col => col.name);

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
        fhir_resource_type,
        fhir_resource_id,
        content,
        data,
        embedding,
        source
      )
      SELECT
        '${this.escape(event.id)}',
        '${this.escape(event.type)}',
        '${event.date}'::TIMESTAMP_NTZ,
        ${event.fhirResourceType ? `'${this.escape(event.fhirResourceType)}'` : 'NULL'},
        ${event.fhirResourceId ? `'${this.escape(event.fhirResourceId)}'` : 'NULL'},
        '${this.escape(event.content)}',
        PARSE_JSON('${this.escape(JSON.stringify(event.data))}'),
        SNOWFLAKE.CORTEX.EMBED_TEXT_768(
          'snowflake-arctic-embed-m',
          '${this.escape(event.content)}'
        ),
        '${this.escape(event.source || 'mychart_sync')}'
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

    // Process in batches of 50 to avoid query size limits
    const batchSize = 50;
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
      SELECT event_id, event_date, content, data
      FROM henry_health
      WHERE event_type = 'appointment'
        AND event_date >= CURRENT_TIMESTAMP()
        AND event_date <= DATEADD(day, ${days}, CURRENT_TIMESTAMP())
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
      SELECT event_id, content, data, updated_at
      FROM henry_health
      WHERE event_type = 'medication'
        AND data:status::STRING = 'active'
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
        data,
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
