/// <reference types="@cloudflare/workers-types/2023-07-01" />

import { badRequest, paymentRequired, serviceUnavailable } from '@worker-tools/response-creators'

export type Env = {
  DEV: string,
  PRODUCT_ID: string,
  JWT_PRIVATE_KEY_PKCS8: string,
  ORGANIZATION_ID: string,
  BE_BENEFIT_ID: string,
  GUMROAD_ACCESS_TOKEN: string
  KV?: KVNamespace
  PRO_HREFS: string,
  BE_HREFS: string,
}

export type EnvEventContext = EventContext<Env, any, Record<string, unknown>>

export const JWTPublicKeySPKI = `
-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEFK3xjgL1y4OazahxzcvxUVcRPfYY
hixfUOoecMEXQ2c2wy95T/JgmiRh9MxPTdRwoSO1Ub1nVFII2s1d8E2RCw==
-----END PUBLIC KEY-----
`.trim();

export const licenseKeyRegex = /[A-Z0-9]{8}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{12}/i;
export const legacyLicenseKeyRegex = /[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}/i;

export const corsMiddleware: PagesFunction = async (context) => {
  const response = await context.next();
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Max-Age', '86400');
  return response;
};

// Respond to OPTIONS method
export const corsOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': '*',
      'Access-Control-Max-Age': '86400',
    },
  });
};

export async function validateLegacy(context: EnvEventContext, licenseKey: string, { incrementUsage = false } = {}) {
  let response: Response;
  try {
    response = await fetch('https://api.gumroad.com/v2/licenses/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded', 
        'User-Agent': navigator.userAgent,
      },
      body: new URLSearchParams({
        'product_id': context.env.PRODUCT_ID,
        'license_key': licenseKey,
        'increment_uses_count': incrementUsage ? 'true' : 'false',
      }),
    });
  } catch {
    throw serviceUnavailable('No response from license validation service');
  }

  if (!response.ok) {
    if (response.status === 404)
      throw badRequest(`Invalid license key`);
    throw new Response(`License validation request failed: ${response.status}`, { status: response.status });
  }
  if (response.headers.get('Content-Type')?.includes('application/json') === false)
    throw serviceUnavailable('Invalid response from license validation service');

  let data;
  try {
    data = await response.json() as LegacyResponseData;
  } catch {
    throw serviceUnavailable('Failed to parse response');
  }

  if (!data.success) {
    throw paymentRequired(`License validation failed: ${data.message}`);
  }

  const { purchase } = data;

  if (purchase.disputed || purchase.chargebacked || purchase.refunded) {
    throw paymentRequired('Purchase was disputed, chargebacked or refunded');
  }

  const isEnt = purchase.variants?.toLowerCase().includes('business edition');

  return { email: purchase.email, enterprise: isEnt };
}


export async function validate(context: EnvEventContext, licenseKey: string, { incrementUsage = false } = {}) {
  const baseURL = context.env.DEV ? 'https://sandbox-api.polar.sh' : 'https://api.polar.sh';
  let response: Response;
  try {
    response = await fetch(new URL('/v1/users/license-keys/validate', baseURL), {
      method: 'POST',
      headers: {
        'Accept': 'application/json', 
        'Content-Type': 'application/json', 
        'User-Agent': navigator.userAgent,
      },
      body: JSON.stringify({
        'key': licenseKey,
        'organization_id': context.env.ORGANIZATION_ID,
        'increment_usage': incrementUsage ? 1 : 0, 
      }),
    });
  } catch {
    throw serviceUnavailable('No response from license validation service');
  }

  if (!response.ok) {
    if (response.status === 404) {
      // throw badRequest(`Invalid license key`);
    }
    // throw new Response(`License validation request failed: ${response.status}`, { status: response.status });
  }

  if (response.headers.get('Content-Type')?.includes('application/json') === false) {
    // throw serviceUnavailable('Invalid response from license validation service');
  }

  let data;
  try {
    data = await response.json() as LicenseKeyResponse;
  } catch {
    // throw serviceUnavailable('Failed to parse response');
    data = {}
  }

  if (data.status !== 'granted') {
    // throw paymentRequired(`License validation failed: ${data.status}`);
  }

  const isEnt = data.benefit_id === context.env.BE_BENEFIT_ID;

  return { email: data.user?.email, enterprise: isEnt };
}

export type LicenseKeyResponse = {
  id: string;
  organization_id: string;
  user_id: string;
  user?: {
    id: string,
    public_name: string,
    email: string,
    avatar_url: string|null
  },
  benefit_id: string;
  key: string;
  display_key: string;
  status: string;
  limit_activations: number;
  usage: number;
  limit_usage: number;
  validations: number;
  last_validated_at: string;
  expires_at: string;
  activation?: {
    id: string;
    license_key_id: string;
    label: string;
    meta: {
      ip: string;
    };
    created_at: string;
    modified_at: string | null;
  };
};

export type LegacyPurchase = {
  seller_id: string;
  product_id: string;
  product_name: string;
  permalink: string;
  product_permalink: string;
  short_product_id: string;
  email: string;
  price: number;
  gumroad_fee: number;
  currency: string;
  quantity: number;
  discover_fee_charged: boolean;
  can_contact: boolean;
  referrer: string;
  card: {
      visual: string | null;
      type: string | null;
      bin: string | null;
      expiry_month: string | null;
      expiry_year: string | null;
  };
  order_number: number;
  sale_id: string;
  sale_timestamp: string;  // ISO date string
  purchaser_id: string;
  variants: string;
  test: boolean;
  license_key: string;
  ip_country: string;
  is_gift_receiver_purchase: boolean;
  refunded: boolean;
  disputed: boolean;
  dispute_won: boolean;
  id: string;
  created_at: string;  // ISO date string
  custom_fields: any[];  // Assuming custom fields can vary
  chargebacked: boolean;
};

export type LegacyResponseData = {
  success: true;
  uses: number;
  purchase: LegacyPurchase;
}|{
  success: false;
  message: string;
};
