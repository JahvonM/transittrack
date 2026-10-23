const {test}=require('node:test');
const assert=require('node:assert/strict');
const {APP_ORIGIN,isAppUrl,externalUrl}=require('./policy.cjs');
test('only the exact secure app origin loads inside the window',()=>{
 assert.equal(isAppUrl(APP_ORIGIN+'/admin'),true);
 assert.equal(APP_ORIGIN,'https://app.mcsweenstransport.com');
 assert.equal(isAppUrl('https://eager-transit-track-go.base44.app/admin'),false);
 for(const url of ['http://app.mcsweenstransport.com/admin',APP_ORIGIN+'.evil.invalid/admin','https://evil.invalid/?url='+APP_ORIGIN,'javascript:alert(1)','file:///etc/passwd','https://user:pass@app.mcsweenstransport.com/']) assert.equal(isAppUrl(url),false,url);
});
test('external links reject privileged protocols and embedded credentials',()=>{
 for(const url of ['file:///a','javascript:alert(1)','ms-settings:','data:text/html,hi','https://user:pass@example.com'])assert.equal(externalUrl(url),null,url);
 assert.equal(externalUrl('https://example.com/help'),'https://example.com/help');
});
