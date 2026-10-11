import { describe, it, expect, vi, afterEach } from 'vitest';
import { webcrypto } from 'node:crypto';
import { sendPushToTokens } from '../../../base44/shared/fcm.ts';

async function serviceAccountJson() {
  const pair = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const der = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64');
  const pem = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
  return JSON.stringify({ project_id: 'demo-project', client_email: 'push@demo.iam.example', private_key: pem, token_uri: 'https://oauth2.example/token' });
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('notification message sent through Firebase', () => {
  it('rings on iPhone and tells the phone app which page to open when tapped', async () => {
    const sent = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (url === 'https://oauth2.example/token') return new Response(JSON.stringify({ access_token: 'ya29.test' }), { status: 200 });
      sent.push({ url, body: JSON.parse(init.body) });
      return new Response('{}', { status: 200 });
    }));
    const result = await sendPushToTokens(await serviceAccountJson(), ['android-token', 'fcm-ios:token'], { title: 'Bus 1', body: 'Arriving', data: { kind: 'stop_ahead' } }, '/driver-phone/me');
    expect(result).toEqual({ sent: 2 });
    expect(sent).toHaveLength(2);
    for (const { url, body } of sent) {
      expect(url).toBe('https://fcm.googleapis.com/v1/projects/demo-project/messages:send');
      expect(body.message).toMatchObject({
        notification: { title: 'Bus 1', body: 'Arriving' },
        data: { kind: 'stop_ahead', link: '/driver-phone/me' },
        webpush: { fcm_options: { link: '/driver-phone/me' } },
        apns: { payload: { aps: { sound: 'default' } } },
      });
      // Firebase only accepts text values in data.
      expect(Object.values(body.message.data).every((v) => typeof v === 'string')).toBe(true);
    }
  });
});
