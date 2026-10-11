import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const vehicle = { id: 'bus-a', name: 'Bus A', company_id: 'company-a', capacity: 25, status: 'idle' };
const kiosk = { device_id: 'kiosk-test', paired: true, kiosk_type: 'bus_boarding', company_id: 'company-a', company_name: 'Company A', vehicle_id: 'bus-a', vehicle_name: 'Bus A', context: { vehicle, route: null, occupancy: 7, today_count: 12, ads: [] } };
const driver = { vehicle, driver_name: 'Test Driver', has_driver_pin: true, occupancy: 7, staff: [], check_ins: [], broadcasts: [], group_messages: [], trips: [], inspection_templates: [], recent_inspections: [], open_shift: null, emergency_contacts: { boss_phone: '5551234', secretary_phone: '' } };

async function mockApi(page, calls, driverContext=driver) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = request.url();
    calls.push(url);
    const body = request.postDataJSON();
    if (url.includes('/functions/kioskHeartbeat')) return route.fulfill({ json: kiosk });
    if (url.includes('/functions/kioskCheckIn')) return route.fulfill({ json: { staff: [], generated_at: new Date().toISOString() } });
    if (url.includes('/functions/driverSession')) {
      if (body?.action === 'my_documents') return route.fulfill(body.pin === '1234'
        ? { json: { ok: true, driver_name: 'Test Driver', documents: [
          { kind: 'license', document_number: 'DL-1', expiry_date: '2030-01-31', file_name: 'licence.png', url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' },
          { kind: 'insurance', document_number: 'INS-9', expiry_date: '2020-01-31', file_name: 'cover.pdf', url: 'https://files.test/cover.pdf' }] } }
        : { status: 403, json: { error: 'Incorrect PIN' } });
      if (body?.action === 'verify_pin') return route.fulfill(body.pin === '1234' ? { json: { ok: true, driver_grant: "a".repeat(64) } } : { status: 403, json: { error: 'Incorrect PIN' } });
      return route.fulfill({ json: driverContext });
    }
    if (url.includes('/functions/appSupport')) return route.fulfill({ json: { whatsapp_number: '14735551234' } });
    if (url.includes('/entities/')) return route.fulfill({ status: 403, json: { error: 'Direct entity access blocked in test' } });
    return route.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
  });
}


async function openDriver(page,extra={}) {
 const context={...driver,company_name:'Real Company',...extra};
 await mockApi(page,[],context);
 await page.addInitScript(()=>{
  localStorage.setItem('tt_driver_device_id','driver-test');
  localStorage.setItem('tt-map-engine','basic');
  window.__watchCount=0;window.__clearCount=0;
  navigator.geolocation.watchPosition=()=>{window.__watchCount++;return window.__watchCount;};
  navigator.geolocation.clearWatch=()=>window.__clearCount++;
 });
 await page.route('https://api.mapbox.com/**',r=>r.fulfill({status:404,body:''}));
 await page.goto('/driver/track');
 await page.locator('input[type=password]').fill('1234');
 await page.getByRole('button',{name:'Unlock',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Your journey'})).toBeVisible();
 return context;
}
const sections=page=>page.getByRole('navigation',{name:'Driver sections'});
for(const size of [{width:800,height:1280},{width:600,height:1024},{width:1280,height:800}])test('portrait layout keeps three tabs and real data '+size.width,async({page})=>{
 await page.setViewportSize(size);
 await openDriver(page,{staff:[{id:'one',full_name:'Real Passenger',home_lat:12.02,home_lng:-61.76}],occupancy:7});
 const nav=sections(page);
 await expect(nav.getByRole('button')).toHaveCount(3);
 await expect(nav.getByRole('button',{name:'Drive',exact:true})).toHaveAttribute('aria-current','page');
 await expect(page.getByText('Real Company · Bus A',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const box=await nav.boundingBox();expect(box.y+box.height).toBeLessThanOrEqual(size.height+1);
 await nav.getByRole('button',{name:'Passengers',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Passengers',exact:true})).toBeVisible();
 await expect(page.getByLabel('Assigned passengers').getByText('Real Passenger')).toBeVisible();
 await expect(page.locator('.dk-counts')).toContainText('7');
 await nav.getByRole('button',{name:'More',exact:true}).click();
 await expect(page.getByRole('button',{name:'Licence & insurance'})).toBeVisible();
 await page.getByRole('button',{name:'Licence & insurance'}).click();
 await expect(page.getByRole('heading',{name:'Licence & insurance'})).toBeVisible();
 await page.getByRole('button',{name:'Back to More'}).click();
 await page.getByRole('button',{name:'Tablet & reader',exact:false}).click();
 await expect(page.getByRole('heading',{name:'Tablet settings'})).toBeVisible();
 await nav.getByRole('button',{name:'Drive',exact:true}).click();
 await page.screenshot({path:'/tmp/driver-portrait-'+size.width+'.png'});
});
test('navigation is on demand and passenger directions open it',async({page})=>{
 await page.setViewportSize({width:800,height:1280});
 await openDriver(page,{route:{name:'Real Route',stops:[{name:'Real Pickup',lat:12.02,lng:-61.76,order:0},{name:'Real Destination',lat:12.03,lng:-61.75,order:1}]},staff:[{id:'one',full_name:'Real Passenger',home_lat:12.02,home_lng:-61.76}]});
 await expect(page.locator('.leaflet-container')).toHaveCount(0);
 await page.getByRole('button',{name:'Navigation',exact:true}).click();
 await expect(page.getByLabel('Driver navigation map')).toBeVisible();
 await page.getByRole('button',{name:'Back to journey'}).click();
 await expect(page.getByLabel('Driver navigation map')).toBeHidden();
 await sections(page).getByRole('button',{name:'Passengers',exact:true}).click();
 await page.getByRole('button',{name:'Directions to Real Passenger'}).click();
 await expect(page.getByLabel('Driver navigation map')).toBeVisible();
});
test('tracking continues across passenger and More tabs',async({page})=>{
 await openDriver(page,{vehicle:{...vehicle,tracking_active:true},open_shift:{id:'shift',started_at:new Date().toISOString()}});
 await expect.poll(()=>page.evaluate(()=>window.__watchCount)).toBe(1);
 await sections(page).getByRole('button',{name:'Passengers',exact:true}).click();
 await sections(page).getByRole('button',{name:'More',exact:true}).click();
 expect(await page.evaluate(()=>window.__watchCount)).toBe(1);
 expect(await page.evaluate(()=>window.__clearCount)).toBe(0);
});
test('search and latest boarding use original records',async({page})=>{
 await openDriver(page,{staff:[{id:'a',full_name:'Alice Actual'},{id:'b',full_name:'Ben Actual'}],check_ins:[{id:'tap',staff_name:'Alice Actual',status:'boarded',boarded_at:new Date().toISOString(),check_in_method:'nfc'}]});
 await sections(page).getByRole('button',{name:'Passengers',exact:true}).click();
 await page.getByLabel('Search passengers').fill('Ben');
 await expect(page.getByLabel('Assigned passengers').getByText('Ben Actual')).toBeVisible();
 await expect(page.getByLabel('Assigned passengers').getByText('Alice Actual')).toHaveCount(0);
 await expect(page.getByLabel('Latest boarding activity')).toContainText('Alice Actual boarded');
 await page.getByText('Recent boarding history',{exact:true}).click();
 await expect(page.locator('.dk-history')).toContainText('Alice Actual');
});
test('More fault report preserves existing handler and fields',async({page})=>{
 await openDriver(page);const sent=[];
 await page.route('**/functions/driverSession',r=>{const b=r.request().postDataJSON();if(b.action==='report_incident'){sent.push(b);return r.fulfill({json:{ok:true}});}return r.fallback();});
 await sections(page).getByRole('button',{name:'More',exact:true}).click();
 await page.getByRole('button',{name:'Report fault'}).click();
 await page.getByPlaceholder('Describe what happened...').fill('Real inspection finding');
 await page.getByRole('button',{name:'Submit report'}).click();
 await expect.poll(()=>sent.length).toBe(1);
 expect(sent[0]).toMatchObject({action:'report_incident',type:'breakdown',details:'Real inspection finding',device_id:'driver-test'});
});
