/// <reference types="@cloudflare/workers-types/2023-07-01" />

import * as jose from 'jose'
import { badRequest, internalServerError, paymentRequired, serviceUnavailable, unsupportedMediaType } from '@worker-tools/response-creators'
import { corsMiddleware, corsOptions, Env, JWTPublicKeySPKI, ResponseData } from './#shared';

// Respond to OPTIONS method
export const onRequestOptions = corsOptions;

export const onRequestPost: PagesFunction<Env>[] = [corsMiddleware, async (context) => {
  try {
    if (context.request.headers.get('Content-Type') !== 'application/x-www-form-urlencoded') return unsupportedMediaType(); 
    const fd = new URLSearchParams(await context.request.text());
    const accessToken = fd.get('access_token');
    const licenseKey = fd.get('license_key');
    if (!accessToken) return badRequest('Missing access_token');
    if (!licenseKey) return badRequest('Missing license_key');
    if (!/[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}/i.test(licenseKey)) return badRequest('Invalid license key format');

    let payload: Record<string, any>;
    try {
      const jwtKey = await jose.importSPKI(JWTPublicKeySPKI, 'ES256');
      const { payload: { iat, exp, ...rest } } = await jose.jwtVerify(accessToken, jwtKey);
      payload = rest;
    } catch {
      return badRequest('Invalid access_token');
    }

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
          'increment_uses_count': 'false',
        }),
      });
    } catch {
      return serviceUnavailable('No response from license validation service');
    }

    if (!response.ok) {
      if (response.status === 404) return badRequest(`Invalid license key.`);
      return new Response(`License validation request failed: ${response.status}`, { status: response.status });
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
}];
