/// <reference types="@cloudflare/workers-types/2023-07-01" />

import * as jose from 'jose'
import { badRequest, internalServerError, paymentRequired, serviceUnavailable, unsupportedMediaType } from '@worker-tools/response-creators'
import { corsMiddleware, corsOptions, Env, ResponseData } from './#shared';
import { html, HTMLResponse } from '@worker-tools/html';
import { contentTypes, withMiddleware as applyMiddleware } from "@worker-tools/middleware"

// Respond to OPTIONS method
export const onRequestOptions = corsOptions;

export const onRequestPost: PagesFunction<Env>[] = [corsMiddleware, async (context) => applyMiddleware(contentTypes(['text/html', 'application/json', '*/*']), async (_req, { type }) => {
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

    const includeKey = fd.get('include_key') != null;

    const jwtKey = await jose.importPKCS8(context.env.JWT_PRIVATE_KEY_PKCS8, 'ES256');
    const token = await new jose.SignJWT({ pid: purchase.id, ...includeKey ? { licenseKey } : {} })
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuedAt()
      .setExpirationTime(includeKey ? '12weeks' : '15d')
      .sign(jwtKey);

    if (type === 'text/html') {
      return new HTMLResponse(html`<html>
        <body>
          <h1>Access Token Generated</h1>
          <textarea readonly rows="8" cols="60">${token}</textarea>
        </body>
      </html>`);
    } else {
      return Response.json({ token }, { headers: [['Authorization', `Bearer ${token}`]] });
    }
  } catch (err) {
    return internalServerError(`Unexpected service error: ${err instanceof Error ? err.message: err}`);
  }
})(context.request)];

export const onRequestGet: PagesFunction<Env>[] = [corsMiddleware, async (context) => {
  return new HTMLResponse(html`<html>
    <body>
      <h1>License Key to Access Token</h1>
      <form method="post">
        <input type="text" name="license_key" placeholder="Enter license key">
        <input type="hidden" name="include_key" value="">
        <input type="submit" value="Generate">
      </form>
    </body>
  </html>`)
}];
