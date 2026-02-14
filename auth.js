#!/usr/bin/env node

/**
 * Epic FHIR OAuth2 Authentication Flow
 * 
 * Handles the initial OAuth2 authorization for Epic MyChart.
 * Run this once to get access tokens, then use sync.js for data retrieval.
 * 
 * Usage:
 *   node auth.js
 */

require('dotenv').config();
const FHIRClient = require('./fhir-client');
const http = require('http');
const url = require('url');

const config = {
  clientId: process.env.EPIC_CLIENT_ID,
  fhirBaseUrl: process.env.EPIC_FHIR_BASE_URL,
  redirectUri: process.env.EPIC_REDIRECT_URI || 'http://localhost:8080/callback',
  tokenPath: process.env.EPIC_TOKEN_PATH || './epic-tokens.json'
};

async function authenticate() {
  const client = new FHIRClient(config);

  // Step 1: Generate authorization URL
  const { url: authUrl, state, codeVerifier } = client.getAuthorizationUrl();

  console.log('\n=== Epic MyChart OAuth2 Authorization ===\n');
  console.log('1. Open this URL in your browser:');
  console.log(`\n   ${authUrl}\n`);
  console.log('2. Sign in to MyChart and authorize the application');
  console.log('3. You will be redirected back to this app\n');

  // Step 2: Start local server to receive callback
  const server = http.createServer(async (req, res) => {
    const query = url.parse(req.url, true).query;

    if (query.code && query.state) {
      // Verify state matches
      if (query.state !== state) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('State mismatch error');
        server.close();
        return;
      }

      try {
        // Step 3: Exchange code for tokens
        console.log('Received authorization code, exchanging for tokens...');
        const tokens = await client.exchangeCodeForToken(query.code, codeVerifier);

        // Save tokens
        client.saveTokens(config.tokenPath);

        console.log('\n✓ Authorization successful!');
        console.log(`  Patient ID: ${tokens.patient}`);
        console.log(`  Tokens saved to: ${config.tokenPath}\n`);

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: sans-serif; padding: 2rem;">
              <h1>✓ Authorization Successful!</h1>
              <p>You can close this window and return to the terminal.</p>
              <p>Patient ID: ${tokens.patient}</p>
            </body>
          </html>
        `);

        setTimeout(() => {
          server.close();
          process.exit(0);
        }, 1000);

      } catch (error) {
        console.error('Token exchange failed:', error.message);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Token exchange failed: ' + error.message);
        server.close();
        process.exit(1);
      }
    } else if (query.error) {
      console.error('Authorization failed:', query.error);
      console.error('Description:', query.error_description);
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Authorization failed: ' + query.error);
      server.close();
      process.exit(1);
    }
  });

  const port = new URL(config.redirectUri).port || 8080;
  server.listen(port, () => {
    console.log(`Waiting for callback on port ${port}...`);
  });
}

// Run if called directly
if (require.main === module) {
  authenticate().catch(error => {
    console.error('Authentication failed:', error);
    process.exit(1);
  });
}

module.exports = authenticate;
