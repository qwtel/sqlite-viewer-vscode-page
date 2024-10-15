/// <reference types="@cloudflare/workers-types/2023-07-01" />

import * as jose from 'jose'
import { badRequest, internalServerError, paymentRequired, serviceUnavailable, unsupportedMediaType } from '@worker-tools/response-creators'

type Env = {
  PRODUCT_ID: string,
  JWT_PRIVATE_KEY_PKCS8: string,
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    if (context.request.headers.get('Content-Type') !== 'application/x-www-form-urlencoded') return unsupportedMediaType(); 
    const fd = new URLSearchParams(await context.request.text());
    const licenseKey = fd.get('license_key');
    if (!licenseKey) return badRequest('Missing license_key');
    if (!/[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}/i.test(licenseKey)) return badRequest('Invalid license key format');

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
          'increment_uses_count': 'true',
        }),
      });
    } catch {
      return serviceUnavailable('No response from license validation service');
    }

    if (!response.ok) {
      if (response.status === 404) return badRequest(`Invalid license key.`);
      return badRequest(`License validation request failed: ${response.status}`);
    }
    if (response.headers.get('Content-Type')?.includes('application/json') === false)
      return serviceUnavailable('Invalid response from license validation service');

    let data: ResponseData;
    try {
      data = await response.json() as any;
    } catch {
      return serviceUnavailable('Failed to parse response');
    }

    if (!data.success) {
      return paymentRequired(`License validation failed: ${data.message}`);
    }

    const { purchase } = data;

    if (purchase.disputed || purchase.chargebacked || purchase.refunded)
      return paymentRequired('Purchase was disputed, chargebacked or refunded');

    const jwtKey = await jose.importPKCS8(context.env.JWT_PRIVATE_KEY_PKCS8, 'ES256');
    const token = await new jose.SignJWT({ pid: purchase.id })
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuedAt()
      .setExpirationTime('15d')
      .sign(jwtKey)
    
    return Response.json({ token }, { headers: [['Authorization', `Bearer ${token}`]] });
  } catch (err) {
    return internalServerError(`Unexpected service error: ${err.message}`);
  }
}

type Purchase = {
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

type ResponseData = {
  success: true;
  uses: number;
  purchase: Purchase;
}|{
  success: false;
  message: string;
};
