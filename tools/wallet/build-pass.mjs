import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

// Local developer-only Apple Wallet pass packager. Does not issue QR credentials.
const table=Uint32Array.from({length:256},(_,i)=>{let n=i;for(let j=0;j<8;j++)n=(n&1)?(n>>>1)^0xEDB88320:n>>>1;return n>>>0});
function crc(bytes){let n=0xffffffff;for(const b of bytes)n=table[(n^b)&255]^(n>>>8);return(n^0xffffffff)>>>0}
function archive(entries){
 const locals=[],central=[];let offset=0;
 for(const [filename,bytes] of entries){
  if(!/^[\w@.\/-]+$/.test(filename)||filename.includes('..')||filename.startsWith('/'))throw Error('Unsafe filename');
  const name=Buffer.from(filename),data=Buffer.from(bytes),sum=crc(data);
  const l=Buffer.alloc(30);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt32LE(sum,14);l.writeUInt32LE(data.length,18);l.writeUInt32LE(data.length,22);l.writeUInt16LE(name.length,26);
  locals.push(l,name,data);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt32LE(sum,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);
  central.push(c,name);offset+=l.length+name.length+data.length;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.size,8);end.writeUInt16LE(entries.size,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,directory,end]);
}
export function makePassJson(config){
 const {passTypeIdentifier,teamIdentifier,passengerName,passengerId,companyName,barcodeToken}=config;
 if(!/^pass\.[a-zA-Z0-9.-]+$/.test(passTypeIdentifier||''))throw Error('Invalid Pass Type ID');
 if(!/^[A-Z0-9]{10}$/.test(teamIdentifier||''))throw Error('Invalid Team ID');
 if(![passengerName,passengerId,companyName,barcodeToken].every(s=>typeof s==='string'&&s.length>0&&s.length<=256&&!/[\u0000-\u001f\u007f]/.test(s)))throw Error('Invalid passenger details');
 if(barcodeToken===passengerId||barcodeToken.length<24)throw Error('Supply a strong existing server-issued QR credential');
 return {
  formatVersion:1,passTypeIdentifier,teamIdentifier,
  organizationName:config.organizationName||"Mc Sween's Transport",
  description:'TransitTrack Passenger Card',serialNumber:config.serialNumber||randomUUID(),
  logoText:"Mc Sween's Transport",backgroundColor:'rgb(16,40,75)',foregroundColor:'rgb(255,255,255)',labelColor:'rgb(187,226,243)',
  generic:{
   primaryFields:[{key:'holder',label:'PASSENGER',value:passengerName}],
   secondaryFields:[{key:'company',label:'TRANSPORT COMPANY',value:companyName}],
   auxiliaryFields:[{key:'reference',label:'CARD REFERENCE',value:passengerId}]
  },
  barcodes:[{format:'PKBarcodeFormatQR',message:barcodeToken,messageEncoding:'iso-8859-1',altText:'Scan to board'}],
  sharingProhibited:true
 };
}
export async function buildPass({config,output,cert,key,wwdr,icon,icon2x,openssl='openssl'}){
 for(const file of [cert,key,wwdr,icon,icon2x]){if(!file)throw Error('Signing material and icons required');await fs.access(file)}
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'transittrack-wallet-'));
 try{
  const files=new Map([['pass.json',Buffer.from(JSON.stringify(makePassJson(config)))],['icon.png',await fs.readFile(icon)],['icon@2x.png',await fs.readFile(icon2x)]]);
  const manifest=Buffer.from(JSON.stringify(Object.fromEntries([...files].map(([name,data])=>[name,createHash('sha1').update(data).digest('hex')]))));
  // SHA1 is mandated by Apple for the manifest, not used for credential authentication.
  const input=path.join(tmp,'manifest.json'),signed=path.join(tmp,'signature');await fs.writeFile(input,manifest);
  const result=spawnSync(openssl,['smime','-sign','-binary','-signer',cert,'-inkey',key,'-certfile',wwdr,'-in',input,'-out',signed,'-outform','DER'],{encoding:'utf8',timeout:30000});
  if(result.error||result.status!==0)throw Error('OpenSSL signing failed: '+String(result.stderr||result.error?.message||'').slice(0,300));
  files.set('manifest.json',manifest);files.set('signature',await fs.readFile(signed));
  await fs.mkdir(path.dirname(path.resolve(output)),{recursive:true});await fs.writeFile(output,archive(files));
  return {output,files:[...files.keys()]};
 }finally{await fs.rm(tmp,{recursive:true,force:true})}
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
 const [,,configFile,output,cert,key,wwdr,icon,icon2x]=process.argv;
 if(![configFile,output,cert,key,wwdr,icon,icon2x].every(Boolean)){console.error('Usage: node tools/wallet/build-pass.mjs config.json output.pkpass certificate.pem private-key.pem AppleWWDR.pem icon.png icon@2x.png');process.exitCode=2}
 else{try{console.log(await buildPass({config:JSON.parse(await fs.readFile(configFile,'utf8')),output,cert,key,wwdr,icon,icon2x}))}catch(error){console.error(error.message);process.exitCode=1}}
}
