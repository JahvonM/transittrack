# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: company-isolation.spec.js >> company fleet uses approved context and scoped entity access
- Location: e2e/company-isolation.spec.js:31:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Bus A', { exact: true }).first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText('Bus A', { exact: true }).first() with timeout 5000ms
  - waiting for getByText('Bus A', { exact: true }).first()

```

```yaml
- banner:
  - button "Go back":
    - img
  - link "TransitTrack TransitTrack":
    - /url: /
    - img "TransitTrack"
    - text: TransitTrack
  - text: Test Caller
  - link "My account":
    - /url: /account
    - img
    - text: My account
  - button "Sign out":
    - img
    - text: Sign out
- main:
  - heading "Company A · Dashboard" [level=1]
  - img
  - text: Passenger access code — share it so passengers can see your fleet Not set
  - button "Copy":
    - img
    - text: Copy
  - button "New code":
    - img
    - text: New code
  - button "Edit details":
    - img
    - text: Edit details
  - tablist:
    - tab "Vehicles (1)" [selected]:
      - img
      - text: Vehicles (1)
    - tab "Routes (0)":
      - img
      - text: Routes (0)
    - tab "Trips (0)":
      - img
      - text: Trips (0)
    - tab "Profile":
      - img
      - text: Profile
  - tabpanel "Vehicles (1)":
    - button "Add vehicle":
      - img
      - text: Add vehicle
    - text: "Bus A · Driver: Unassigned"
    - combobox: No route
    - text: idle
    - link:
      - /url: /vehicle/bus-a
      - img
    - button "Edit":
      - img
    - button:
      - img
    - img
    - text: Live fleet map
    - region "Map"
    - link "Mapbox homepage":
      - /url: https://www.mapbox.com/
    - button "Full screen":
      - img
    - button "Show my location":
      - img
    - button "Satellite view":
      - img
    - button "Zoom in":
      - img
    - button "Zoom out":
      - img
    - paragraph: Live vehicle positions with your route stop paths.
- region "Notifications (F8)":
  - list
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | const vehicles=[{id:'bus-a',name:'Bus A',company_id:'a',company_name:'Company A',type:'staff_bus',status:'idle',capacity:25},{id:'bus-b',name:'Bus B',company_id:'b',company_name:'Company B',type:'staff_bus',status:'idle',capacity:25}];
  3  | async function session(page,role) {
  4  |  const calls=[],direct=[];
  5  |  await page.addInitScript(()=>localStorage.setItem('base44_access_token','mock-authenticated-session'));
  6  |  await page.route('**/api/**',async route=>{
  7  |   const request=route.request(), url=request.url();
  8  |   if(url.includes('/entities/')) {direct.push(url);return route.fulfill({status:403,json:{error:'Direct entity access blocked'}});}
  9  |   if(url.includes('/functions/entityAccess')) {
  10 |    const body=request.postDataJSON();calls.push(body);
  11 |    let result=[];
  12 |    if(body.entity==='User' && body.operation==='get') result={id:'caller',email:'caller@test.local',full_name:'Test Caller',role,company_id:role==='company'?'a':''};
  13 |    else if(body.entity==='Vehicle') result=role==='mechanic'?vehicles:[vehicles[0]];
  14 |    else if(body.entity==='Company') result=role==='mechanic'?[{id:'a',name:'Company A'},{id:'b',name:'Company B'}]:[{id:'a',name:'Company A'}];
  15 |    return route.fulfill({json:{result}});
  16 |   }
  17 |   return route.fulfill({json:{id:'test-app',public_settings:{authentication_required:false}}});
  18 |  });
  19 |  return {calls,direct};
  20 | }
  21 | test('mechanic sees vehicles from both companies through scoped backend access',async({page})=>{
  22 |  const {calls,direct}=await session(page,'mechanic');
  23 |  await page.goto('/mechanic');
  24 |  await expect(page.getByRole('tab',{name:/Messages/})).toBeVisible();
  25 |  await page.getByRole('tab',{name:/Messages/}).click();
  26 |  await expect(page.getByText('Bus A',{exact:true})).toBeVisible();
  27 |  await expect(page.getByText('Bus B',{exact:true})).toBeVisible();
  28 |  expect(calls.some(c=>c.entity==='Vehicle' && c.operation==='list')).toBe(true);
  29 |  expect(direct).toEqual([]);
  30 | });
  31 | test('company fleet uses approved context and scoped entity access',async({page})=>{
  32 |  const {calls,direct}=await session(page,'company');
  33 |  await page.goto('/company');
> 34 |  await expect(page.getByText('Bus A',{exact:true}).first()).toBeVisible();
     |                                                             ^ Error: expect(locator).toBeVisible() failed
  35 |  await expect(page.getByText('Bus B',{exact:true})).toHaveCount(0);
  36 |  expect(calls.some(c=>c.entity==='User' && c.id==='me')).toBe(true);
  37 |  expect(direct).toEqual([]);
  38 | });
  39 | 
```