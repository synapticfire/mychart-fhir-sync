/**
 * Epic FHIR Client
 * 
 * Handles OAuth2 authentication and FHIR resource retrieval from Epic MyChart.
 * Implements SMART on FHIR standalone launch flow.
 * 
 * References:
 * - https://fhir.epic.com/Documentation
 * - https://open.epic.com/Tutorial/PatientAuthentication
 */

const axios = require('axios');
const crypto = require('crypto');

class FHIRClient {
  constructor(config) {
    this.clientId = config.clientId;
    this.fhirBaseUrl = config.fhirBaseUrl; // e.g., https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4
    this.redirectUri = config.redirectUri || 'http://localhost:8080/callback';
    this.scope = config.scope || 'launch/patient patient/*.read';
    
    // OAuth endpoints (Epic-specific)
    this.authUrl = config.authUrl || `${this.fhirBaseUrl.replace('/api/FHIR/R4', '')}/oauth2/authorize`;
    this.tokenUrl = config.tokenUrl || `${this.fhirBaseUrl.replace('/api/FHIR/R4', '')}/oauth2/token`;
    
    this.accessToken = null;
    this.refreshToken = null;
    this.patientId = null;
  }

  /**
   * Generate PKCE challenge for OAuth2
   */
  generatePKCE() {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url');
    
    return { verifier, challenge };
  }

  /**
   * Step 1: Generate authorization URL for user to visit
   * @returns {Object} - { url, state, codeVerifier }
   */
  getAuthorizationUrl() {
    const state = crypto.randomBytes(16).toString('hex');
    const { verifier, challenge } = this.generatePKCE();

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: this.scope,
      state: state,
      aud: this.fhirBaseUrl,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    });

    const url = `${this.authUrl}?${params.toString()}`;

    return {
      url,
      state,
      codeVerifier: verifier
    };
  }

  /**
   * Step 2: Exchange authorization code for access token
   * @param {string} code - Authorization code from callback
   * @param {string} codeVerifier - PKCE verifier from step 1
   * @returns {Promise<Object>} Token response
   */
  async exchangeCodeForToken(code, codeVerifier) {
    const response = await axios.post(
      this.tokenUrl,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: this.redirectUri,
        client_id: this.clientId,
        code_verifier: codeVerifier
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    this.accessToken = response.data.access_token;
    this.refreshToken = response.data.refresh_token;
    this.patientId = response.data.patient;

    return response.data;
  }

  /**
   * Refresh access token using refresh token
   * @returns {Promise<Object>} New token response
   */
  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await axios.post(
      this.tokenUrl,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
        client_id: this.clientId
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    this.accessToken = response.data.access_token;
    if (response.data.refresh_token) {
      this.refreshToken = response.data.refresh_token;
    }

    return response.data;
  }

  /**
   * Make authenticated FHIR request
   * @param {string} path - FHIR resource path (e.g., /Patient/123)
   * @returns {Promise<Object>} FHIR resource
   */
  async request(path) {
    if (!this.accessToken) {
      throw new Error('Not authenticated. Call exchangeCodeForToken first.');
    }

    try {
      const response = await axios.get(`${this.fhirBaseUrl}${path}`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/fhir+json'
        }
      });

      return response.data;
    } catch (error) {
      // If 401, try refreshing token
      if (error.response?.status === 401 && this.refreshToken) {
        await this.refreshAccessToken();
        return this.request(path); // Retry
      }
      throw error;
    }
  }

  /**
   * Get patient record
   * @param {string} patientId - Patient FHIR ID (optional, uses authenticated patient if not provided)
   * @returns {Promise<Object>} Patient FHIR resource
   */
  async getPatient(patientId = null) {
    const id = patientId || this.patientId;
    if (!id) {
      throw new Error('No patient ID available');
    }
    return await this.request(`/Patient/${id}`);
  }

  /**
   * Get appointments for patient
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Bundle of Appointment resources
   */
  async getAppointments(options = {}) {
    const params = new URLSearchParams({
      patient: this.patientId,
      ...options
    });

    return await this.request(`/Appointment?${params.toString()}`);
  }

  /**
   * Get medications for patient
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Bundle of MedicationRequest resources
   */
  async getMedications(options = {}) {
    const params = new URLSearchParams({
      patient: this.patientId,
      ...options
    });

    return await this.request(`/MedicationRequest?${params.toString()}`);
  }

  /**
   * Get lab results (observations)
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Bundle of Observation resources
   */
  async getObservations(options = {}) {
    const params = new URLSearchParams({
      patient: this.patientId,
      category: 'laboratory',
      ...options
    });

    return await this.request(`/Observation?${params.toString()}`);
  }

  /**
   * Get conditions (diagnoses)
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Bundle of Condition resources
   */
  async getConditions(options = {}) {
    const params = new URLSearchParams({
      patient: this.patientId,
      ...options
    });

    return await this.request(`/Condition?${params.toString()}`);
  }

  /**
   * Save tokens to file for persistence
   * @param {string} filepath - Path to save tokens
   */
  saveTokens(filepath) {
    const fs = require('fs');
    const tokens = {
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      patientId: this.patientId
    };
    fs.writeFileSync(filepath, JSON.stringify(tokens, null, 2));
  }

  /**
   * Load tokens from file
   * @param {string} filepath - Path to load tokens from
   */
  loadTokens(filepath) {
    const fs = require('fs');
    if (fs.existsSync(filepath)) {
      const tokens = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      this.accessToken = tokens.accessToken;
      this.refreshToken = tokens.refreshToken;
      this.patientId = tokens.patientId;
      return true;
    }
    return false;
  }
}

module.exports = FHIRClient;
