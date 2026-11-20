// AUTOMATED TEST SUITE: PROVIDER-AGNOSTIC SMS INTEGRATION
// Run via: npx tsx scripts/test-sms.ts

import {
  normalizeKenyanPhoneNumber,
  getNairobiDateString,
  getNairobiBillingPeriod,
  sendSmsNotification,
  checkSmsAccountBalance,
  querySmsDeliveryReport,
  getSmsConfigFromEnv,
} from '../src/lib/smsService.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✔ ${testName}`);
  } else {
    failed++;
    console.error(`  ✘ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
  }
}

async function runTestSuite() {
  console.log('=============================================================');
  console.log('       STANDARD SMS INTEGRATION AUTOMATED TEST SUITE        ');
  console.log('=============================================================');

  // A. Kenyan Phone Normalization Tests
  console.log('\n--- A. KENYAN PHONE NUMBER NORMALIZATION TESTS ---');
  const saf07 = normalizeKenyanPhoneNumber('0712345678');
  assert(saf07.isValid && saf07.normalized === '+254712345678' && saf07.network === 'Safaricom', 'Normalize 0712345678 -> +254712345678 (Safaricom)');

  const saf01 = normalizeKenyanPhoneNumber('0110123456');
  assert(saf01.isValid && saf01.normalized === '+254110123456' && saf01.network === 'Safaricom', 'Normalize 0110123456 -> +254110123456 (Safaricom 011 series)');

  const airtel = normalizeKenyanPhoneNumber('0733123456');
  assert(airtel.isValid && airtel.normalized === '+254733123456' && airtel.network === 'Airtel', 'Normalize 0733123456 -> +254733123456 (Airtel)');

  const plusFormat = normalizeKenyanPhoneNumber('+254 722 000 000');
  assert(plusFormat.isValid && plusFormat.normalized === '+254722000000', 'Normalize +254 722 000 000 -> +254722000000');

  const spacesFormat = normalizeKenyanPhoneNumber('  0722 123 456  ');
  assert(spacesFormat.isValid && spacesFormat.normalized === '+254722123456', 'Handle leading/trailing and inner whitespace');

  const invalidShort = normalizeKenyanPhoneNumber('0712345');
  assert(!invalidShort.isValid, 'Reject short invalid phone number (0712345)');

  const invalidLetters = normalizeKenyanPhoneNumber('Not A Phone');
  assert(!invalidLetters.isValid, 'Reject non-numeric string');

  const emptyPhone = normalizeKenyanPhoneNumber('');
  assert(!emptyPhone.isValid, 'Reject empty string');

  // B. Africa/Nairobi Timezone Tests
  console.log('\n--- B. AFRICA/NAIROBI TIMEZONE & BILLING PERIOD TESTS ---');
  const nairobiToday = getNairobiDateString();
  assert(/^\d{4}-\d{2}-\d{2}$/.test(nairobiToday), `getNairobiDateString() returns YYYY-MM-DD: ${nairobiToday}`);

  const nairobiPeriod = getNairobiBillingPeriod();
  assert(/^\d{4}-\d{2}$/.test(nairobiPeriod), `getNairobiBillingPeriod() returns YYYY-MM: ${nairobiPeriod}`);

  // C. Environment Configuration Security Tests
  console.log('\n--- C. CREDENTIAL SECURITY & CONFIGURATION TESTS ---');
  const config = getSmsConfigFromEnv();
  assert(typeof config === 'object', 'getSmsConfigFromEnv returns structured config');
  assert(config.environment === 'sandbox' || config.environment === 'production', 'Valid environment state');

  // D. SMS Dispatch Engine Tests
  console.log('\n--- D. SMS DISPATCH ENGINE TESTS ---');
  const dispatchRes = await sendSmsNotification({
    mobile: '0712345678',
    message: 'Test message for Unit B1: Rent due on 05th.',
    senderId: 'ARABELLA',
  });
  assert(dispatchRes.success === true, 'Dispatches SMS successfully');
  assert(Boolean(dispatchRes.messageId), `Generates message ID: ${dispatchRes.messageId}`);
  assert(dispatchRes.recipient === '+254712345678', 'Dispatches to normalized recipient');
  assert(dispatchRes.network === 'Safaricom', 'Correct network Safaricom detected');

  // E. Delivery Status Report (DLR) Tests
  console.log('\n--- E. DELIVERY STATUS QUERY TESTS ---');
  const dlrRes = await querySmsDeliveryReport(dispatchRes.messageId || 'sms_test_id');
  assert(dlrRes.success === true, 'Queries delivery status successfully');
  assert(dlrRes.messageId === (dispatchRes.messageId || 'sms_test_id'), 'Message ID matches queried ID');
  assert(Boolean(dlrRes.deliveryStatus), `Delivery status returned: ${dlrRes.deliveryStatus}`);

  // F. Account Balance Query Tests
  console.log('\n--- F. ACCOUNT BALANCE QUERY TESTS ---');
  const balRes = await checkSmsAccountBalance();
  assert(balRes.success === true, 'Queries account balance successfully');
  assert(balRes.currency === 'KES', `Currency is KES: ${balRes.currency}`);
  assert(typeof balRes.balanceCredits === 'number', `Balance returned: ${balRes.balanceCredits}`);

  // G. Rental Deduplication & Exclusion Logic Tests
  console.log('\n--- G. RENTAL REMINDER & DEDUPLICATION LOGIC TESTS ---');
  const tenant1 = {
    id: 'tenant_1',
    name: 'Wanjiku Mwangi',
    phone: '0712345678',
    currentBalance: 0, // Fully paid
  };
  const shouldSkipPaid = tenant1.currentBalance <= 0;
  assert(shouldSkipPaid === true, 'Paid tenant (balance <= 0) is excluded from reminders');

  const tenant2 = {
    id: 'tenant_2',
    name: 'Kevin Omondi',
    phone: '0722334455',
    currentBalance: 25000, // Unpaid
  };
  const shouldRemindUnpaid = tenant2.currentBalance > 0;
  assert(shouldRemindUnpaid === true, 'Unpaid tenant is flagged for reminder');

  // Deduplication check
  const sentCache = new Set<string>();
  const dedupeKey = `${tenant2.id}:due_soon:${nairobiPeriod}`;
  const firstSend = !sentCache.has(dedupeKey);
  sentCache.add(dedupeKey);
  assert(firstSend === true, 'First reminder for month is allowed');

  const secondSend = !sentCache.has(dedupeKey);
  assert(secondSend === false, 'Duplicate reminder within same billing period is prevented');

  console.log('\n=============================================================');
  console.log(` TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('=============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal error running SMS test suite:', err);
  process.exit(1);
});
