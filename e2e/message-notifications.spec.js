import {test,expect} from '@playwright/test';

async function mockedChat(page,role) {
 const notifications=[],messages=[];
 const vehicle={id:'bus-a',name:'Bus A',company_id:'a',company_name:'Company A',type:'staff_bus',status:'idle',capacity:25};
 await page.addInitScript(()=>{
  localStorage.setItem('base44_access_token','mock-authenticated-session');
  localStorage.setItem('tt_company_access_grant','a'.repeat(64));
  localStorage.setItem('tt_staff_vehicle_id','bus-a');
 });
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=req.url();
  if(url.includes('/integration-endpoints/Core/UploadFile'))return route.fulfill({json:{file_url:'https://mock.invalid/photo.jpg'}});
  if(url.includes('/entities/'))return route.fulfill({status:403,json:{error:'Direct access blocked'}});
  if(url.includes('/functions/notifyAdminMessage')) {
   notifications.push(req.postDataJSON());return route.fulfill({json:{ok:true}});
  }
  if(url.includes('/functions/companyAccess'))return route.fulfill({json:{company:{id:'a',name:'Company A',phone:''}}});
  if(url.includes('/functions/entityAccess')) {
   const body=req.postDataJSON();let result=[];
   if(body.entity==='User')result={id:'caller',role,email:'caller@test.invalid',full_name:'Test Caller',company_id:'a'};
   else if(body.entity==='Vehicle')result=[vehicle];
   else if(body.entity==='Company')result=[{id:'a',name:'Company A'}];
   else if(body.entity==='GroupMessage') {
    if(body.operation==='create') {
     result={id:'saved-message-'+(messages.length+1),...body.data,sender_id:'caller'};
     messages.push(result);
    } else result=messages;
   }
   return route.fulfill({json:{result}});
  }
  return route.fulfill({json:{id:'test-app',public_settings:{authentication_required:false}}});
 });
 await page.route('https://mock.invalid/**',route=>route.abort());
 return {notifications,messages};
}
for(const role of ['mechanic','company','staff'])test(role+' sends text and photo notifications using acknowledged message IDs',async({page})=>{
 const {notifications,messages}=await mockedChat(page,role);
 if(role==='mechanic') {
  await page.goto('/mechanic');
  await page.getByRole('tab',{name:/Messages/}).click();
  await page.getByRole('tabpanel',{name:'Messages'}).getByText('Bus A',{exact:true}).click();
 } else if(role==='company') {
  await page.goto('/manager/analytics');
  await page.getByRole('button',{name:'Open driver chats'}).click();
  await page.getByRole('button',{name:/Bus A/}).click();
 } else {
  await page.goto('/staff');
  await page.getByRole('button',{name:/Chat/}).click();
 }
 const input=page.getByPlaceholder(role==='company'?"Message this bus's driver…":'Message the driver…');
 await input.fill('Saved chat message');await input.press('Enter');
 await expect.poll(()=>notifications.length).toBe(1);
 expect(notifications[0]).toEqual({message_id:messages[0].id});
 expect(messages[0].text).toBe('Saved chat message');
 await page.locator('input[type=file]').setInputFiles({name:'photo.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>')});
 await expect.poll(()=>notifications.length).toBe(2);
 expect(notifications[1]).toEqual({message_id:messages[1].id});
 expect(messages[1]).toMatchObject({message_type:'image',media_url:'https://mock.invalid/photo.jpg'});
});
