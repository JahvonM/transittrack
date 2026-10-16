// Strip legacy credentials before loading or saving a cached tablet session.
const CREDENTIAL_FIELDS = new Set(['support_notice', 'support_request', 'stream_token', 'control_command', 'control_notice', 'driver_pin', 'entry_code', 'access_code', 'one_time_code', 'nfc_card_tag', 'nfc_tag_id', 'nfc_tag', 'card_tag', 'card_uid', 'pairing_code', 'device_token', 'token_hash', 'driver_grant', 'verification_grant']);
export function cleanTabletSession(value) {
  if (Array.isArray(value)) return value.map(cleanTabletSession);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !CREDENTIAL_FIELDS.has(key)).map(([key, item]) => [key, cleanTabletSession(item)]));
}
