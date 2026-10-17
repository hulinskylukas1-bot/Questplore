const SUPABASE_URL='https://hnhyscllpnyzbxhrffph.supabase.co';
const SUPABASE_KEY='sb_publishable_w0N986iN3rTUBQjDLogNhQ_BXcmNRWH';
async function rpc(name,params={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const res=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{
      method:'POST',
      headers:{
        'apikey':SUPABASE_KEY,
        'Authorization':`Bearer ${SUPABASE_KEY}`,
        'Content-Type':'application/json',
        'Accept':'application/json'
      },
      body:JSON.stringify(params),
      signal:controller.signal
    });
    let body=null;
    const txt=await res.text();
    if(txt){try{body=JSON.parse(txt)}catch{body=txt}}
    if(!res.ok){
      const msg=(body&&body.message)||String(body||`HTTP ${res.status}`);
      return {data:null,error:new Error(msg)};
    }
    return {data:body,error:null};
  }catch(e){
    if(e?.name==='AbortError')return {data:null,error:new Error('Server neodpověděl do 12 sekund. Zkuste znovu načíst stránku.')};
    return {data:null,error:e};
  }finally{clearTimeout(timer)}
}
const root=document.getElementById('app');
let data, stageIndex=0, cursor=0, visible=[], waiting=false, session=null, syncTimer=null, applyingRemote=false;
const state={lastChoice:null,choices:{},solved:{},responses:{},quizAnswers:{},progressStep:0,seenBlockIds:[],visitedStageIds:[]};
const DEVICE_KEY='ha_device_token', SESSION_KEY='ha_spiknuti_session';
function uuid(){
 if(globalThis.crypto&&crypto.randomUUID)return crypto.randomUUID();
 const b=new Uint8Array(16);(globalThis.crypto||window.crypto).getRandomValues(b);
 b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
 const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
 return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
let deviceToken=localStorage.getItem(DEVICE_KEY); if(!deviceToken){deviceToken=uuid();localStorage.setItem(DEVICE_KEY,deviceToken)}
function distance(a,b){a=norm(a);b=norm(b);const m=a.length,n=b.length,d=Array.from({length:m+1},()=>Array(n+1).fill(0));for(let i=0;i<=m;i++)d[i][0]=i;for(let j=0;j<=n;j++)d[0][j]=j;for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[m][n]}
function fuzzy(a,b){const x=norm(a),y=norm(b);if(x===y)return true;if(/^\d+$/.test(x)||/^\d+$/.test(y))return false;if(Math.min(x.length,y.length)<4)return false;const lim=Math.max(x.length,y.length)>=9?2:1;return distance(x,y)<=lim}
function phraseMatch(answer,value){
 const a=norm(answer).split(' ').filter(Boolean),v=norm(value).split(' ').filter(Boolean);
 if(a.length!==v.length)return false;
 return a.every((tok,i)=>/^\d+$/.test(tok)?tok===v[i]:fuzzy(tok,v[i]));
}
function requiredTermsMatch(terms,value){
 const words=norm(value).split(' ').filter(Boolean),used=new Set();
 return terms.every(term=>{
   const t=norm(term); let hit=-1;
   for(let i=0;i<words.length;i++)if(!used.has(i)&&(/^\d+$/.test(t)?words[i]===t:fuzzy(t,words[i]))){hit=i;break}
   if(hit<0)return false; used.add(hit); return true;
 });
}
function rememberResponse(b,eventType,eventData){
 if(!b)return;
 if(eventType==='answer_correct')state.responses[b.id]={kind:'text',value:eventData.answer||''};
 else if(eventType==='choice')state.responses[b.id]={kind:'choice',value:eventData.value};
 else if(eventType==='quiz_complete')state.responses[b.id]={kind:'quiz',value:eventData.answers||[]};
 else if(eventType==='gps_confirmed')state.responses[b.id]={kind:'gps',value:eventData};
 else if(eventType==='photo_uploaded')state.responses[b.id]={kind:'photo',value:eventData};
 else if(eventType==='sorting_complete'||eventType==='sorting_draft_complete')state.responses[b.id]={kind:'sorting',value:eventData.order||[]};
 else if(eventType==='confirm')state.responses[b.id]={kind:'confirm',value:true};
}
async function persistProgress(
 b,eventType,eventData={},
 targetStage=stageIndex,targetCursor=cursor+1,
 markSolved=true,forceRemoteOnReject=true
){
 if(!session)return {accepted:true};
 if(b && markSolved){state.solved[b.id]=true;rememberResponse(b,eventType,eventData)}
 const targetStageId=data.stages[targetStage]?.id;
 if(targetStageId && !state.visitedStageIds.includes(targetStageId))state.visitedStageIds.push(targetStageId);
 const payload={
   stageIndex:targetStage,
   cursor:targetCursor,
   progressStep:Number(state.progressStep||0)+1,
   seenBlockIds:state.seenBlockIds,
   visitedStageIds:state.visitedStageIds,
   lastChoice:state.lastChoice,
   choices:state.choices,
   solved:state.solved,
   responses:state.responses,
   quizAnswers:state.quizAnswers
 };
 const {data:result,error}=await rpc('save_game_progress',{
   p_session_token:session.session_token,
   p_stage_id:data.stages[targetStage].id,
   p_block_id:b?.id||null,
   p_event_type:eventType,
   p_data:eventData,
   p_state:payload,
   p_device_token:deviceToken
 });
 if(error)throw error;
 session.revision=result?.revision??session.revision??0;
 if(result?.state){
   state.lastChoice=result.state.lastChoice??state.lastChoice;
   state.choices=result.state.choices||state.choices;
   state.solved=result.state.solved||state.solved;
   state.responses=result.state.responses||state.responses;
   state.quizAnswers=result.state.quizAnswers||state.quizAnswers;
   state.progressStep=Number(result.state.progressStep??state.progressStep??0);
   state.seenBlockIds=result.state.seenBlockIds||state.seenBlockIds;
   state.visitedStageIds=result.state.visitedStageIds||state.visitedStageIds;
 }
 localStorage.setItem(SESSION_KEY,JSON.stringify({token:session.session_token,code:session.code||''}));
 if(result?.accepted===false && forceRemoteOnReject)setTimeout(()=>applyRemoteProgress(true),0);
 return result||{accepted:true};
}
async function uploadPhotoEvidence(file,b){
 const form=new FormData();
 form.append('session_token',session.session_token);
 form.append('device_token',deviceToken);
 form.append('stage_id',data.stages[stageIndex].id);
 form.append('block_id',b.id);
 form.append('file',file,file.name||'photo');
 const res=await fetch(`${SUPABASE_URL}/functions/v1/upload-game-evidence`,{
   method:'POST',
   headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`},
   body:form
 });
 let body=null;const txt=await res.text();
 if(txt){try{body=JSON.parse(txt)}catch{body={message:txt}}}
 if(!res.ok||!body?.ok)throw new Error(body?.message||body?.error||`HTTP ${res.status}`);
 return body;
}
function gpsErrorMessage(err){
 if(!window.isSecureContext)return 'GPS v telefonu vyžaduje zabezpečenou HTTPS adresu.';
 if(err?.code===1)return 'Přístup k poloze nebyl povolen.';
 if(err?.code===2)return 'Polohu se nepodařilo zjistit. Zkuste to znovu venku.';
 if(err?.code===3)return 'Zjištění polohy trvalo příliš dlouho. Zkuste to znovu.';
 return 'Polohu se nepodařilo zjistit.';
}
const esc=(s='')=>String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const norm=s=>(s||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const cleanText=v=>(v??'').toString().replace(/\\n/g,'\n');
const main=c=>cleanText(c?.text??c?.prompt??'');
const interactive=t=>['text_answer','multi_term_answer','choice','quiz','sorting','gps','gps_confirmation','photo','confirm'].includes(t);
async function getEvidenceSignedUrl(evidenceId){
 if(!session?.session_token)throw new Error('Session není aktivní.');
 const res=await fetch(`${SUPABASE_URL}/functions/v1/get-game-evidence-url`,{
   method:'POST',
   headers:{
     'apikey':SUPABASE_KEY,
     'Authorization':`Bearer ${SUPABASE_KEY}`,
     'Content-Type':'application/json'
   },
   body:JSON.stringify({
     session_token:session.session_token,
     device_token:deviceToken,
     evidence_id:evidenceId
   })
 });
 const txt=await res.text();
 let body=null;try{body=txt?JSON.parse(txt):null}catch{body={message:txt}}
 if(!res.ok||!body?.ok)throw new Error(body?.message||body?.error||`HTTP ${res.status}`);
 return body;
}

async function resetRemoteProgress(){
 if(!session?.session_token)throw new Error('Session není aktivní.');
 const {data:result,error}=await rpc('reset_game_progress',{
   p_session_token:session.session_token,
   p_device_token:deviceToken
 });
 if(error)throw error;
 return result;
}
