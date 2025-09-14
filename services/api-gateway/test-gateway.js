#!/usr/bin/env node

/**
 * API Gateway Test Script
 * Tests the Constella API Gateway functionality
 */

const axios = require('axios');
const colors = require('colors');

// Configuration
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';
const TEST_TIMEOUT = 30000;

// Test results tracking
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

// Test utilities
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  switch (type) {
    case 'success':
      console.log(`[${timestamp}] ✅ ${message}`.green);
      break;
    case 'error':
      console.log(`[${timestamp}] ❌ ${message}`.red);
      break;
    case 'warning':
      console.log(`[${timestamp}] ⚠️  ${message}`.yellow);
      break;
    case 'info':
    default:
      console.log(`[${timestamp}] ℹ️  ${message}`.blue);
      break;
  }
}

function test(name, testFn) {
  return async () => {
    totalTests++;
    try {
      log(`Running test: ${name}`, 'info');
      await testFn();
      passedTests++;
      log(`PASSED: ${name}`, 'success');
    } catch (error) {
      failedTests++;
      log(`FAILED: ${name} - ${error.message}`, 'error');
      if (process.env.VERBOSE) {
        console.error(error.stack);
      }
    }
  };
}

// HTTP client with default configuration
const client = axios.create({
  baseURL: GATEWAY_URL,
  timeout: TEST_TIMEOUT,
  validateStatus: () => true // Don't throw on HTTP error codes
});

// Test suites
const tests = {
  // Health check tests
  healthCheck: test('Health Check', async () => {
    const response = await client.get('/health');

    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }

    if (!response.data.status) {
      throw new Error('Health check response missing status field');
    }

    log(`Health status: ${response.data.status}`, 'info');
  }),

  // Gateway status tests
  gatewayStatus: test('Gateway Status (Unauthenticated)', async () => {
    const response = await client.get('/v1/status');

    // Should work without authentication (public endpoint)
    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }

    if (!response.data.success) {
      throw new Error('Status response should be successful');
    }

    log(`Gateway version: ${response.data.data?.gateway?.version}`, 'info');
  }),

  // Authentication tests
  authenticationWithoutCredentials: test('Authentication Without Credentials', async () => {
    const response = await client.get('/v1/agents/test/trigger');

    if (response.status !== 401) {
      throw new Error(`Expected status 401, got ${response.status}`);
    }

    if (response.data.error?.code !== 'AUTHENTICATION_ERROR') {
      throw new Error(`Expected AUTHENTICATION_ERROR, got ${response.data.error?.code}`);
    }
  }),

  // Development token generation
  generateDevTokens: test('Generate Development Tokens', async () => {
    const response = await client.get('/dev/tokens');

    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }

    if (!response.data.success || !response.data.data) {
      throw new Error('Token generation failed');
    }

    const tokens = response.data.data;
    if (!tokens.admin || !tokens.user) {
      throw new Error('Missing admin or user tokens');
    }

    // Store tokens for later tests
    process.env.ADMIN_TOKEN = tokens.admin;
    process.env.USER_TOKEN = tokens.user;

    log('Development tokens generated successfully', 'success');
  }),

  // API key authentication
  apiKeyAuthentication: test('API Key Authentication', async () => {
    const response = await client.get('/v1/status', {
      headers: {
        'X-API-Key': 'dev-key-12345'
      }
    });

    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }

    if (!response.data.success) {
      throw new Error('API key authentication failed');
    }
  }),

  // JWT authentication
  jwtAuthentication: test('JWT Authentication', async () => {
    if (!process.env.ADMIN_TOKEN) {
      throw new Error('Admin token not available from previous test');
    }

    const response = await client.get('/v1/status', {
      headers: {
        'Authorization': `Bearer ${process.env.ADMIN_TOKEN}`
      }
    });

    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }

    if (!response.data.success) {
      throw new Error('JWT authentication failed');
    }
  }),

  // Agent listing
  listAgents: test('List Agents', async () => {
    const response = await client.get('/v1/agents', {
      headers: {
        'X-API-Key': 'dev-key-12345'
      }
    });

    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }

    if (!response.data.success || !Array.isArray(response.data.data)) {
      throw new Error('Agent listing failed or returned invalid data');
    }

    log(`Found ${response.data.data.length} agents`, 'info');
  }),

  // Rate limiting
  rateLimiting: test('Rate Limiting', async () => {
    const requests = [];
    const maxRequests = 10;

    // Send multiple requests quickly
    for (let i = 0; i < maxRequests; i++) {
      requests.push(
        client.get('/v1/status', {
          headers: {
            'X-API-Key': 'dev-key-12345'
          }
        })
      );
    }

    const responses = await Promise.all(requests);
    const rateLimitedResponses = responses.filter(r => r.status === 429);

    log(`Sent ${maxRequests} requests, ${rateLimitedResponses.length} were rate limited`, 'info');

    // We expect at least some requests to succeed
    const successfulResponses = responses.filter(r => r.status === 200);
    if (successfulResponses.length === 0) {
      throw new Error('All requests were blocked, rate limiting too aggressive');
    }
  }),

  // Invalid routes
  invalidRoute: test('Invalid Route Handling', async () => {
    const response = await client.get('/v1/nonexistent/route');

    if (response.status !== 404) {
      throw new Error(`Expected status 404, got ${response.status}`);
    }

    if (response.data.error?.code !== 'VALIDATION_ERROR') {
      throw new Error(`Expected VALIDATION_ERROR, got ${response.data.error?.code}`);
    }
  }),

  // Metrics endpoint
  metricsEndpoint: test('Metrics Endpoint', async () => {
    const response = await client.get('/metrics');

    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }

    // Check for Prometheus format
    if (!response.data.includes('# HELP') || !response.data.includes('# TYPE')) {
      throw new Error('Metrics response is not in Prometheus format');
    }

    log('Metrics endpoint returning Prometheus format data', 'info');
  }),

  // CORS headers
  corsHeaders: test('CORS Headers', async () => {
    const response = await client.options('/v1/status', {
      headers: {
        'Origin': 'http://localhost:3001',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Authorization'
      }
    });

    if (!response.headers['access-control-allow-origin']) {
      throw new Error('Missing CORS Allow-Origin header');
    }

    if (!response.headers['access-control-allow-methods']) {
      throw new Error('Missing CORS Allow-Methods header');
    }

    log('CORS headers present and valid', 'info');
  }),

  // Service discovery
  serviceDiscovery: test('Service Discovery Status', async () => {
    const response = await client.get('/dev/services');

    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }

    if (!response.data.success || !response.data.data) {
      throw new Error('Service discovery status failed');
    }

    const services = response.data.data;
    log(`Services: ${services.services.total} total, ${services.services.healthy} healthy`, 'info');
    log(`Agents: ${services.agents.total} total, ${services.agents.active} active`, 'info');
  }),

  // Agent trigger (mock)
  agentTrigger: test('Agent Trigger', async () => {
    const response = await client.post('/v1/agents/architecture/trigger', {
      action: 'analyze',
      parameters: {
        code: 'function hello() { return "world"; }'
      }
    }, {
      headers: {
        'X-API-Key': 'dev-key-12345'
      }
    });

    // This might fail if no orchestrator service is running
    // We'll check for either success or a proper service unavailable error
    if (response.status === 200) {
      if (!response.data.success) {
        throw new Error('Agent trigger should be successful');
      }
      log('Agent trigger successful', 'success');
    } else if (response.status === 503) {
      if (response.data.error?.code !== 'SERVICE_UNAVAILABLE') {
        throw new Error(`Expected SERVICE_UNAVAILABLE error, got ${response.data.error?.code}`);
      }
      log('Agent trigger failed as expected (service unavailable)', 'warning');
    } else if (response.status === 404) {
      if (response.data.error?.code !== 'VALIDATION_ERROR') {
        throw new Error(`Expected VALIDATION_ERROR for missing agent, got ${response.data.error?.code}`);
      }
      log('Agent not found as expected (no agents discovered)', 'warning');
    } else {
      throw new Error(`Unexpected response status: ${response.status}`);
    }
  })
};

// Main test runner
async function runTests() {
  console.log('\n=== Constella API Gateway Test Suite ==='.cyan.bold);
  console.log(`Testing gateway at: ${GATEWAY_URL}`.cyan);
  console.log(`Timeout: ${TEST_TIMEOUT}ms\n`.cyan);

  // Check if gateway is running
  try {
    await client.get('/health');
    log('Gateway is running', 'success');
  } catch (error) {
    log(`Gateway is not accessible: ${error.message}`, 'error');
    log('Make sure the API Gateway is running on the correct port', 'error');
    process.exit(1);
  }

  // Run all tests
  const testNames = Object.keys(tests);
  log(`Running ${testNames.length} tests...`, 'info');

  for (const testName of testNames) {
    await tests[testName]();
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Print summary
  console.log('\n=== Test Results ==='.cyan.bold);
  console.log(`Total tests: ${totalTests}`.blue);
  console.log(`Passed: ${passedTests}`.green);
  console.log(`Failed: ${failedTests}`.red);
  console.log(`Success rate: ${((passedTests / totalTests) * 100).toFixed(2)}%`.blue);

  if (failedTests === 0) {
    console.log('\n🎉 All tests passed!'.green.bold);
    process.exit(0);
  } else {
    console.log('\n💥 Some tests failed. Check the logs above.'.red.bold);
    process.exit(1);
  }
}

// Handle CLI arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage: node test-gateway.js [options]

Options:
  --verbose, -v     Show detailed error information
  --help, -h       Show this help message

Environment Variables:
  GATEWAY_URL      Gateway URL (default: http://localhost:3000)
  VERBOSE         Show verbose output
  `.trim());
  process.exit(0);
}

if (process.argv.includes('--verbose') || process.argv.includes('-v')) {
  process.env.VERBOSE = 'true';
}

// Error handling
process.on('unhandledRejection', (error) => {
  log(`Unhandled promise rejection: ${error.message}`, 'error');
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  log(`Uncaught exception: ${error.message}`, 'error');
  process.exit(1);
});

// Run tests if this script is executed directly
if (require.main === module) {
  runTests().catch((error) => {
    log(`Test runner error: ${error.message}`, 'error');
    process.exit(1);
  });
}

module.exports = { runTests, tests };
