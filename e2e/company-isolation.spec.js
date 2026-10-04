import {test,expect} from '@playwright/test';
const vehicles=[{id:'bus-a',name:'Bus A',company_id:'a',company_name:'Company A',type:'staff_bus',status:'idle',capacity:25},{id:'bus-b',name:'Bus B',company_id:'b',company_name:'Company B',type:'staff_bus',status:'idle',capacity:25}];
async function session(page,role) {
 const calls=[],direct=[];
 await page.addInitScript(()=>localStorage.setItem('base44_access_token','mock-authenticated-session'));
 await page.route('**/api/**',async route=>{
  const request=route.request(), url=request.url();
  if(url.includes('/entities/')) {direct.push(url);return route.fulfill({status:403,json:{error:'Direct entity access blocked'}});}
  if(url.includes('/functions/entityAccess')) {
   const body=request.postDataJSON();calls.push(body);
   let result=[];
   if(body.entity==='User' && body.operation==='get') result={id:'caller',email:'caller@test.local',full_name:'Test Caller',role,company_id:role==='company'?'a':''};
   else if(body.entity==='Vehicle') result=role==='mechanic'?vehicles:[vehicles[0]];
   else if(body.entity==='Company') result=role==='mechanic'?[{id:'a',name:'Company A'},{id:'b',name:'Company B'}]:[{id:'a',name:'Company A'}];
   return route.fulfill({json:{result}});
  }
  return route.fulfill({json:{id:'test-app',public_settings:{authentication_required:false}}});
 });
 return {calls,direct};
}
test('mechanic sees vehicles from both companies through scoped backend access',async({page})=>{
 const {calls,direct}=await session(page,'mechanic');
 await page.goto('/mechanic');
 await expect(page.getByRole('tab',{name:/Messages/})).toBeVisible();
 await page.getByRole('tab',{name:/Messages/}).click();
 await expect(page.getByText('Bus A',{exact:true})).toBeVisible();
 await expect(page.getByText('Bus B',{exact:true})).toBeVisible();
 expect(calls.some(c=>c.entity==='Vehicle' && c.operation==='list')).toBe(true);
 // SDK analytics resolves its own signed-in User/me; all app entity reads use the gateway.
 expect(direct.filter(url=>!url.endsWith('/entities/User/me'))).toEqual([]);
});
test('company fleet uses approved context and scoped entity access',async({page})=>{
 const {calls,direct}=await session(page,'company');
 await page.goto('/company');
 await expect(page.getByText(/^Bus A · Driver:/).first()).toBeVisible();
 await expect(page.getByText('Bus B',{exact:true})).toHaveCount(0);
 expect(calls.some(c=>c.entity==='User' && c.id==='me')).toBe(true);
 // SDK analytics resolves its own signed-in User/me; all app entity reads use the gateway.
 expect(direct.filter(url=>!url.endsWith('/entities/User/me'))).toEqual([]);
});

test('email passenger directory links to card issuing without displaying card UIDs',async({page})=>{
 await session(page,'admin');
 await page.route('**/functions/nfcCards',route=>route.fulfill({json:{people:[{key:'user:email-passenger',source:'user',id:'email-passenger',name:'Email Passenger',email:'email@test.invalid',company_id:'a',company_name:'Company A',registered:true,status:'Unassigned'}]}}));
 await page.goto('/admin/directory');
 await expect(page.getByText('Email Passenger',{exact:true})).toBeVisible();
 await expect(page.getByText('Email account',{exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Issue card'})).toHaveAttribute('href','/admin/cards?person=user%3Aemail-passenger');
});
test('card designer exports a printable PNG using selected passenger details',async({page})=>{
 await session(page,'admin');
 await page.route('**/functions/nfcCards',route=>route.fulfill({json:{people:[{key:'user:email-passenger',name:'Email Passenger',company_name:'Company A',employee_id:'EMP-12',card:{card_uid:'SECRETUID'}}]}}));
 await page.goto('/admin/card-designs');
 await page.getByLabel('Card holder',{exact:true}).selectOption('user:email-passenger');
 await expect(page.getByTestId('card-artwork-preview')).toContainText('Email Passenger');
 await expect(page.getByTestId('card-artwork-preview')).toContainText('EMP-12');
 await expect(page.getByTestId('card-artwork-preview')).not.toContainText('SECRETUID');
 const downloaded=page.waitForEvent('download');
 await page.getByRole('button',{name:'Download PNG',exact:true}).click();
 const download=await downloaded;
 expect(download.suggestedFilename()).toBe('Email-Passenger-front-card.png');
 const stream=await download.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);
 const bytes=Buffer.concat(chunks);
 expect(bytes.subarray(1,4).toString()).toBe('PNG');
 expect(bytes.readUInt32BE(16)).toBe(1011);expect(bytes.readUInt32BE(20)).toBe(638);
 await page.getByRole('button',{name:'Back',exact:true}).click();
 await expect(page.getByTestId('card-artwork-preview')).toContainText('If found');
});
