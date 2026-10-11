const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
test('Windows simulation bypasses smart-card services before attempting native calls',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../tools/card-reader/TTCardReader.cs'),'utf8');
 const loop=source.slice(source.indexOf('static void ReaderLoop()'),source.indexOf('// Sleep while still answering'));
 assert.ok(loop.indexOf('if (Simulate) { SimulatedLoop(); return; }')>=0);
 assert.ok(loop.indexOf('if (Simulate) { SimulatedLoop(); return; }')<loop.indexOf('SCardEstablishContext('));
 const script=fs.readFileSync(path.join(__dirname,'reader.ps1'),'utf8');
 const embedded=script.split("$code = @'\n")[1].split("\n'@")[0];
 assert.equal(embedded,source.trim());
});
