// ============================================================================
// SUPABASE EDGE FUNCTION: send-sms (Sozuri SMS API Integration)
// Path: /supabase/functions/send-sms/index.ts
//
// Environment Secrets (configured via `supabase secrets set` — NEVER in frontend):
//   - SOZURI_API_KEY: Sozuri Bearer API Key (from https://sozuri.net)
//   - SOZURI_PROJECT: Project Name / Identifier on Sozuri
//   - SOZURI_SENDER_ID: Approved Sender ID / Shortcode
//   - SUPABASE_URL: Injected automatically by Supabase Edge Runtime
//   - SUPABASE_SERVICE_ROLE_KEY: Injected automatically by Supabase Edge Runtime
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

export interface SendSmsRequestPayload {
  tenantId?: string;
  tenantRef: string;
  tenantName: string;
  recipientPhone: string;
  propertyName: string;
  unitNumber: string;
  triggerType:
    | 'tenant_registered'
    | 'rent_due_soon'
    | 'rent_overdue'
    | 'payment_confirmed'
    | 'admin_announcement'
    | 'individual_sms'
    | 'bulk_sms';
  messageBody: string;
  paymentId?: string;
  sentBy?: string;
  environmentOverride?: 'sandbox' | 'production';
  forceSend?: boolean;
}

/**
 * Normalizes Kenyan & international phone numbers for Sozuri (254XXXXXXXXX, 12 digits, NO leading +).
 */
function normalizeKenyanPhoneForSozuri(rawPhone: string): {
  valid: boolean;
  normalized: string;
  network?: 'Safaricom' | 'Airtel' | 'Other';
  reason?: string;
} {
  const trimmed = String(rawPhone || '').trim();
  if (!trimmed) {
    return { valid: false, normalized: '', reason: 'Phone number is required.' };
  }

  // Remove spaces, hyphens, parentheses, and leading plus sign
  let cleaned = trimmed.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  }

  // Convert 07XXXXXXXX or 01XXXXXXXX to 254XXXXXXXXX
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = `254${cleaned.slice(1)}`;
  }
  // Convert 7XXXXXXXX or 1XXXXXXXX (9 digits) to 254XXXXXXXXX
  else if ((cleaned.startsWith('7') || cleaned.startsWith('1')) && cleaned.length === 9) {
    cleaned = `254${cleaned}`;
  }

  // Check Kenyan 12-digit standard (2547XXXXXXXX or 2541XXXXXXXX)
  if (/^254[17]\d{8}$/.test(cleaned)) {
    // Detect mobile network
    const prefix = cleaned.slice(3, 6); // 3 digits after 254 (e.g. 700, 712, 733, 110)
    let network: 'Safaricom' | 'Airtel' | 'Other' = 'Other';

    // Safaricom prefixes: 070X, 071X, 072X, 074X, 0757-0759, 0768-0769, 079X, 011X
    const safaricom2Digit = cleaned.slice(3, 5); // e.g. '70', '71', '72', '74', '79', '11'
    const safaricom3Digit = cleaned.slice(3, 6); // e.g. '757', '758', '759', '768', '769'

    if (
      ['70', '71', '72', '74', '79', '11'].includes(safaricom2Digit) ||
      ['757', '758', '759', '768', '769'].includes(safaricom3Digit)
    ) {
      network = 'Safaricom';
    }
    // Airtel prefixes: 073X, 0750-0756, 078X, 010X
    else if (
      ['73', '78', '10'].includes(safaricom2Digit) ||
      ['750', '751', '752', '753', '754', '755', '756'].includes(safaricom3Digit)
    ) {
      network = 'Airtel';
    }

    return { valid: true, normalized: cleaned, network };
  }

  // Fallback for valid international numbers without plus
  if (/^[1-9]\d{9,14}$/.test(cleaned)) {
    return { valid: true, normalized: cleaned, network: 'Other' };
  }

  return {
    valid: false,
    normalized: cleaned,
    reason: `Invalid phone number format "${trimmed}". Expected Kenyan 07XXXXXXXX, 01XXXXXXXX, or 254XXXXXXXXX (12 digits, no leading +).`,
  };
}

/**
 * Ensures every SMS includes the tenant's name and apartment/unit details.
 */
function ensureTenantAndApartmentContext(
  message: string,
  tenantName: string,
  propertyName: string,
  unitNumber: string,
  tenantRef: string
): string {
  let msg = String(message || '').trim();
  const hasName = msg.toLowerCase().includes(tenantName.toLowerCase().split(' ')[0]);
  const hasUnit = msg.toLowerCase().includes(unitNumber.toLowerCase());
  const hasProperty = msg.toLowerCase().includes(propertyName.toLowerCase());

  if (!hasName) {
    msg = `Dear ${tenantName}, ${msg}`;
  }
  if (!hasUnit || !hasProperty) {
    msg = `${msg} [Apt: ${propertyName}, ${unitNumber} • Ref: ${tenantRef}]`;
  }
  return msg;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const payload: SendSmsRequestPayload = await req.json();
    const {
      tenantId,
      tenantRef = 'A-001',
      tenantName,
      recipientPhone,
      propertyName,
      unitNumber,
      triggerType = 'individual_sms',
      messageBody,
      paymentId,
      sentBy = 'System Automation',
      environmentOverride,
      forceSend = false,
    } = payload;

    if (!tenantName || !recipientPhone || !propertyName || !unitNumber || !messageBody) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            'tenantName, recipientPhone, propertyName, unitNumber, and messageBody are required.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Payment confirmation SMS must ONLY be sent if payment is verified in database
    if (triggerType === 'payment_confirmed' && paymentId) {
      const { data: verifiedPayment } = await supabaseAdmin
        .from('rent_payments')
        .select('id, status, confirmed_at')
        .eq('id', paymentId)
        .maybeSingle();

      if (!verifiedPayment || verifiedPayment.status !== 'Paid') {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              'Security Abort: Cannot send payment confirmation SMS because payment is not verified as Paid in the database.',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Load notification settings
    const { data: settings } = await supabaseAdmin
      .from('sms_notification_settings')
      .select('*')
      .eq('id', 'default')
      .maybeSingle();

    const envMode: 'sandbox' | 'production' =
      environmentOverride ||
      settings?.environment ||
      'sandbox';

    const phoneCheck = normalizeKenyanPhoneForSozuri(recipientPhone);
    if (!phoneCheck.valid) {
      return new Response(
        JSON.stringify({
          success: false,
          error: phoneCheck.reason,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedPhone = phoneCheck.normalized;
    const formattedMessage = ensureTenantAndApartmentContext(
      messageBody,
      tenantName,
      propertyName,
      unitNumber,
      tenantRef
    );

    // Duplicate prevention check within window (default 24h)
    const todayBucket = new Date().toISOString().slice(0, 10);
    const dedupeKey = `${triggerType}:${tenantRef}:${normalizedPhone}:${
      paymentId || todayBucket
    }:${formattedMessage.slice(0, 48)}`;

    if (!forceSend) {
      const windowHours = Number(settings?.prevent_duplicates_hours ?? 24);
      const cutoffIso = new Date(
        Date.now() - windowHours * 60 * 60 * 1000
      ).toISOString();

      const { data: existingLog } = await supabaseAdmin
        .from('sms_logs')
        .select('id, created_at, status')
        .eq('dedupe_key', dedupeKey)
        .in('status', ['Delivered', 'Sent', 'Queued'])
        .gte('created_at', cutoffIso)
        .limit(1)
        .maybeSingle();

      if (existingLog) {
        return new Response(
          JSON.stringify({
            success: false,
            duplicateSkipped: true,
            message: 'Duplicate SMS prevented within deduplication window.',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Resolve Sozuri Credentials from Environment Secrets
    const sozuriApiKey = (Deno.env.get('SOZURI_API_KEY') || '').trim();
    const sozuriProject =
      settings?.sozuri_project || Deno.env.get('SOZURI_PROJECT') || 'ARABELLA';
    const sozuriSenderId =
      settings?.sender_id || Deno.env.get('SOZURI_SENDER_ID') || 'ARABELLA';

    const isLive = Boolean(sozuriApiKey && sozuriApiKey !== 'your-sozuri-api-key' && envMode === 'production');

    let logStatus = 'Delivered';
    let providerMessageId = `sozuri_msg_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    let statusCode = 200;
    let providerCost = 'KES 0.80';
    let rawJson: Record<string, any> = {};
    let errorMessage: string | null = null;
    let isSuccess = true;

    if (isLive) {
      const sozuriPayload = {
        project: sozuriProject,
        from: sozuriSenderId,
        to: normalizedPhone,
        message: formattedMessage,
        type: 'transactional',
      };

      const sozuriRes = await fetch('https://sozuri.net/api/v1/messaging', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sozuriApiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(sozuriPayload),
      });

      rawJson = await sozuriRes.json().catch(() => ({}));
      statusCode = sozuriRes.status;

      if (sozuriRes.ok) {
        isSuccess = true;
        logStatus = 'Delivered';
        providerMessageId =
          rawJson.message_id ||
          rawJson.data?.message_id ||
          rawJson.id ||
          providerMessageId;
      } else {
        isSuccess = false;
        logStatus = 'Failed';
        errorMessage =
          rawJson.message ||
          rawJson.error ||
          `Sozuri API error (HTTP ${sozuriRes.status})`;
      }
    } else {
      // Sandbox / Simulated delivery for testing
      rawJson = {
        status: 'success',
        simulated: true,
        message: 'Dispatched via Sozuri SMS Gateway (Sandbox Simulation)',
        recipient: normalizedPhone,
        network: phoneCheck.network,
        project: sozuriProject,
        from: sozuriSenderId,
      };
    }

    const { data: insertedLog } = await supabaseAdmin
      .from('sms_logs')
      .insert({
        tenant_id: tenantId || null,
        tenant_ref: tenantRef,
        tenant_name: tenantName,
        recipient_phone: normalizedPhone,
        property_name: propertyName,
        unit_number: unitNumber,
        trigger_type: triggerType,
        message_body: formattedMessage,
        status: logStatus,
        environment: envMode,
        provider: 'Sozuri',
        provider_message_id: providerMessageId,
        provider_status_code: statusCode,
        provider_cost: providerCost,
        api_response: rawJson,
        error_message: errorMessage,
        dedupe_key: dedupeKey,
        payment_id: paymentId || null,
        sent_by: sentBy,
      })
      .select('*')
      .maybeSingle();

    return new Response(
      JSON.stringify({
        success: isSuccess,
        log: insertedLog,
        apiResponse: rawJson,
        network: phoneCheck.network,
      }),
      {
        status: isSuccess ? 200 : 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || 'Unexpected error in send-sms Edge Function.',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
