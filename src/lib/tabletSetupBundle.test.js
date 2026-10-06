import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {unzipSync,strFromU8} from 'fflate';
import {tabletSetupBundle} from './tabletSetupBundle';
const apk=new Uint8Array([80,75,3,4,1,7]);
const script='set PRESET_TYPE=\r\nset PRESET_CODE=\r\nset PRESET_BUS=\r\nset PRESET_NAME=\r\nadb install -r "TransitTrack-Kiosk-Helper.apk"\r\n';
describe('USB tablet setup bundle',()=>{
 it('places the helper beside the setup script with the exact required filename',()=>{
   const bundle=tabletSetupBundle(script,apk,'1.7');
   const files=unzipSync(bundle.bytes);
   expect(Object.keys(files).sort()).toEqual(['READ-ME.txt','TransitTrack-Kiosk-Helper.apk','TransitTrack-Tablet-Setup.bat']);
   expect(files['TransitTrack-Kiosk-Helper.apk']).toEqual(apk);
   expect(strFromU8(files['TransitTrack-Tablet-Setup.bat'])).toBe(script);
   expect(strFromU8(files['READ-ME.txt'])).toContain('Choose UPDATE');
 });
 it('prefills the intended tablet without changing its updater or helper bytes',()=>{
   const bundle=tabletSetupBundle(script,apk,'1.7',{kiosk_type:'bus_boarding',pairing_code:'TESTPAIR12',label:'Bus 2',vehicle_name:'Bus 2'},'Bus boarding');
   const files=unzipSync(bundle.bytes);
   const bat=strFromU8(files['TransitTrack-Setup-Bus-2.bat']);
   expect(bat).toContain('set PRESET_TYPE=2\r\n');
   expect(bat).toContain('set PRESET_CODE=TESTPAIR12\r\n');
   expect(bat).toContain('set PRESET_BUS=2\r\n');
   expect(bat).toContain('adb install -r');
   expect(files['TransitTrack-Kiosk-Helper.apk']).toEqual(apk);
 });
 it('removes shell metacharacters from preset fields',()=>{
   const b=tabletSetupBundle(script,apk,'1.7',{kiosk_type:'driver',label:'Bus & %PATH%',pairing_code:'AB&CD',vehicle_name:'1'},'Driver');
   const files=unzipSync(b.bytes);
   const bat=strFromU8(files[Object.keys(files).find(k=>k.endsWith('.bat'))]);
   expect(bat).not.toMatch(/[&%]/);
   expect(bat).toContain('set PRESET_TYPE=1');
   expect(bat).toContain('set PRESET_CODE=ABCD');
 });
 it('the real setup tool keeps FreeKiosk and the helper on the same, tested REST API key',()=>{
   const bat=readFileSync(new URL('../../public/tools/TransitTrack-Tablet-Setup.bat',import.meta.url),'latin1');
   // Windows batch labels break with bare LF line endings.
   expect(bat.replace(/\r\n/g,'')).not.toMatch(/\n/);
   // Keys used on existing tablets contain dashes.
   expect(bat).not.toContain("'^[A-Za-z0-9]{16,128}$'");
   expect(bat.match(/\^\[A-Za-z0-9_-\]\{16,128\}\$/g)?.length).toBe(2);
   const update=bat.slice(bat.indexOf(':update_run'));
   expect(update).toMatch(/--es rest_api_key "%APIKEY%"/);
   expect(update).toMatch(/%HELPER%\/\.MainActivity --es api_key "%APIKEY%"/);
   expect(update).toContain('call :check_key');
   expect(bat.slice(bat.indexOf(':helper_set'),bat.indexOf(':key_ok_setup'))).toContain('call :check_key');
   expect(bat).toContain('http://127.0.0.1:18080/api/js');
   // Credentials are typed per tablet, never stored in the script.
   expect(bat).toMatch(/\r\nset PIN=\r\nset APIKEY=\r\n/);
 });
});
