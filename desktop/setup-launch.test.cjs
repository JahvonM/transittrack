const {test}=require('node:test');const assert=require('node:assert/strict');const {registerSetupLauncher}=require('./setup-launch.cjs');
test('setup buttons open only approved views from the trusted main app frame',()=>{
 let handler;const opened=[];const frame={url:'https://eager-transit-track-go.base44.app/admin'};const window={webContents:{mainFrame:frame}};
 registerSetupLauncher({handle:(_channel,fn)=>handler=fn},()=>window,view=>opened.push(view));
 const event={sender:window.webContents,senderFrame:frame};
 assert.deepEqual(handler(event,'nfc'),{ok:true});handler(event,'tablet');assert.deepEqual(opened,['nfc','tablet']);
 assert.throws(()=>handler(event,'configure'),/Unsupported/);
 assert.throws(()=>handler({...event,sender:{}},'nfc'),/denied/);
 assert.throws(()=>handler({...event,senderFrame:{url:frame.url}},'nfc'),/denied/);
 frame.url='https://evil.invalid';assert.throws(()=>handler(event,'tablet'),/denied/);
 assert.deepEqual(opened,['nfc','tablet']);
});
