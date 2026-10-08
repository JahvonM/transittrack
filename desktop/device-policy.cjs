const crypto=require('node:crypto');
const {APP_ORIGIN}=require('./policy.cjs');
function serial(value){if(typeof value!=='string'||!/^[A-Za-z0-9._:-]{1,120}$/.test(value)||value.startsWith('-')||value==='unknown')throw Error('Select a valid connected tablet.');return value;}
function devices(text){return text.split(/\r?\n/).filter(l=>!l.startsWith('List of')&&l.trim()).map(l=>{const [id,state,...info]=l.trim().split(/\s+/);return {serial:id,state,model:info.find(x=>x.startsWith('model:'))?.slice(6)||''};}).filter(d=>/^[A-Za-z0-9._:-]{1,120}$/.test(d.serial));}
function helperFromSetup(text){
 const hash=text.match(/^set HELPER_SHA256=([a-f0-9]{64})\s*$/im)?.[1]?.toLowerCase();
 const lines=[...text.matchAll(/^::TTAPK ([A-Za-z0-9+/=]+)\s*$/gm)].map(m=>m[1]);
 if(!hash||!lines.length)throw Error('Choose the tablet setup file downloaded from Admin → Kiosk Tablets. It must contain the signed Helper.');
 const bytes=Buffer.from(lines.join(''),'base64');
 if(bytes.length>30*1024*1024||bytes.length<1000||bytes.subarray(0,2).toString()!=='PK'||crypto.createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('Helper integrity check failed. Download the setup file again.');
 return {bytes,version:text.match(/^set HELPER_VERSION=([0-9.]+)\s*$/im)?.[1]||'unknown'};
}
function configuration(input){
 serial(input.serial);
 if(!['update','new'].includes(input.mode)||!['driver','boarding'].includes(input.type))throw Error('Choose a valid tablet mode and type.');
 if(!(input.mode==='update'?/^[0-9]{4,12}$/:/^[0-9]{6,12}$/).test(input.pin))throw Error('Use 6–12 PIN digits for new tablets, or 4–12 for existing tablets.');
 if(!/^[A-Za-z0-9_-]{16,128}$/.test(input.apiKey))throw Error('Enter this tablet’s REST key (16–128 letters, digits, - or _).');
 if(input.mode==='new'&&!/^[A-Z0-9]{12}$/.test(input.code))throw Error('Enter the 12-character pairing code from Admin.');
 if(input.type==='boarding'&&input.mode==='new'&&(!/^[A-Za-z0-9_-]{1,24}$/.test(input.bus)||!/^[A-Za-z0-9]{8,63}$/.test(input.hotspotPassword)))throw Error('Enter the bus number and its existing Wi-Fi password (8–63 letters/digits).');
 const helper='com.transittrack.kioskhelper';
 const steps=[['Keep screen awake',['shell','settings','put','system','screen_off_timeout','2147483647']],['Stay awake on charger',['shell','settings','put','global','stay_on_while_plugged_in','7']],['Helper settings permission',['shell','pm','grant',helper,'android.permission.WRITE_SECURE_SETTINGS']],['Helper battery exemption',['shell','dumpsys','deviceidle','whitelist','+'+helper]],['Helper Wi-Fi permission',['shell','pm','grant',helper,'android.permission.ACCESS_FINE_LOCATION']],['Location enabled',['shell','settings','put','secure','location_mode','3']],['Helper system settings',['shell','appops','set',helper,'WRITE_SETTINGS','allow']]];
 if(input.type==='driver'){steps.push(['USB GPS permission',['shell','appops','set',helper,'android:mock_location','allow']],['Hotspot support',['shell','settings','put','global','hidden_api_policy','1']]);}
 if(input.mode==='new'){
  steps.unshift(['FreeKiosk device owner',['shell','dpm','set-device-owner','com.freekiosk/.DeviceAdminReceiver']]);
  steps.push(['Landscape',['shell','settings','put','system','accelerometer_rotation','0']],['Landscape orientation',['shell','settings','put','system','user_rotation','1']]);
 }
 steps.push(['FreeKiosk settings permission',['shell','pm','grant','com.freekiosk','android.permission.WRITE_SECURE_SETTINGS']],['FreeKiosk camera permission',['shell','pm','grant','com.freekiosk','android.permission.CAMERA']],['FreeKiosk location permission',['shell','pm','grant','com.freekiosk','android.permission.ACCESS_FINE_LOCATION']],['FreeKiosk usage access',['shell','appops','set','com.freekiosk','GET_USAGE_STATS','allow']]);
 const kiosk=['shell','am','start','-n','com.freekiosk/.MainActivity','--es','pin',input.pin,'--es','rest_api_enabled','true','--es','rest_api_port','8080','--es','rest_api_key',input.apiKey];
 if(input.mode==='new')kiosk.push('--es','url',APP_ORIGIN+'/'+(input.type==='driver'?'driver':'kiosk')+'?code='+input.code,'--ez','kiosk_enabled','true','--es','auto_launch','true','--es','auto_relaunch','true');
 steps.push(['Configure FreeKiosk',kiosk]);
 const launch=['shell','am','start','-n',helper+'/.MainActivity','--es','api_key',input.apiKey,'--es','ignition','false'];
 if(input.mode==='new'){
  launch.push('--es','reader',input.type==='boarding'?'true':'false','--es','gps',input.type==='driver'?'true':'false','--es','hotspot',input.type==='driver'?'true':'false');
  if(input.type==='boarding')launch.push('--es','join_ssid','TT-BUS'+input.bus,'--es','join_pass',input.hotspotPassword);
 }
 steps.push(['Start Helper',launch],['Open FreeKiosk',['shell','am','start','-n','com.freekiosk/.MainActivity']]);
 return steps;
}
module.exports={serial,devices,helperFromSetup,configuration};
