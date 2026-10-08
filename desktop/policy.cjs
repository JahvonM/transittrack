const APP_ORIGIN = 'https://eager-transit-track-go.base44.app';
function isAppUrl(value) {
 try { const u=new URL(value);return u.origin===APP_ORIGIN&&!u.username&&!u.password; }
 catch { return false; }
}
function externalUrl(value) {
 try { const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password ? u.href : null; }
 catch { return null; }
}
module.exports={APP_ORIGIN,isAppUrl,externalUrl};
