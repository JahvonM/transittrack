// Sends push notifications through Firebase Cloud Messaging's HTTP v1 API,
// signing the service-account JWT by hand (no Google client library).
function base64UrlEncode(bytes) {
  const arr = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
async function fcmAccessToken(serviceAccount) {
  const { client_email, private_key, token_uri } = serviceAccount;
  const now = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claimsB64 = base64UrlEncode(encoder.encode(JSON.stringify({
    iss: client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: token_uri, exp: now + 3600, iat: now,
  })));
  const signingInput = `${headerB64}.${claimsB64}`;
  const cryptoKey = await crypto.subtle.importKey('pkcs8', pemToArrayBuffer(private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, encoder.encode(signingInput));
  const res = await fetch(token_uri, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(`${signingInput}.${base64UrlEncode(signature)}`)}`,
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(`FCM auth failed: ${data.error_description || data.error || res.status}`);
  return data.access_token;
}

// Never throws: one stale token must not break the caller. The link opens
// the page the notification is about when it is tapped.
// Returns how many devices accepted it, for the notification log.
export async function sendPushToTokens(serviceAccountJson, tokens, payload, link = '/') {
  if (!tokens.length) return { sent: 0 };
  if (!serviceAccountJson) return { sent: 0, error: 'Phone alerts are not set up' };
  let serviceAccount, accessToken;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
    accessToken = await fcmAccessToken(serviceAccount);
  } catch { return { sent: 0, error: 'Could not sign in to Firebase' }; }
  let sent = 0;
  await Promise.all(tokens.map(async (token) => {
    try {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ message: { token, notification: { title: payload.title, body: payload.body }, data: payload.data || {}, webpush: { fcm_options: { link } } } }),
      });
      if (res.ok) sent++;
    } catch { /* best effort */ }
  }));
  return { sent };
}
