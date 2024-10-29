/// <reference types="@cloudflare/workers-types/2023-07-01" />

import * as jose from 'jose'
import { badRequest, internalServerError, unsupportedMediaType } from '@worker-tools/response-creators'
import { corsMiddleware, corsOptions, Env, JWTPublicKeySPKI, legacyLicenseKeyRegex, licenseKeyRegex, validate, validateLegacy } from './#shared';

// Respond to OPTIONS method
export const onRequestOptions = corsOptions;

export const onRequestPost: PagesFunction<Env>[] = [corsMiddleware, async (context) => {
  try {
    if (context.request.headers.get('Content-Type') !== 'application/x-www-form-urlencoded') return unsupportedMediaType(); 
    const fd = new URLSearchParams(await context.request.text());
    const accessToken = fd.get('access_token');
    const licenseKey = fd.get('license_key');
    const machineId = fd.get('machine_id');
    if (!accessToken) return badRequest('Missing access_token');
    if (!licenseKey) return badRequest('Missing license_key');
    if (!licenseKeyRegex.test(licenseKey) && !legacyLicenseKeyRegex.test(licenseKey)) return badRequest('Invalid license key format');

    let payload;
    try {
      const jwtKey = await jose.importSPKI(JWTPublicKeySPKI, 'ES256');
      const { payload: { iat, exp, ...rest } } = await jose.jwtVerify(accessToken, jwtKey);
      payload = rest;
    } catch {
      return badRequest('Invalid access_token');
    }
    if (!payload) return badRequest('Invalid access_token');

    let purchase;
    try {
      const validateFn = licenseKeyRegex.test(licenseKey) ? validate : validateLegacy;
      purchase = await validateFn(context, licenseKey, { incrementUsage: false });
    } catch (err) {
      if (err instanceof Response) {
        return err;
      } else {
        return internalServerError(`Unexpected service error: ${err instanceof Error ? err.message: err}`);
      }
    }

    const jwtKey = await jose.importPKCS8(context.env.JWT_PRIVATE_KEY_PKCS8, 'ES256');
    const token = await new jose.SignJWT({ 
      ...payload, 
      ...machineId && !payload.mid ? { mid: machineId } : {} 
    })
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuedAt()
      .setExpirationTime('15d')
      .sign(jwtKey)
    
    return Response.json({ token }, { headers: [['Authorization', `Bearer ${token}`]] });
  } catch (err) {
    return internalServerError(`Unexpected service error: ${err instanceof Error ? err.message: err}`);
  }
}];
