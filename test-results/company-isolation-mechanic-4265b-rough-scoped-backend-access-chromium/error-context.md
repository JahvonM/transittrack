# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: company-isolation.spec.js >> mechanic sees vehicles from both companies through scoped backend access
- Location: e2e/company-isolation.spec.js:21:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 3

- Array []
+ Array [
+   "http://localhost:4173/api/apps/6a98b192be27b5f9635020ba/entities/User/me",
+ ]
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e4]:
    - banner [ref=e5]:
      - generic [ref=e6]:
        - generic [ref=e7]:
          - button "Go back" [ref=e8] [cursor=pointer]
          - link "TransitTrack TransitTrack" [ref=e9] [cursor=pointer]:
            - /url: /
            - img "TransitTrack" [ref=e10]
            - generic [ref=e11]: TransitTrack
        - generic [ref=e12]:
          - generic [ref=e13]: Test Caller
          - link "My account" [ref=e14] [cursor=pointer]:
            - /url: /account
          - button "Sign out" [ref=e16] [cursor=pointer]
    - main [ref=e18]:
      - heading "Mechanic" [level=1] [ref=e19]
      - generic [ref=e20]:
        - generic [ref=e22]:
          - generic [ref=e23]:
            - paragraph [ref=e24]: Sunday, October 4
            - heading "Good morning, Test" [level=2] [ref=e25]
            - paragraph [ref=e31]: Vehicle issues and maintenance
          - generic [ref=e32]:
            - button "Turn on location for local weather" [ref=e33] [cursor=pointer]
            - generic [ref=e37]: 12:53:19 AM
        - generic [ref=e38]:
          - link "Run inspection" [ref=e39] [cursor=pointer]:
            - /url: /run-inspection
          - button "Maintenance settings" [ref=e40] [cursor=pointer]
          - button "Enable notifications" [ref=e41] [cursor=pointer]
        - generic [ref=e42]:
          - tablist [ref=e43]:
            - tab "Dashboard" [ref=e44] [cursor=pointer]
            - tab "Messages" [active] [selected] [ref=e50] [cursor=pointer]
          - tabpanel "Messages" [ref=e53]:
            - generic [ref=e55]:
              - generic [ref=e61] [cursor=pointer]:
                - paragraph [ref=e63]: Bus A
                - paragraph [ref=e64]: No messages yet
              - generic [ref=e70] [cursor=pointer]:
                - paragraph [ref=e72]: Bus B
                - paragraph [ref=e73]: No messages yet
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
> 29 |  expect(direct).toEqual([]);
     |                 ^ Error: expect(received).toEqual(expected) // deep equality
  30 | });
  31 | test('company fleet uses approved context and scoped entity access',async({page})=>{
  32 |  const {calls,direct}=await session(page,'company');
  33 |  await page.goto('/company');
  34 |  await expect(page.getByText('Bus A',{exact:true}).first()).toBeVisible();
  35 |  await expect(page.getByText('Bus B',{exact:true})).toHaveCount(0);
  36 |  expect(calls.some(c=>c.entity==='User' && c.id==='me')).toBe(true);
  37 |  expect(direct).toEqual([]);
  38 | });
  39 | 
```