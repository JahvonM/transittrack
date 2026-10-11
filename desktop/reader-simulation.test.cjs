const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
test('Windows simulation bypasses smart-card services before attempting native calls',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../tools/card-reader/TTCardReader.cs'),'utf8').replace(/\r\n/g,'\n');
 const loop=source.slice(source.indexOf('static void ReaderLoop()'),source.indexOf('// Sleep while still answering'));
 assert.ok(loop.indexOf('if (Simulate) { SimulatedLoop(); return; }')>=0);
 assert.ok(loop.indexOf('if (Simulate) { SimulatedLoop(); return; }')<loop.indexOf('SCardEstablishContext('));
 const script=fs.readFileSync(path.join(__dirname,'reader.ps1'),'utf8').replace(/\r\n/g,'\n');
 for(const newline of ['\n','\r\n']) {
  // Exercise the same extraction with Linux and Windows checkout line endings.
  const fixture=script.replace(/\n/g,newline).replace(/\r\n/g,'\n');
  const match=fixture.match(/\$code = @'\n([\s\S]*?)\n'@/);
  assert.ok(match,'Embedded C# must be present');
  assert.equal(match[1],source.trim());
 }
});
