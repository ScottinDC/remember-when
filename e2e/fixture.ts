import { expect, type Page } from '@playwright/test';
export const backend = 'http://127.0.0.1:54399';
const uid = '00000000-0000-4000-8000-000000000001';
const tid = 'qa-thread';
export const user = { id: uid, email: 'recorder@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'google' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const jwt = (aal='aal1') => [Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600,aal,role:'authenticated'})).toString('base64url'),'synthetic-test-signature'].join('.');
export async function mockArchive(page: Page, options: { admin?: boolean; aal2?: boolean; approved?: boolean; microphoneDenied?: boolean } = {}) {
  const state = {
    uploadFails: false, aiFails: false, uploads: 0, registrations: 0, processes: 0,
    options: {}, unexpected: [] as string[], removedFactors: [] as string[],
    rows: Array.from({length:5},(_,i)=>({id:`question-${i+1}`,thread_id:tid,parent_question_id:null,question:`Tell me a memory about season ${i+1}.`,transcript:null as string|null,mp3_url:null,gcs_object_name:null,storage_object_name:null as string|null,status:'pending',metadata:{sequenceOrder:i+1} as Record<string,unknown>,archived_at:null as string|null,created_at:'2026-01-01T00:00:00Z',timestamp:'2026-01-01T00:00:00Z'})),
  };
  const session={access_token:jwt(options.aal2?'aal2':'aal1'),refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user};
  await page.addInitScript(({session,denied})=>{
    if(!sessionStorage.getItem('qa-initialized')) { localStorage.setItem('sb-127-auth-token',JSON.stringify(session)); sessionStorage.setItem('qa-initialized','1'); }
    // A generated tone exercises real MediaRecorder without reading a microphone.
    Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>{
      if(denied)throw new DOMException('Denied for test','NotAllowedError');
      const context=new AudioContext(); await context.resume();
      const oscillator=context.createOscillator(),destination=context.createMediaStreamDestination();
      oscillator.connect(destination);oscillator.start();
      for(const track of destination.stream.getTracks()) { const stop=track.stop.bind(track);track.stop=()=>{stop();oscillator.stop();void context.close();}; }
      return destination.stream;
    }}});
  },{session,denied:options.microphoneDenied??false});
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin==='http://127.0.0.1:5174')return route.continue();
    if(url.origin!==backend){ if(url.hostname.endsWith('googleapis.com')||url.hostname.endsWith('gstatic.com'))return route.abort();state.unexpected.push(url.origin+url.pathname);return route.abort(); }
    const path=url.pathname,request=route.request();
    let body:any={};try{body=request.postDataJSON()??{};}catch{}
    const reply=(value:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
    if(path==='/auth/v1/user')return reply({...user,factors:options.admin?[
      {id:'unfinished',factor_type:'totp',status:'unverified',friendly_name:'Archive admin previous'},
      {id:'other-app',factor_type:'totp',status:'unverified',friendly_name:'Another app'},
    ]:[]});
    if(path==='/auth/v1/factors/unfinished' && request.method()==='DELETE'){state.removedFactors.push('unfinished');return reply({id:'unfinished'});}
    if(path==='/auth/v1/factors' && request.method()==='POST')return reply({id:'new-factor',type:'totp',totp:{qr_code:'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="white"/><rect x="10" y="10" width="40" height="40" fill="black"/></svg>',secret:'SYNTHETICTESTKEY',uri:'otpauth://totp/synthetic'}});
    if(path==='/auth/v1/factors/new-factor/challenge')return reply({id:'challenge',expires_at:9999999999});
    if(path==='/auth/v1/factors/new-factor/verify')return reply({message:'Synthetic invalid code'},422);
    if(path==='/auth/v1/logout')return reply({});
    if(path==='/auth/v1/token')return reply(session);
    if(path==='/functions/v1/claim-access')return reply(options.approved===false?{error:'Not approved'}:{approved:true,role:options.admin?'admin':'member'},options.approved===false?403:200);
    if(path==='/rest/v1/rpc/ensure_interview')return reply(tid);
    if(path==='/rest/v1/threads')return reply({id:tid,title:'QA story',story_options:state.options,created_at:'2026-01-01',updated_at:'2026-01-01'});
    if(path==='/rest/v1/responses') { const id=url.searchParams.get('id')?.replace('eq.','');return reply(id?state.rows.find(r=>r.id===id):state.rows); }
    if(path==='/rest/v1/recording_jobs')return reply([]);
    if(path.startsWith('/storage/v1/object/interview-audio/')){state.uploads++;return reply(state.uploadFails?{message:'Synthetic upload failure'}:{Key:'saved'},state.uploadFails?503:200);}
    const row=state.rows.find(r=>r.id===(body.p_response_id??body.responseId));
    if(path==='/rest/v1/rpc/register_recording'){state.registrations++;Object.assign(row!,{storage_object_name:body.p_object_path,status:'processing'});return reply('00000000-0000-4000-8000-000000000010');}
    if(path==='/functions/v1/process-answer') {
      if(body.action==='regenerate'){row!.question='A regenerated question about your garden.';return reply({status:'complete'});}
      state.processes++;Object.assign(row!,{status:state.aiFails?'failed':'answered',transcript:state.aiFails?null:'A synthetic memory about planting beans.'});
      return reply({saved:true,processing:state.aiFails?'failed':'complete'});
    }
    if(path==='/rest/v1/rpc/set_question_passed'){if(body.p_passed)row!.metadata.skippedAt='2026-01-01';else delete row!.metadata.skippedAt;return reply(null);}
    if(path==='/rest/v1/rpc/set_recording_archived'){row!.archived_at=body.p_archived?'2026-01-01':null;return reply(null);}
    if(path==='/rest/v1/rpc/save_story_options'){state.options=body.p_options;return reply(null);}
    if(path==='/functions/v1/delete-answer'){Object.assign(row!,{storage_object_name:null,transcript:null,status:'pending'});return reply({status:'deleted'});}
    if(path==='/rest/v1/rpc/admin_archive')return options.aal2?reply({members:[],recordings:[],deliveries:[],total:0}):reply({message:'MFA required'},403);
    state.unexpected.push(path);return reply({message:'Unmocked endpoint'},500);
  });
  return state;
}
export async function recordDraft(page:Page) {
  await page.getByRole('button',{name:'Record response',exact:true}).click();
  await expect(page.getByRole('button',{name:'Stop recording',exact:true})).toBeVisible();
  // Allow a real media frame and timer tick before stopping.
  await expect(page.getByRole('status').filter({hasText:'Recording'})).toContainText('00:01');
  await page.getByRole('button',{name:'Stop recording',exact:true}).click();
  await expect(page.getByRole('button',{name:'Save recording',exact:true})).toBeVisible();
}
