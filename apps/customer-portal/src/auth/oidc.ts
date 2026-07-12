const OIDC_ISSUER = 'http://127.0.0.1:18082/realms/bank-customer';
const OIDC_CLIENT_ID = 'bank-customer-web';
const OIDC_REDIRECT_URI = `${window.location.origin}/portal/login/callback`;

function randomString(size: number = 48): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function createPkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export interface OidcAuthRequest {
  authorizationUrl: string;
  verifier: string;
  state: string;
}

export async function buildAuthRequest(): Promise<OidcAuthRequest> {
  const verifier = randomString();
  const state = randomString(24);
  const challenge = await createPkceChallenge(verifier);

  const url = new URL(`${OIDC_ISSUER}/protocol/openid-connect/auth`);
  const params = new URLSearchParams({
    client_id: OIDC_CLIENT_ID,
    redirect_uri: OIDC_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  url.search = params.toString();

  return { authorizationUrl: url.toString(), verifier, state };
}

export async function exchangeCodeForToken(
  code: string,
  verifier: string,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: OIDC_CLIENT_ID,
    redirect_uri: OIDC_REDIRECT_URI,
    code,
    code_verifier: verifier,
  });

  const res = await fetch(`${OIDC_ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    throw new Error(`OIDC token exchange failed: ${res.status}`);
  }

  const data: unknown = await res.json();
  if (
    typeof data === 'object' &&
    data !== null &&
    'access_token' in data &&
    typeof (data as Record<string, unknown>).access_token === 'string'
  ) {
    return (data as Record<string, unknown>).access_token as string;
  }

  throw new Error('OIDC token response missing access_token');
}
