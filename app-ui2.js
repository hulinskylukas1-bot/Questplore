function markSolvedUI(w,b){
 const resp=state.responses?.[b.id],cfg=b.config||{};
 w.classList.add('solved');
 const input=w.querySelector('input');
 if(input){
   if(resp?.kind==='text')input.value=resp.value||'';
   input.disabled=true;
 }
 w.querySelectorAll('button').forEach(x=>x.disabled=true);
 if(resp?.kind==='choice'){
   w.querySelectorAll('.choice').forEach(btn=>{if(String(btn.dataset.value)===String(resp.value))btn.classList.add('selected')});
 }
 if(b.block_type==='quiz'){
   Object.entries(state.quizAnswers||{}).forEach(([key,oi])=>{
     const prefix=`${b.id}:`;
     if(!key.startsWith(prefix))return;
     const qi=Number(key.slice(prefix.length));
     const box=w.querySelector(`.quizq[data-q="${qi}"]`);
     if(!box)return;
     box.querySelectorAll('.quizopt').forEach(x=>x.disabled=true);
     const btn=box.querySelector(`.quizopt[data-i="${Number(oi)}"]`);
     if(btn)btn.classList.add('selected');
     const rr=box.querySelector('.result'); if(rr)rr.textContent='Správně.';
   });
 }
 if(resp?.kind==='text'){
   const r=w.querySelector('.result'); if(r)r.textContent='Správně.';
 }
 if(resp?.kind==='confirm'){
   const r=w.querySelector('.result'); if(r)r.textContent='';
 }
 if(resp?.kind==='photo'){
   const r=w.querySelector('.result'); if(r)r.textContent=`Fotografie uložena${resp.value?.file_name?`: ${resp.value.file_name}`:''}.`;
 }
 if(resp?.kind==='gps'){
   const r=w.querySelector('.result'); if(r)r.textContent=resp.value?.validated===false?'Poloha zaznamenána; cílové souřadnice ještě nejsou nastavené.':'Poloha potvrzena.';
 }
 if(resp?.kind==='sorting'){
   const order=Array.isArray(resp.value)?resp.value:[];
   const list=w.querySelector('.sortList');
   if(list&&order.length){
     const byId=new Map([...list.querySelectorAll('.sortRow')].map(row=>[String(row.dataset.value),row]));
     for(const id of order){const row=byId.get(String(id));if(row)list.appendChild(row)}
   }
   const r=w.querySelector('.result');if(r)r.textContent=cfg.success_text||'Správně.';
 }
 if(resp?.kind==='logic_grid'){
   const vals=resp.value||{};
   w.querySelectorAll('.logicSelect').forEach(sel=>{sel.value=vals?.[sel.dataset.row]?.[sel.dataset.key]??'';sel.disabled=true});
   const r=w.querySelector('.result');if(r)r.textContent=cfg.success_text||'Správně.';
 }
}
function renderSavedUntil(target){
 const blocks=data.stages[stageIndex].blocks||[];
 cursor=0;
 while(cursor<target&&cursor<blocks.length){
   const b=blocks[cursor];
   if(b.block_type==='conditional_message'){
     const required=b.config?.when?.choice;
     if(required&&norm(required)!==norm(state.lastChoice)){cursor++;continue}
   }
   appendBlock(b);
   const last=document.querySelector('#feed .reveal:last-child');
   if((interactive(b.block_type)||b.block_type==='logic_grid')&&state.solved?.[b.id])markSolvedUI(last,b);
   cursor++;
 }
}
function conditionMatches(condition={}){
 if(!condition || Object.keys(condition).length===0)return true;
 const ch=condition.choice;
 if(ch){
   const actual=state.choices?.[ch.block_id];
   if(Array.isArray(ch.one_of))return ch.one_of.some(v=>norm(v)===norm(actual));
   if(Object.prototype.hasOwnProperty.call(ch,'equals'))return norm(actual)===norm(ch.equals);
   if(Object.prototype.hasOwnProperty.call(ch,'not_equals'))return norm(actual)!==norm(ch.not_equals);
 }
 return false;
}
function outgoingTransitions(stageId){
 return (data.transitions||[])
   .filter(t=>t.from_stage_id===stageId)
   .sort((a,b)=>{
     const ap=Number(a.priority||0),bp=Number(b.priority||0);
     if(bp!==ap)return bp-ap;
     const ac=a.condition&&Object.keys(a.condition).length?1:0;
     const bc=b.condition&&Object.keys(b.condition).length?1:0;
     return bc-ac;
   });
}
function resolveNextStageIndex(){
 const current=data.stages[stageIndex];
 if(!current)return -1;
 const outgoing=outgoingTransitions(current.id);
 for(const t of outgoing){
   if(!conditionMatches(t.condition||{}))continue;
   const idx=data.stages.findIndex(s=>s.id===t.to_stage_id);
   if(idx>=0)return idx;
 }
 return -1;
}
function historyStageIndexes(){
 const ids=Array.isArray(state.visitedStageIds)?state.visitedStageIds.filter(Boolean):[];
 if(ids.length>1){
   const arr=ids.map(id=>data.stages.findIndex(s=>s.id===id)).filter(i=>i>=0);
   if(arr.length)return arr;
 }
 return Array.from({length:stageIndex+1},(_,i)=>i);
}
function renderFullHistory(targetCursor){
 const originalStage=stageIndex;
 const path=historyStageIndexes();
 const feed=document.getElementById('feed');
 if(feed)feed.innerHTML='';
 for(const si of path){
   const stage=data.stages[si]; if(!stage)continue;
   const blocks=stage.blocks||[];
   const max=si===originalStage?Math.min(targetCursor,blocks.length):blocks.length;
   for(let bi=0;bi<max;bi++){
     const b=blocks[bi];
     if(b.block_type==='conditional_message'){
       const required=b.config?.when?.choice;
       if(required&&norm(required)!==norm(state.lastChoice))continue;
     }
     const savedStage=stageIndex; stageIndex=si;
     appendBlock(b);
     stageIndex=savedStage;
     const last=document.querySelector('#feed .reveal:last-child');
     if(interactive(b.block_type)||b.block_type==='logic_grid'){
       if(state.solved?.[b.id])markSolvedUI(last,b);
       else last?.querySelectorAll('button,input').forEach(x=>x.disabled=true);
     }
   }
 }
 stageIndex=originalStage;
 cursor=Math.max(0,targetCursor);
}
function revealUntilStop(){
 const st=data.stages[stageIndex], blocks=st.blocks||[];
 document.getElementById('continueBar').classList.add('hidden');
 while(cursor<blocks.length){
   const b=blocks[cursor];
   if(b.block_type==='conditional_message'){
     const required=b.config?.when?.choice;
     if(required && norm(required)!==norm(state.lastChoice)){ cursor++; continue; }
   }
   appendBlock(b); visible.push(b.id);
   if(interactive(b.block_type)||b.block_type==='logic_grid'){waiting=true;return}
   cursor++;
 }
 document.getElementById('continueBar').classList.remove('hidden');
 const nextStage=resolveNextStageIndex();
 document.getElementById('continueBtn').textContent=nextStage>=0?'Pokračovat':'Dokončit hru';
}
async function advance(){
 if(waiting)return;
 const nextStage=resolveNextStageIndex();
 if(nextStage>=0){
   try{
     await persistProgress(null,'stage_advance',{
       from_stage_id:data.stages[stageIndex].id,
       to_stage_id:data.stages[nextStage].id,
       from_stage_index:stageIndex,
       to_stage_index:nextStage
     },nextStage,0);
     stageIndex=nextStage;cursor=0;visible=[];waiting=false;
     document.querySelector('.progress').textContent=`${stageIndex+1} / ${data.stages.length}`;
     revealUntilStop();
   }catch(e){showSyncNotice('Nepodařilo se uložit přesun. Zkuste znovu.')}
 } else {
   alert('Konec hry.');
 }
}


function discoveredDocuments(){
 const seen=new Set(state.seenBlockIds||[]);
 const out=[];
 for(const stage of (data?.stages||[])){
   for(const b of (stage.blocks||[])){
     if(b.block_type==='document'&&seen.has(b.id)){
       const text=main(b.content||{});
       if(text)out.push({id:b.id,text});
     }
   }
 }
 return out;
}
function archiveEvidenceItems(){
 const photos=[],gps=[];
 for(const [blockId,resp] of Object.entries(state.responses||{})){
   if(resp?.kind==='photo'&&resp.value?.evidence_id)photos.push({blockId,...resp.value});
   if(resp?.kind==='gps')gps.push({blockId,...(resp.value||{})});
 }
 return {photos,gps};
}
function closeArchive(){
 const el=document.getElementById('archiveOverlay');
 if(el)el.remove();
}
async function openArchive(){
 closeArchive();
 const docs=discoveredDocuments(), ev=archiveEvidenceItems();
 const overlay=document.createElement('div');
 overlay.id='archiveOverlay'; overlay.className='archiveOverlay';
 overlay.innerHTML=`
   <div class="archivePanel" role="dialog" aria-modal="true" aria-label="Archiv důkazů">
     <div class="archiveHead">
       <div><div class="archiveKicker">QUESTPLORE</div><h2>Archiv</h2></div>
       <button class="archiveClose" type="button" aria-label="Zavřít archiv">×</button>
     </div>
     <div class="archiveTabs">
       <button class="archiveTab active" data-tab="docs">Dokumenty <span>${docs.length}</span></button>
       <button class="archiveTab" data-tab="evidence">Důkazy <span>${ev.photos.length+ev.gps.length}</span></button>
     </div>
     <div class="archiveBody">
       <div class="archiveSection" data-section="docs">
         ${docs.length?docs.map((d,i)=>`<article class="archiveCard documentCard"><div class="archiveCardLabel">Dokument ${i+1}</div><div class="archiveDocText">${esc(d.text)}</div></article>`).join(''):`<div class="archiveEmpty">Zatím jste neobjevili žádný dokument.</div>`}
       </div>
       <div class="archiveSection hidden" data-section="evidence">
         ${ev.photos.map((p,i)=>`<article class="archiveCard evidenceCard photoEvidence" data-evidence-id="${esc(p.evidence_id)}"><div class="archiveCardLabel">Fotodůkaz ${i+1}</div><button class="btn secondary viewEvidence" type="button">Zobrazit fotografii</button><div class="evidenceMedia"></div></article>`).join('')}
         ${ev.gps.map((g,i)=>`<article class="archiveCard evidenceCard"><div class="archiveCardLabel">Poloha ${i+1}</div><div class="archiveEvidenceText">${g.validated===true?'Poloha byla potvrzena.':'Poloha byla zaznamenána.'}${Number.isFinite(Number(g.accuracy_m))?` Přesnost cca ${Math.round(Number(g.accuracy_m))} m.`:''}</div></article>`).join('')}
         ${(!ev.photos.length&&!ev.gps.length)?`<div class="archiveEmpty">Zatím nemáte uložený žádný důkaz.</div>`:''}
       </div>
     </div>
   </div>`;
 document.body.appendChild(overlay);
 overlay.querySelector('.archiveClose').onclick=closeArchive;
 overlay.addEventListener('click',e=>{if(e.target===overlay)closeArchive()});
 overlay.querySelectorAll('.archiveTab').forEach(btn=>btn.onclick=()=>{
   overlay.querySelectorAll('.archiveTab').forEach(x=>x.classList.toggle('active',x===btn));
   overlay.querySelectorAll('.archiveSection').forEach(sec=>sec.classList.toggle('hidden',sec.dataset.section!==btn.dataset.tab));
 });
 overlay.querySelectorAll('.viewEvidence').forEach(btn=>btn.onclick=async()=>{
   const card=btn.closest('.photoEvidence'),box=card.querySelector('.evidenceMedia'),id=card.dataset.evidenceId;
   btn.disabled=true;btn.textContent='Načítám…';
   try{
     const signed=await getEvidenceSignedUrl(id);
     box.innerHTML=`<img class="archivePhoto" alt="Fotodůkaz" src="${esc(signed.signed_url)}">`;
     btn.textContent='Obnovit fotografii';
     btn.disabled=false;
   }catch(e){
     box.textContent='Fotografii se nepodařilo načíst.';
     btn.textContent='Zkusit znovu';btn.disabled=false;
   }
 });
}

async function applyRemoteProgress(force=false){
 if(!session||applyingRemote||!data)return;
 applyingRemote=true;
 try{
   const {data:remote,error}=await rpc('get_session_progress',{p_session_token:session.session_token});
   if(error||!remote)return;
   const rev=Number(remote.revision||0);
   if(!force&&rev<=Number(session.revision||0))return;

   session.revision=rev;
   const rs=remote.state||{};
   const remoteStage=Number.isInteger(rs.stageIndex)?rs.stageIndex:0;
   const remoteCursor=Number.isInteger(rs.cursor)?rs.cursor:0;

   state.lastChoice=rs.lastChoice??state.lastChoice;
   state.choices=rs.choices||state.choices;
   state.solved=rs.solved||state.solved;
   state.responses=rs.responses||state.responses;
   state.quizAnswers=rs.quizAnswers||state.quizAnswers;
   state.progressStep=Number(rs.progressStep??state.progressStep??0);
   state.seenBlockIds=rs.seenBlockIds||state.seenBlockIds;
   state.visitedStageIds=rs.visitedStageIds||state.visitedStageIds;

   stageIndex=Math.max(0,Math.min(remoteStage,data.stages.length-1));
   cursor=Math.max(0,remoteCursor);
   waiting=false;
   visible=[];

   shell();
   const target=cursor;
   renderFullHistory(target);

   const blocks=data.stages[stageIndex].blocks||[];
   if(cursor<blocks.length){
     const current=blocks[cursor];
     if(current?.block_type==='quiz'){
       appendBlock(current);
       waiting=true;
     }else{
       revealUntilStop();
     }
   }else{
     revealUntilStop();
   }

   showSyncNotice('Postup byl aktualizován z jiného zařízení.');
 } finally {applyingRemote=false}
}
function showSyncNotice(msg){
 let n=document.getElementById('syncNotice');
 if(!n){n=document.createElement('div');n.id='syncNotice';n.className='sync-notice';document.body.appendChild(n)}
 n.textContent=msg;n.classList.add('show');setTimeout(()=>n.classList.remove('show'),2200);
}
function setupSync(){
 if(syncTimer) clearInterval(syncTimer);
 showSyncNotice('Zařízení je synchronizované.');
 syncTimer=setInterval(()=>applyRemoteProgress(),900);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)applyRemoteProgress()},{passive:true});
}
function clearLocalSession(){
 closeArchive();
 if(syncTimer){clearInterval(syncTimer);syncTimer=null}
 localStorage.removeItem(SESSION_KEY);
 session=null; data=null; stageIndex=0; cursor=0; visible=[]; waiting=false;
 state.lastChoice=null; state.choices={}; state.solved={}; state.responses={}; state.quizAnswers={}; state.progressStep=0; state.seenBlockIds=[]; state.visitedStageIds=[];
 entry();
}
function closeExitMenu(){
 document.getElementById('exitOverlay')?.remove();
}
function exitGame(){
 closeExitMenu();
 const overlay=document.createElement('div');
 overlay.id='exitOverlay';overlay.className='archiveOverlay';
 overlay.innerHTML=`
   <div class="exitPanel" role="dialog" aria-modal="true" aria-label="Ukončit hru">
     <h2>Ukončit hru</h2>
     <p>Vyberte, co se má stát s rozehraným postupem.</p>
     <div class="exitChoices">
       <button id="saveAndLeave" class="btn secondary" type="button">Uložit hru pro možnost návratu</button>
       <button id="discardAndLeave" class="btn danger" type="button">Neukládat hru</button>
       <button id="cancelExit" class="btn ghost" type="button">Zrušit ukončení</button>
     </div>
   </div>`;
 document.body.appendChild(overlay);
 overlay.addEventListener('click',e=>{if(e.target===overlay)closeExitMenu()});
 document.getElementById('cancelExit').onclick=closeExitMenu;
 document.getElementById('saveAndLeave').onclick=()=>{
   closeExitMenu();
   clearLocalSession();
 };
 document.getElementById('discardAndLeave').onclick=async()=>{
   const btn=document.getElementById('discardAndLeave'); btn.disabled=true; btn.textContent='Mažu postup…';
   try{
     await resetRemoteProgress();
     closeExitMenu();
     clearLocalSession();
   }catch(e){
     btn.disabled=false;btn.textContent='Neukládat hru';
     const p=overlay.querySelector('p'); if(p)p.textContent='Postup se nepodařilo smazat. Zkuste to znovu.';
   }
 };
}
async function boot(code){
 root.innerHTML=`<div class="shell"><div class="top"><div class="brand">QUESTPLORE</div><button id="cancelLoad" class="exitGameBtn" type="button">Jiný kód</button></div><section class="case"><div class="casehead"><h1>Questplore</h1></div><div class="bubble">Načítám rozehranou hru…</div></section></div>`;
 const cancelLoad=document.getElementById('cancelLoad'); if(cancelLoad)cancelLoad.onclick=clearLocalSession;
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),15000);
 let payload;
 try{
   const res=await fetch(`${SUPABASE_URL}/functions/v1/start-player-session`,{
     method:'POST',
     headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json'},
     body:JSON.stringify({code,p_device_token:undefined,device_token:deviceToken}),
     signal:controller.signal
   });
   const txt=await res.text();
   try{payload=txt?JSON.parse(txt):null}catch{payload={message:txt}}
   if(!res.ok||!payload?.ok)throw new Error(payload?.error||payload?.message||`HTTP ${res.status}`);
 }catch(e){
   if(e?.name==='AbortError')throw new Error('START_TIMEOUT');
   throw e;
 }finally{clearTimeout(timer)}
 const ss=payload.session;
 session={...ss,code,revision:Number(ss.revision||0)}; localStorage.setItem(SESSION_KEY,JSON.stringify({token:ss.session_token,code}));
 data=payload.content; if(!data?.stages)throw new Error('GAME_CONTENT_UNAVAILABLE');
 const saved=ss.state||{}; if(Number.isInteger(saved.stageIndex))stageIndex=Math.max(0,Math.min(saved.stageIndex,data.stages.length-1)); if(Number.isInteger(saved.cursor))cursor=Math.max(0,saved.cursor);
 state.lastChoice=saved.lastChoice??null; state.choices=saved.choices||{}; state.solved=saved.solved||{}; state.responses=saved.responses||{}; state.quizAnswers=saved.quizAnswers||{};
 state.progressStep=Number(saved.progressStep||0); state.seenBlockIds=saved.seenBlockIds||[]; state.visitedStageIds=saved.visitedStageIds||[];
 const bootStageId=data.stages[stageIndex]?.id; if(bootStageId&&!state.visitedStageIds.includes(bootStageId))state.visitedStageIds.push(bootStageId);
 waiting=false; visible=[]; shell(); const target=cursor; renderFullHistory(target); revealUntilStop(); setupSync();
}
function entry(){
 root.innerHTML=`<div class="shell"><section class="case"><div class="casehead"><h1>Questplore</h1></div><div class="bubble task"><div class="text">Zadejte kód hry</div><div class="answer"><input id="gameCode" value="" placeholder="Kód hry" autocomplete="off" autocapitalize="characters"><button id="startGame" class="btn">Vstoupit do hry</button></div><div id="entryError" class="result muted"></div></div></section></div>`;
 document.getElementById('startGame').onclick=async()=>{
   const btn=document.getElementById('startGame'),err=document.getElementById('entryError');
   try{
     btn.disabled=true;btn.textContent='Načítám…';err.textContent='';
     await boot(document.getElementById('gameCode').value);
   }catch(e){
     entry();
     const box=document.getElementById('entryError');
     if(box)box.textContent=e.message.includes('INVALID_GAME_CODE')?'Neplatný kód hry.':e.message.includes('DEVICE_LIMIT_REACHED')?'Tato hra už je připojena na maximálním počtu zařízení.':e.message.includes('GAME_CONTENT_UNAVAILABLE')?'Obsah hry se nepodařilo načíst. Zkuste to znovu.':e.message.includes('START_TIMEOUT')?'Načítání trvalo příliš dlouho. Zkuste to znovu.':`Hru se nepodařilo otevřít: ${e.message}`;
   }
 };
}
async function startup(){
 try{
   const saved=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');
   if(saved?.code) await boot(saved.code); else entry();
 }catch(e){
   localStorage.removeItem(SESSION_KEY);
   entry();
   const box=document.getElementById('entryError');
   if(box)box.textContent=`Předchozí session se nepodařilo obnovit: ${e.message}`;
 }
}
startup();