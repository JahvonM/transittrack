// Reviewed combined-kiosk APK only. Never point this at helperRelease.
// Populate only after signing with the EXISTING combined-app key and acceptance tests.
export type NativeRelease = { id: string; package_name: string; version_code: number; version_name: string; bytes: number; sha256: string; url: string };
export const NATIVE_RELEASE: NativeRelease | null = null;
export function validNativeRelease(r: NativeRelease | null): r is NativeRelease {
  if (!r || !/^[a-zA-Z0-9_-]{1,64}$/.test(r.id) || r.package_name !== 'com.transittrack.app' ||
      !Number.isSafeInteger(r.version_code) || r.version_code < 2 ||
      typeof r.version_name !== 'string' || r.version_name.length > 32 || !r.version_name ||
      !Number.isSafeInteger(r.bytes) || r.bytes < 1 || r.bytes > 150 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/.test(r.sha256)) return false;
  try {
    const u = new URL(r.url);
    return u.protocol === 'https:' && u.hostname === 'app.mcsweenstransport.com' &&
      !u.username && !u.password && !u.port && !u.search && !u.hash &&
      /^\/native-releases\/[a-zA-Z0-9_-]+\.apk$/.test(u.pathname);
  } catch { return false; }
}
export function nativeReleaseHealth(o: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if (typeof o.native_app_version === 'string' && /^[a-zA-Z0-9.+_-]{1,32}$/.test(o.native_app_version)) out.native_app_version = o.native_app_version;
  if (Number.isSafeInteger(o.native_app_code) && Number(o.native_app_code) > 0 && Number(o.native_app_code) <= 2147483647) out.native_app_code = o.native_app_code;
  if (o.native_app_package === 'com.transittrack.app') out.native_app_package = o.native_app_package;
  if (typeof o.native_update_available === 'boolean') out.native_update_available = o.native_update_available;
  return out;
}
