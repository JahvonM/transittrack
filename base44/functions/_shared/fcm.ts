// Sends push notifications via Firebase Cloud Messaging's HTTP v1 API.
// Authenticates as the service account by hand-signing a short-lived JWT
// (RS256) and exchanging it at Google's token endpoint — this avoids pulling
// a full Google auth client library into the function runtime for something
// this self-contained.

function base64UrlEncode(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function getAccessToken(serviceAccount: any): Promise<string> {
  const { client_email, private_key, token_uri } = serviceAccount;
  const now = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: token_uri,
    exp: now + 3600,
    iat: now,
  };
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const claimsB64 = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
  const signingInput = `${headerB64}.${claimsB64}`;

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, encoder.encode(signingInput));
  const jwt = `${signingInput}.${base64UrlEncode(signature)}`;

  const res = await fetch(token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(jwt)}`,
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`FCM auth failed: ${data.error_description || data.error || res.status}`);
  }
  return data.access_token;
}

type PushPayload = { title: string; body: string; data?: Record<string, string> };

// Sends to one registration token. Never throws — a stale/unregistered token
// for one recipient should never break the caller's broader flow (SOS,
// pickup alerts, etc). Returns whether it succeeded.
export async function sendPushToToken(serviceAccountJson: string, token: string, payload: PushPayload): Promise<boolean> {
  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    const accessToken = await getAccessToken(serviceAccount);
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: payload.title, body: payload.body },
          data: payload.data || {},
          webpush: { fcm_options: { link: '/' } },
        },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Sends the same notification to every token in the list in parallel,
// tolerating individual failures.
export async function sendPushToTokens(serviceAccountJson: string, tokens: string[], payload: PushPayload): Promise<void> {
  await Promise.all(tokens.map((t) => sendPushToToken(serviceAccountJson, t, payload)));
}
