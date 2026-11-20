import {
  normalizeKenyanPhoneNumber,
  sendSozuriSms,
  getSozuriConfigFromEnv,
  SOZURI_API_ENDPOINT,
} from '../src/lib/smsService';

async function runTests() {
  console.log('=== STARTING SOZURI SMS INTEGRATION TEST SUITE ===\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✓ PASS: ${testName} ${detail ? `(${detail})` : ''}`);
      passed++;
    } else {
      console.error(`✗ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1: Phone Validation & Kenyan Network Detection
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 1: Phone Number Validation & Conversion ---');

  const p1 = normalizeKenyanPhoneNumber('0712345678');
  assert(p1.isValid && p1.normalized === '+254712345678' && p1.network === 'Safaricom',
    'Local 07xx format converts to +254 E.164 and identifies Safaricom', p1.normalized);

  const p2 = normalizeKenyanPhoneNumber('0110123456');
  assert(p2.isValid && p2.normalized === '+254110123456' && p2.network === 'Safaricom',
    'Local 01xx format converts to +254 E.164 and identifies Safaricom (011x series)', p2.normalized);

  const p3 = normalizeKenyanPhoneNumber('254733123456');
  assert(p3.isValid && p3.normalized === '+254733123456' && p3.network === 'Airtel',
    'International 2547xx format normalizes with plus and identifies Airtel', p3.normalized);

  const p4 = normalizeKenyanPhoneNumber('+254770123456');
  assert(p4.isValid && p4.normalized === '+254770123456' && p4.network === 'Telkom',
    '+25477x format preserves E.164 and identifies Telkom', p4.normalized);

  const p5 = normalizeKenyanPhoneNumber('invalid_123');
  assert(!p5.isValid, 'Invalid phone string rejected', p5.error);

  const p6 = normalizeKenyanPhoneNumber('0812345678');
  assert(!p6.isValid, 'Invalid Kenyan prefix rejected', p6.error);

  // --------------------------------------------------------------------------
  // TEST 2: Environment Config Safety & Credential Protection
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 2: Environment Variable Configuration ---');

  const cfg = getSozuriConfigFromEnv();
  assert(typeof cfg.project === 'string' && typeof cfg.senderId === 'string',
    'Sozuri config resolves project and senderId safely');
  assert(SOZURI_API_ENDPOINT === 'https://sozuri.net/api/v1/messaging',
    'Target endpoint exactly matches official Sozuri specification');

  // --------------------------------------------------------------------------
  // TEST 3: Sandbox Mode Dispatch
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 3: Sandbox Simulated Dispatch ---');

  const sandboxRes = await sendSozuriSms({
    to: '0712345678',
    message: 'Hello from Sozuri Sandbox Test',
    from: 'ARABELLA',
    environment: 'sandbox',
  });
  assert(sandboxRes.success && sandboxRes.simulated === true,
    'Sandbox dispatch succeeds with simulated flag', sandboxRes.messageId);
  assert(sandboxRes.recipient === '+254712345678',
    'Sandbox recipient is converted to +254 format', sandboxRes.recipient);
  assert(sandboxRes.rawResponse?.apiKey === undefined,
    'Credentials sanitized: apiKey is NEVER present in rawResponse');

  // --------------------------------------------------------------------------
  // TEST 4: Real Sozuri API Call with Invalid Credentials (Authentication Failure Handling)
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 4: Live Sozuri API Error & Auth Failure Handling ---');

  // Temporarily simulate live credentials to test real network request against sozuri.net
  process.env.SOZURI_PROJECT = 'test-rms-project';
  process.env.SOZURI_API_KEY = 'invalid_mock_api_key_test';
  process.env.SOZURI_SENDER_ID = 'ARABELLA';

  const liveRes = await sendSozuriSms({
    to: '0712345678',
    message: 'Live test message',
    from: 'ARABELLA',
    environment: 'production',
    timeoutMs: 8000,
  });

  assert(!liveRes.success, 'Invalid API key is gracefully rejected by Sozuri');
  assert(liveRes.statusCode === 401 || liveRes.statusCode === 403,
    'HTTP status code accurately captured from Sozuri API', `Status: ${liveRes.statusCode}`);
  assert(liveRes.errorMessage !== undefined && liveRes.errorMessage.length > 0,
    'Meaningful error message extracted from Sozuri response', liveRes.errorMessage);
  assert(liveRes.rawResponse?.apiKey === undefined,
    'Raw response in error log is sanitized of credentials');

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log(`\n==================================================`);
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`==================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
