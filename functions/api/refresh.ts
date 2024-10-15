/// <reference types="@cloudflare/workers-types/2023-07-01" />

import * as jose from 'jose'
import { badRequest, internalServerError, unsupportedMediaType } from '@worker-tools/response-creators'

type Env = {
  PRODUCT_ID: string,
  JWT_PRIVATE_KEY_PKCS8: string,
}

export const JWTPublicKeySPKI = `
-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEFK3xjgL1y4OazahxzcvxUVcRPfYY
hixfUOoecMEXQ2c2wy95T/JgmiRh9MxPTdRwoSO1Ub1nVFII2s1d8E2RCw==
-----END PUBLIC KEY-----
`.trim();

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    if (context.request.headers.get('Content-Type') !== 'application/x-www-form-urlencoded') return unsupportedMediaType(); 
    const fd = new URLSearchParams(await context.request.text());
    const accessToken = fd.get('access_token');
    if (!accessToken) return badRequest('Missing access_token');

    let payload: Record<string, any>;
    try {
      const jwtKey = await jose.importSPKI(JWTPublicKeySPKI, 'ES256');
      const { payload: { iat, exp, ...rest } } = await jose.jwtVerify(accessToken, jwtKey);
      payload = rest;
    } catch {
      return badRequest('Invalid access_token');
    }

    const token = await new jose.SignJWT(payload)
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuedAt()
      .setExpirationTime('14d')
      .sign(await jose.importPKCS8(context.env.JWT_PRIVATE_KEY_PKCS8, 'ES256'))
    
    return Response.json({ token }, { headers: [['Authorization', `Bearer ${token}`]] });
  } catch (err) {
    return internalServerError(`Unexpected service error: ${err.message}`);
  }
}

// Set CORS to all /api responses
export const onRequest: PagesFunction = async (context) => {
  const response = await context.next();
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Max-Age', '86400');
  return response;
};

// Respond to OPTIONS method
export const onRequestOptions: PagesFunction = async () => {
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