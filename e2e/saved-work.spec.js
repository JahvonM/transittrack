import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

async function recoverySession(page, initialRole='admin') {
 const identity={role:initialRole};
 await page.addInitScript(()=>{
  localStorage.setItem('base44_access_token','mock-authenticated-session');
  localStorage.setItem('tt_offline_jobs',JSON.stringify([{id:'job-original',kind:'driver_inspection',label:'Inspection on Bus A',state:'needs_review',queued_at:'2026-10-03T12:00:00Z',last_error:'Photo upload rejected',payload:{client_request_id:'request-original',expected_vehicle_id:'bus-a',expected_company_id:'company-a',expected_device_id:'tablet-a',device_token:'SECRET_DEVICE',driver_grant:'SECRET_UNLOCK',results:[{photos:['data:image/jpeg;base64,ORIGINAL_PHOTO']}]} }]));
 });
 await page.route('**/api/**',async route=>{
  const req=route.request();
  if(req.url().includes('/functions/entityAccess')) {
   const body=req.postDataJSON();
   return route.fulfill({json:{result:body.entity==='User'?{id:'mock-user',email:'mock@test.local',full_name:'Mock User',role:identity.role}:[]}});
  }
  if(req.url().includes('/entities/'))return route.fulfill({status:403,json:{error:'Direct entity access blocked'}});
  return route.fulfill({json:{id:'test-app',public_settings:{authentication_required:false}}});
 });
 await page.goto('/login');
 await page.getByRole('button',{name:'1 saved items need review'}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 return identity;
}
async function exportOriginal(page) {
 const downloadPromise=page.waitForEvent('download');
 await page.getByRole('button',{name:'Export saved work'}).click();
 const download=await downloadPromise;
 const data=JSON.parse(await readFile(await download.path(),'utf8'));
 const original=data.items[0];
 expect(original.payload.client_request_id).toBe('request-original');
 expect(original.payload.expected_vehicle_id).toBe('bus-a');
 expect(original.payload.results[0].photos).toEqual(['data:image/jpeg;base64,ORIGINAL_PHOTO']);
 expect(JSON.stringify(data)).not.toContain('SECRET_');
 return data;
}

test('admin exports and reconciles before archiving; removal requires confirmation',async({page})=>{
 await recoverySession(page);
 const archive=page.getByRole('button',{name:'Archive reviewed items'});
 await expect(archive).toBeDisabled();
 await exportOriginal(page);
 await expect(archive).toBeDisabled();
 await page.getByRole('checkbox').check();
 await expect(archive).toBeEnabled();
 await archive.click();
 await expect(page.getByText(/^Archived ·/)).toBeVisible();
 let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('tt_offline_jobs')));
 expect(saved[0].state).toBe('archived');
 expect(saved[0].payload.client_request_id).toBe('request-original');
 const remove=page.getByRole('button',{name:'Remove exported archived copies'});
 await expect(remove).toBeDisabled();
 await exportOriginal(page);
 await page.getByRole('checkbox').check();
 page.once('dialog',dialog=>dialog.dismiss());
 await remove.click();
 saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('tt_offline_jobs')));
 expect(saved).toHaveLength(1);
 page.once('dialog',dialog=>dialog.accept());
 await remove.click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tt_offline_jobs')).length)).toBe(0);
});

test('mechanic can export preserved originals but cannot archive them',async({page})=>{
 await recoverySession(page,'mechanic');
 await expect(page.getByText('Photo upload rejected')).toBeVisible();
 await exportOriginal(page);
 await expect(page.getByRole('checkbox')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Archive reviewed items'})).toBeDisabled();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('tt_offline_jobs'))[0].state)).toBe('needs_review');
});

test('archive rechecks current admin role after the panel was opened',async({page})=>{
 const identity=await recoverySession(page);
 await exportOriginal(page);
 await page.getByRole('checkbox').check();
 identity.role='mechanic';
 await page.getByRole('button',{name:'Archive reviewed items'}).click();
 await expect(page.getByRole('alert')).toHaveText('An online admin is required.');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('tt_offline_jobs'))[0].state)).toBe('needs_review');
});
