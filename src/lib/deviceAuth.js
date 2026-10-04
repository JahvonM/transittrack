const tokenKey = (id) => `tt_device_token_${id}`;
export function saveDeviceToken(id, token) {
  if (!id || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error('Device token missing from pairing response');
  // If storage is unavailable, do not pretend pairing succeeded locally.
  localStorage.setItem(tokenKey(id), token);
}
export function forgetDeviceToken(id) {
  try { localStorage.removeItem(tokenKey(id)); localStorage.removeItem("tt_driver_grant_" + id); } catch { /* storage unavailable */ }
}
export function deviceRequest(id, payload = {}) {
  let token = '';
  try { token = localStorage.getItem(tokenKey(id)) || ''; } catch { /* legacy tablet */ }
  // Never allow a queued action to override the current credential/device.
  let driverGrant = '';
  try { driverGrant = localStorage.getItem('tt_driver_grant_' + id) || ''; } catch { /* unavailable */ }
  const { device_token: _oldToken, device_id: _oldId, driver_grant: _oldGrant, ...data } = payload;
  return { ...data, device_id: id, ...(token ? { device_token: token } : {}), ...(driverGrant ? { driver_grant: driverGrant } : {}) };
}
export function pairingProfile(data) {
  const { device_token: _token, ...profile } = data;
  return profile;
}
export function saveDriverGrant(id, grant) {
 if (typeof grant !== 'string' || !/^[a-f0-9]{64}$/.test(grant)) throw new Error('Driver verification grant missing');
 localStorage.setItem('tt_driver_grant_' + id, grant);
}
