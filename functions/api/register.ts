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
    const machineId = fd.get('machine_id');
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

    const isOffline = fd.get('offline') === 'on';
    const isEval = fd.get('evaluation') === 'on';
    const isEnt = purchase.variants?.toLowerCase().includes('business edition');

    const jwtKey = await jose.importPKCS8(context.env.JWT_PRIVATE_KEY_PKCS8, 'ES256');

    let jwt = new jose.SignJWT({
      ...machineId ? { mid: machineId } : {},
      ...isOffline && isEnt ? { ent: 1 } : {},
      ...isOffline && !isEnt ? { key: licenseKey, licenseKey } : {},
      // ...isOffline && isEnt ? { for: purchase.email } : {},
    })
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuedAt()
    
    if (isEval || !isEnt || (isEnt && !isOffline)) {
      jwt = jwt.setExpirationTime('15d');
    }
    
    const token = await jwt.sign(jwtKey);

    if (type === 'text/html') {
      return new HTMLResponse(html`<html>
        <body>
          <h1>Access Token Generated</h1>
          <textarea readonly rows="8" cols="60" style="font-family:ui-monospace,monospace;word-break:break-all">${token}</textarea>
          <p>Copy the token above and return to VS Code. There will be an input box at the top of the window. Paste the token and hit enter. The activation will be confirmed instantly.</p>
          <h3>Payload</h3>
          <pre>${JSON.stringify(Object.fromEntries(Object.entries(jose.decodeJwt(token)).map(([k, v]) => {
            if (k === 'mid') return ['machineId', v];
            if (k === 'for') return ['email', v];
            if (k === 'ent') return ['enterprise', true];
            if (k === 'key') return ['licenseKey', v];
            if (k === 'iat') return ['issuedAt', new Date(Number(v) * 1000).toLocaleString()];
            if (k === 'exp') return ['expireAt', new Date(Number(v) * 1000).toLocaleString()];
            if (k === 'licenseKey') return [];
            return [k, v];
          })), null, 2)}</pre>
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
  const { searchParams } = new URL(context.request.url);
  return new HTMLResponse(html`<html>
    <body>
      <h1>SQLite Viewer PRO Offline Activation</h1>
      <p>Enter your license key to generate an access token for offline use.</p>
      <p>This is intended for Business Edition customers who have purchased a license for offline use.<br>PRO customers can use it to gain 14 days of offline use (same as regular activation).</p>
      <form method="post">
        <label for="license_key">Enter License Key:</label>
        <input type="text" name="license_key" id="license_key" placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX" autocomplete="off" style="width:320px">
        <br>
        <input type="hidden" name="machine_id" value="${searchParams.get("machine_id") || searchParams.get("id") || ''}">
        <input type="hidden" name="offline" value="on">
          <input type="checkbox" name="evaluation" id="evaluation">
          <label for="evaluation">Business Edition evaluation</label>
          <p><strong>If you have a Business Edition key, check the evaluation box to generate a 14-day evaluation token.<br>Generating a permanent token will void the 14-day refund guarantee.</strong></p>
        <input type="submit" value="Activate">
      </form>
    </body>
  </html>`)
}];
