import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tabletSetupBundle,HELPER_LINE} from './tabletSetupBundle';
const apk=new Uint8Array(Array.from({length:5000},(_,i)=>(i*37+11)&255));
const sha=createHash('sha256').update(apk).digest('hex');
const script='set PRESET_TYPE=\r\nset PRESET_CODE=\r\nset PRESET_BUS=\r\nset PRESET_NAME=\r\nset HELPER_VERSION=\r\nset HELPER_SHA256=\r\ncall :extract_helper\r\nexit /b 0\r\n';
const text=b=>new TextDecoder().decode(b.bytes);
const builtIn=t=>Uint8Array.from(Buffer.from(t.split('\r\n').filter(l=>l.startsWith(HELPER_LINE)).map(l=>l.slice(HELPER_LINE.length)).join(''),'base64'));
describe('USB tablet setup bundle',()=>{
 it('is one setup file with the helper built in, no separate APK',()=>{
   const bundle=tabletSetupBundle(script,apk,'1.7',null,'',sha);
   expect(bundle.filename).toBe('TransitTrack-Tablet-Setup-Helper-1.7.bat');
   const t=text(bundle);
   expect(t.startsWith(script.replace('set HELPER_VERSION=\r\n','set HELPER_VERSION=1.7\r\n').replace('set HELPER_SHA256=\r\n',`set HELPER_SHA256=${sha}\r\n`))).toBe(true);
   expect(builtIn(t)).toEqual(apk);
   // Windows batch labels break with bare LF line endings.
   expect(t.replace(/\r\n/g,'')).not.toMatch(/\n/);
   // The helper lines come after the script's last line, so cmd never runs them.
   expect(t.indexOf(HELPER_LINE)).toBeGreaterThan(t.indexOf('exit /b 0'));
 });
 it('prefills the intended tablet without changing its updater or helper bytes',()=>{
   const bundle=tabletSetupBundle(script,apk,'1.7',{kiosk_type:'bus_boarding',pairing_code:'TESTPAIR12',label:'Bus 2',vehicle_name:'Bus 2'},'Bus boarding',sha);
   expect(bundle.filename).toBe('TransitTrack-Setup-Bus-2-Helper-1.7.bat');
   const bat=text(bundle);
   expect(bat).toContain('set PRESET_TYPE=2\r\n');
   expect(bat).toContain('set PRESET_CODE=TESTPAIR12\r\n');
   expect(bat).toContain('set PRESET_BUS=2\r\n');
   expect(bat).toContain('call :extract_helper');
   expect(builtIn(bat)).toEqual(apk);
 });
 it('removes shell metacharacters from preset fields and ignores a malformed hash',()=>{
   const b=tabletSetupBundle(script,apk,'1.7',{kiosk_type:'driver',label:'Bus & %PATH%',pairing_code:'AB&CD',vehicle_name:'1'},'Driver','x&y');
   const bat=text(b);
   expect(bat).not.toMatch(/[&%]/);
   expect(bat).toContain('set PRESET_TYPE=1');
   expect(bat).toContain('set PRESET_CODE=ABCD');
   expect(bat).toContain('set HELPER_SHA256=\r\n');
 });
 it('the real setup tool keeps FreeKiosk and the helper on the same, tested REST API key',()=>{
   const bat=readFileSync(new URL('../../public/tools/TransitTrack-Tablet-Setup.bat',import.meta.url),'latin1');
   // Windows batch labels break with bare LF line endings.
   expect(bat.replace(/\r\n/g,'')).not.toMatch(/\n/);
   // Keys used on existing tablets contain dashes.
   expect(bat).not.toContain("'^[A-Za-z0-9]{16,128}$'");
   expect(bat.match(/\^\[A-Za-z0-9_-\]\{16,128\}\$/g)?.length).toBe(3);
   const update=bat.slice(bat.indexOf(':update_run'));
   expect(update).toMatch(/--es rest_api_key "%APIKEY%"/);
   expect(update).toMatch(/%HELPER%\/\.MainActivity --es api_key "%APIKEY%"/);
   expect(update).toContain('call :check_key');
   expect(bat.slice(bat.indexOf(':helper_set'),bat.indexOf(':key_ok_setup'))).toContain('call :check_key');
   expect(bat).toContain('http://127.0.0.1:18080/api/js');
   // Credentials are typed per tablet, never stored in the script.
   expect(bat).toMatch(/\r\nset PIN=\r\nset APIKEY=\r\n/);
 });
 it('the real setup tool keeps every bus tablet screen on, on battery too',()=>{
   const bat=readFileSync(new URL('../../public/tools/TransitTrack-Tablet-Setup.bat',import.meta.url),'latin1');
   const setupCommon=bat.slice(bat.indexOf('Step 3 of 7'),bat.indexOf(':perms_driver'));
   expect(setupCommon).toContain('settings put system screen_off_timeout 2147483647');
   const updCommon=bat.slice(bat.indexOf('Update 2 of 3'),bat.indexOf(':upd_driver'));
   expect(updCommon.indexOf('screen_off_timeout 2147483647')).toBeLessThan(updCommon.indexOf('if "%TYPE%"=="1" goto upd_driver'));
   expect(bat).not.toContain('off after about 5 seconds');
   // The helper is unpacked from the file itself, never fetched or kept beside it.
   expect(bat.match(/call :extract_helper/g)?.length).toBe(2);
   expect(bat).toContain("$p='::TT'+'APK '");
   expect(bat).not.toContain('::TTAPK ');
 });
});
