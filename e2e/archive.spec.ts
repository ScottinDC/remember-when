import {test,expect} from '@playwright/test';
import {mockArchive,recordDraft} from './fixture';
test('member opens the real app without admin controls and has no mobile overflow',async({page})=>{
 const state=await mockArchive(page);await page.goto('/');
 await expect(page.getByRole('heading',{name:'Your next memory'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Administration',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:test.info().outputPath('interview.png'),fullPage:true});expect(state.unexpected).toEqual([]);
});
test('unapproved account cannot open interview',async({page})=>{
 const state=await mockArchive(page,{approved:false});await page.goto('/');
 await expect(page.getByRole('button',{name:'Continue with Google'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Record response'})).toHaveCount(0);expect(state.registrations).toBe(0);
});
test('microphone denial is recoverable and creates no upload',async({page})=>{
 const state=await mockArchive(page,{microphoneDenied:true});await page.goto('/');
 await page.getByRole('button',{name:'Record response'}).click();
 await expect(page.getByRole('alert')).toContainText('Microphone access');
 await expect(page.getByRole('button',{name:'Record response'})).toBeEnabled();expect(state.uploads).toBe(0);
});
test('stopped draft survives refresh, upload failure and successful retry; AI failure keeps audio',async({page})=>{
 const state=await mockArchive(page);await page.goto('/');await recordDraft(page);
 await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeDisabled();
 await expect(page.getByRole('alert')).toHaveCount(0);
 await page.reload();
 await expect(page.getByRole('button',{name:'Save recording',exact:true})).toBeVisible();
 state.uploadFails=true;await page.getByRole('button',{name:'Save recording',exact:true}).click();
 await expect(page.getByText('Could not upload the recording:',{exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'Save recording',exact:true})).toBeEnabled();expect(state.registrations).toBe(0);
 state.uploadFails=false;state.aiFails=true;await page.getByRole('button',{name:'Save recording',exact:true}).click();
 await expect(page.getByText('Recording saved. You can retry',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'My recordings',exact:true}).click();
 await expect(page.getByRole('button',{name:'Listen to recording',exact:true})).toHaveCount(1);
 state.aiFails=false;await page.getByRole('button',{name:'Retry transcript & next question'}).click();
 await expect(page.getByText('A synthetic memory about planting beans.',{exact:true})).toBeVisible();
 expect(state.uploads).toBe(2);expect(state.registrations).toBe(1);expect(state.processes).toBe(2);expect(state.unexpected).toEqual([]);
});
test('pass and regeneration preserve the question flow',async({page})=>{
 const state=await mockArchive(page);await page.goto('/');
 await page.getByRole('button',{name:'Try a different question'}).click();
 await expect(page.getByText('A regenerated question about your garden.',{exact:true}).first()).toBeVisible();
 await page.getByRole('button',{name:'Pass for now',exact:true}).click();
 await expect.poll(()=>state.rows[0].metadata.skippedAt).toBeTruthy();
 expect(state.rows).toHaveLength(5);expect(state.unexpected).toEqual([]);
});
test('administrator remains behind the MFA gate at AAL1',async({page})=>{
 await mockArchive(page,{admin:true});await page.goto('/');
 await expect(page.getByRole('button',{name:'Set up authenticator'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Export archive JSON'})).toHaveCount(0);
});
test('authenticator QR loads and manual setup is available without unlocking administration',async({page})=>{
 const state=await mockArchive(page,{admin:true});await page.goto('/');
 await expect(page.getByRole('heading',{name:'Administration',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Set up authenticator'}).click();
 const qr=page.getByRole('img',{name:'Scan this code in your authenticator app'});
 await expect(qr).toBeVisible();
 await expect.poll(()=>qr.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
 await page.getByText('On the same phone, or unable to scan?',{exact:true}).click();
 await expect(page.getByText('SYNTHETICTESTKEY',{exact:true})).toBeVisible();
 expect(state.removedFactors).toEqual(['unfinished']);
 await page.getByRole('textbox',{name:'Six-digit code'}).fill('123456');
 await page.getByRole('button',{name:'Verify and open administration'}).click();
 await expect(page.getByRole('alert')).toContainText('That code was not accepted');
 await expect(page.getByRole('button',{name:'Export archive JSON'})).toHaveCount(0);
 expect(state.unexpected).toEqual([]);
});
