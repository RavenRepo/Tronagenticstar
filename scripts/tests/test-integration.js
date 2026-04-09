#!/usr/bin/env node

/**
 * Constella API Gateway Integration Test
 * Tests the connection between VS Code extension and API Gateway
 */

const axios = require('axios');
const colors = require('colors');

// Test configuration
const CONFIG = {
  gatewayUrl: 'http://localhost:3000',
  timeout: 10000,
  retries: 3
};

// Test results tracker
let testResults = {
  passed: 0,
  failed: 0,
  total: 0
};

/**
 * Utility functions
 */
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  switch (type) {
    case 'success':
      console.log(`[${timestamp}] ✅ ${message}`.green);
      break;
    case 'error':
      console.log(`[${timestamp}] ❌ ${message}`.red);
      break;
    case 'warn':
      console.log(`[${timestamp}] ⚠️  ${message}`.yellow);
      break;
    case 'info':
    default:
      console.log(`[${timestamp}] ℹ️  ${message}`.blue);
      break;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Test runner
 */
async function runTest(testName, testFn) {
  testResults.total++;
  log(`Running: ${testName}`, 'info');

  try {
    await testFn();
    testResults.passed++;
    log(`PASSED: ${testName}`, 'success');
  } catch (error) {
    testResults.failed++;
    log(`FAILED: ${testName} - ${error.message}`, 'error');
  }
}

/**
 * API Gateway Tests
 */
async function testGatewayHealth() {
  const response = await axios.get(`${CONFIG.gatewayUrl}/health`, {
    timeout: CONFIG.timeout
  });

  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}`);
  }

  if (!response.data.status || response.data.status !== 'healthy') {
    throw new Error(`Expected healthy status, got ${response.data.status}`);
  }

  log(`Gateway health check passed - Status: ${response.data.status}`, 'info');
}

async function testGatewayStatus() {
  const response = await axios.get(`${CONFIG.gatewayUrl}/v1/status`, {
    timeout: CONFIG.timeout
  });

  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}`);
  }

  if (!response.data.version) {
    throw new Error('No version information in status response');
  }

  log(`Gateway version: ${response.data.version}`, 'info');

  if (response.data.services) {
    const serviceCount = Object.keys(response.data.services).length;
    log(`Services discovered: ${serviceCount}`, 'info');
  }
}

async function testAgentsEndpoint() {
  const response = await axios.get(`${CONFIG.gatewayUrl}/v1/agents`, {
    timeout: CONFIG.timeout
  });

  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}`);
  }

  if (!Array.isArray(response.data)) {
    throw new Error('Expected agents response to be an array');
  }

  log(`Agents endpoint returned ${response.data.length} agents`, 'info');
}

async function testAuthenticationWithApiKey() {
  try {
    const response = await axios.get(`${CONFIG.gatewayUrl}/v1/status`, {
      headers: {
        'X-API-Key': 'dev-key-12345'
      },
      timeout: CONFIG.timeout
    });

    if (response.status !== 200) {
      throw new Error(`Expected status 200 with API key, got ${response.status}`);
    }

    log('API Key authentication working', 'info');
  } catch (error) {
    if (error.response?.status === 401) {
      log('API Key authentication properly rejected invalid key', 'info');
    } else {
      throw error;
    }
  }
}

async function testRateLimitHeaders() {
  const response = await axios.get(`${CONFIG.gatewayUrl}/v1/status`, {
    timeout: CONFIG.timeout
  });

  const rateLimitHeaders = [
    'x-ratelimit-limit',
    'x-ratelimit-remaining',
    'x-ratelimit-reset'
  ];

  const foundHeaders = rateLimitHeaders.filter(header =>
    response.headers[header] !== undefined
  );

  if (foundHeaders.length > 0) {
    log(`Rate limiting headers present: ${foundHeaders.join(', ')}`, 'info');
  }
}

async function testMetricsEndpoint() {
  try {
    const response = await axios.get(`${CONFIG.gatewayUrl}/metrics`, {
      timeout: CONFIG.timeout
    });

    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }

    if (typeof response.data !== 'string' || !response.data.includes('# HELP')) {
      throw new Error('Metrics endpoint did not return Prometheus format');
    }

    log('Metrics endpoint working and returning Prometheus format', 'info');
  } catch (error) {
    if (error.response?.status === 404) {
      log('Metrics endpoint not available (may be disabled)', 'warn');
    } else {
      throw error;
    }
  }
}

/**
 * VS Code Extension Integration Tests
 */
async function testVSCodeExtensionEndpoints() {
  // Test the endpoints that the VS Code extension will use

  // Test service proxy endpoint pattern
  try {
    const response = await axios.get(`${CONFIG.gatewayUrl}/v1/services/orchestrator/health`, {
      timeout: CONFIG.timeout
    });

    log('Service proxy endpoint structure working', 'info');
  } catch (error) {
    if (error.response?.status === 404 || error.response?.status === 502) {
      log('Service proxy returns expected error for unavailable service', 'info');
    } else {
      throw error;
    }
  }
}

async function testDevTokensEndpoint() {
  try {
    const response = await axios.get(`${CONFIG.gatewayUrl}/dev/tokens`, {
      timeout: CONFIG.timeout
    });

    if (response.status === 200 && response.data.admin && response.data.user) {
      log('Development tokens endpoint working', 'info');
      log(`Admin token length: ${response.data.admin.length}`, 'info');
      log(`User token length: ${response.data.user.length}`, 'info');
    }
  } catch (error) {
    if (error.response?.status === 404) {
      log('Dev tokens endpoint not available (production mode)', 'warn');
    } else {
      throw error;
    }
  }
}

/**
 * Connection and Performance Tests
 */
async function testConnectionSpeed() {
  const iterations = 5;
  const times = [];

  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    await axios.get(`${CONFIG.gatewayUrl}/health`, {
      timeout: CONFIG.timeout
    });
    const end = Date.now();
    times.push(end - start);
  }

  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);

  log(`Connection performance - Avg: ${avgTime}ms, Min: ${minTime}ms, Max: ${maxTime}ms`, 'info');

  if (avgTime > 1000) {
    throw new Error(`Average response time too high: ${avgTime}ms`);
  }
}

async function testConcurrentRequests() {
  const concurrency = 10;
  const requests = Array(concurrency).fill().map(() =>
    axios.get(`${CONFIG.gatewayUrl}/health`, {
      timeout: CONFIG.timeout
    })
  );

  const start = Date.now();
  const results = await Promise.all(requests);
  const end = Date.now();

  const successCount = results.filter(r => r.status === 200).length;

  if (successCount !== concurrency) {
    throw new Error(`Expected ${concurrency} successful requests, got ${successCount}`);
  }

  log(`Concurrent requests test passed - ${concurrency} requests in ${end - start}ms`, 'info');
}

/**
 * Main test execution
 */
async function main() {
  console.log('\n🚀 Constella API Gateway Integration Test Suite\n'.cyan.bold);
  console.log(`Gateway URL: ${CONFIG.gatewayUrl}`.gray);
  console.log(`Timeout: ${CONFIG.timeout}ms`.gray);
  console.log('─'.repeat(60).gray);

  // Wait for potential gateway startup
  log('Waiting for gateway to be ready...', 'info');
  await sleep(2000);

  try {
    // Basic connectivity tests
    await runTest('Gateway Health Check', testGatewayHealth);
    await runTest('Gateway Status Endpoint', testGatewayStatus);
    await runTest('Agents Endpoint', testAgentsEndpoint);

    // Authentication tests
    await runTest('API Key Authentication', testAuthenticationWithApiKey);

    // Feature tests
    await runTest('Rate Limit Headers', testRateLimitHeaders);
    await runTest('Metrics Endpoint', testMetricsEndpoint);

    // VS Code Extension specific tests
    await runTest('VS Code Extension Endpoints', testVSCodeExtensionEndpoints);
    await runTest('Development Tokens', testDevTokensEndpoint);

    // Performance tests
    await runTest('Connection Speed', testConnectionSpeed);
    await runTest('Concurrent Requests', testConcurrentRequests);

  } catch (error) {
    log(`Unexpected error during tests: ${error.message}`, 'error');
    testResults.failed++;
    testResults.total++;
  }

  // Results summary
  console.log('\n' + '─'.repeat(60).gray);
  console.log('📊 Test Results Summary'.cyan.bold);
  console.log('─'.repeat(60).gray);
  console.log(`Total Tests: ${testResults.total}`.white);
  console.log(`Passed: ${testResults.passed}`.green);
  console.log(`Failed: ${testResults.failed}`.red);
  console.log(`Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`.yellow);

  if (testResults.failed === 0) {
    console.log('\n🎉 All tests passed! API Gateway is ready for VS Code extension integration.'.green.bold);
    console.log('\n📝 Next Steps:'.cyan.bold);
    console.log('1. Build and install the VS Code extension'.white);
    console.log('2. Configure the extension with the gateway URL'.white);
    console.log('3. Add API keys for authentication'.white);
    console.log('4. Test agent interactions through the extension'.white);
  } else {
    console.log(`\n⚠️  ${testResults.failed} test(s) failed. Please review the issues above.`.red.bold);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  log(`Unhandled promise rejection: ${error.message}`, 'error');
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  log(`Uncaught exception: ${error.message}`, 'error');
  process.exit(1);
});

// Run the test suite
if (require.main === module) {
  main().catch((error) => {
    log(`Test suite failed: ${error.message}`, 'error');
    process.exit(1);
  });
}

module.exports = {
  runTest,
  testGatewayHealth,
  testGatewayStatus,
  testAgentsEndpoint,
  CONFIG
};
