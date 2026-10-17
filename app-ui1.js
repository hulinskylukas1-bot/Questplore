function shell(){
 const stages=data.stages||[], st=stages[stageIndex], title=data.translation?.title||data.game?.name||'Spiknutí';
 root.innerHTML=`<div class="shell"><div class="top"><div class="brand">QUESTPLORE</div><div class="topActions"><div class="progress">${stageIndex+1} / ${stages.length}</div><button id="archiveBtn" class="archiveBtn" type="button">Archiv</button><button id="exitGame" class="exitGameBtn" type="button">Ukončit hru</button></div></div>
 <section class="case"><div class="casehead"><h1>${esc(title)}</h1></div>
 <div id="feed" class="feed chat"></div><div id="continueBar" class="continuebar hidden"><button id="continueBtn" class="btn">Pokračovat</button></div></section></div>`;
 document.getElementById('continueBtn').onclick=advance;
 const archiveBtn=document.getElementById('archiveBtn');
 if(archiveBtn)archiveBtn.onclick=openArchive;
 const exitBtn=document.getElementById('exitGame');
 if(exitBtn)exitBtn.onclick=exitGame;
}

function hintHTML(b){
 const cfg=b.config||{},c=b.content||{};
 const hints=Array.isArray(cfg.hints)?cfg.hints:(Array.isArray(c.hints)?c.hints:[]);
 if(!hints.length)return '';
 return `<div class="hintbox" data-count="0"><button class="btn secondary hintBtn">Nápověda</button><div class="hintList"></div></div>`;
}
function sortItemParts(item,i){
 if(typeof item==='string')return {id:item,label:item,detail:''};
 return {id:String(item?.id??item?.value??item?.label??`item-${i+1}`),label:String(item?.label??item?.text??item?.id??''),detail:String(item?.detail??'')};
}
function sortingRows(items,layout='list'){
 return `<div class="sortList sort-${esc(layout)}">${items.map((item,i)=>{const p=sortItemParts(item,i);return `<div class="sortRow" data-value="${esc(p.id)}"><span class="sortHandle">☰</span><span class="sortText"><strong>${esc(p.label)}</strong>${p.detail?`<small>${esc(p.detail)}</small>`:''}</span><span class="sortMoves"><button type="button" class="sortUp" aria-label="Posunout nahoru">↑</button><button type="button" class="sortDown" aria-label="Posunout dolů">↓</button></span></div>`}).join('')}</div>`;
}
function logicGridHTML(cfg){
 const rows=Array.isArray(cfg.rows)?cfg.rows:[],cols=Array.isArray(cfg.columns)?cfg.columns:[];
 if(!rows.length||!cols.length)return '<div class="placeholder">Logická tabulka zatím není nastavená.</div>';
 return `<div class="logicGridWrap"><table class="logicGrid"><thead><tr><th></th>${cols.map(c=>`<th>${esc(c.label||c.key||'')}</th>`).join('')}</tr></thead><tbody>${rows.map((row,ri)=>`<tr data-row="${esc(row)}"><th>${esc(row)}</th>${cols.map((col,ci)=>`<td><select class="logicSelect" data-row="${esc(row)}" data-key="${esc(col.key||ci)}"><option value="">— vyberte —</option>${(col.options||[]).map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function blockHTML(b){
 const c=b.content||{},cfg=b.config||{},t=b.block_type,txt=main(c);
 if(t==='conditional_message'||t==='narrator_message') return `<div class="bubble narrator"><div class="text">${esc(txt)}</div></div>`;
 if(t==='instruction') return `<div class="bubble instruction"><div class="text">${esc(txt)}</div></div>`;
 if(t==='document') return `<div class="bubble"><div class="doc text">${esc(txt)}</div>${cfg.url?`<a class="docLink" href="${esc(cfg.url)}" target="_blank" rel="noopener">Otevřít dokument</a>`:''}</div>`;
 if(t==='image') return `<div class="bubble">${cfg.url||(/^https?:/.test(cfg.storage_path||'')?cfg.storage_path:'')?`<img src="${esc(cfg.url||cfg.storage_path)}" class="media">`:`<div class="placeholder">Obrázek zatím není nahraný.</div>`}</div>`;
 if(t==='confirm') return `<div class="bubble task" data-id="${b.id}"><div class="text">${esc(txt)}</div><button class="btn confirmbtn">${esc(cfg.button_label||'Pokračovat')}</button>${hintHTML(b)}</div>`;
 if(t==='text_answer'||t==='multi_term_answer'){
   const placeholder=c.placeholder||cfg.placeholder||'Napište odpověď';
   return `<div class="bubble task" data-id="${b.id}"><div class="text">${esc(txt)}</div><div class="answer"><input placeholder="${esc(placeholder)}" autocomplete="off" inputmode="${cfg.input_mode==='numeric'?'numeric':'text'}"><button class="btn check">Potvrdit</button></div><div class="result muted"></div>${hintHTML(b)}</div>`;
 }
 if(t==='choice') {
   const opts=Array.isArray(cfg.options)?cfg.options:[];
   return `<div class="bubble task" data-id="${b.id}"><div class="text">${esc(txt)}</div><div class="choices">${opts.map((o,i)=>{let v=typeof o==='string'?o:(o.id??o.value??o.text??o.label??i),lab=typeof o==='string'?o:(o.text??o.label??String(v));return `<button class="btn secondary choice" data-value="${esc(v)}">${esc(lab)}</button>`}).join('')}</div><div class="result muted"></div>${hintHTML(b)}</div>`;
 }
 if(t==='quiz'){
   const qs=Array.isArray(cfg.questions)?cfg.questions:[];
   if(qs.length) return `<div class="bubble task quizbox" data-id="${b.id}"><div class="quizQuestions">${qs.map((q,qi)=>`<div class="quizq" data-q="${qi}"><div class="text"><b>${qi+1}.</b> ${esc(q.question||'')}</div><div class="choices">${(q.options||[]).map((o,oi)=>`<button class="btn secondary quizopt" data-q="${qi}" data-i="${oi}">${esc(o)}</button>`).join('')}</div><div class="result muted"></div></div>`).join('')}</div>${hintHTML(b)}</div>`;
   const opts=Array.isArray(cfg.options)?cfg.options:[];
   return `<div class="bubble task" data-id="${b.id}"><div class="text">${esc(txt)}</div><div class="choices">${opts.map((o,i)=>`<button class="btn secondary choice" data-value="${i}">${esc(typeof o==='string'?o:(o.label??o.text??i))}</button>`).join('')}</div><div class="result muted"></div>${hintHTML(b)}</div>`;
 }
 if(t==='gps'||t==='gps_confirmation') return `<div class="bubble gps" data-id="${b.id}"><div class="text">${esc(txt)}</div><button class="btn gpsbtn">JSME TU</button><div class="result muted"></div>${hintHTML(b)}</div>`;
 if(t==='photo') return `<div class="bubble photo" data-id="${b.id}"><div class="text">${esc(txt)}</div><label class="btn secondary photoPick">Vyfotit / vybrat fotografii<input class="photoInput" type="file" accept="image/*,.heic,.heif" capture="environment" hidden></label><div class="photoPreview"></div><div class="result muted"></div>${hintHTML(b)}</div>`;
 if(t==='sorting'){
   const items=Array.isArray(cfg.items)?cfg.items:[];
   const pending=!Array.isArray(cfg.correct_order)||!cfg.correct_order.length;
   return `<div class="bubble task sorting" data-id="${b.id}"><div class="text">${esc(txt)}</div>${sortingRows(items,cfg.layout||'list')}<div class="sortingNote muted">${pending?'Správné pořadí zatím není v administraci potvrzené. Pro test lze pořadí uložit a pokračovat.':'Seřaďte položky a ověřte pořadí.'}</div><button class="btn sortCheck">${pending?'Uložit pořadí a pokračovat':'Ověřit pořadí'}</button><div class="result muted"></div>${hintHTML(b)}</div>`;
 }
 if(t==='logic_grid'){
   return `<div class="bubble task logic-grid-task" data-id="${b.id}"><div class="text">${esc(txt)}</div>${logicGridHTML(cfg)}<button class="btn logicCheck">Ověřit tabulku</button><div class="result muted"></div>${hintHTML(b)}</div>`;
 }
 return `<div class="bubble"><div class="text">${esc(txt)}</div></div>`;
}
function appendBlock(b){
 if(!state.seenBlockIds.includes(b.id))state.seenBlockIds.push(b.id);
 const feed=document.getElementById('feed');
 const st=data.stages?.[stageIndex];
 if(st?.internal_name?.toLowerCase().includes('nádvoří') && !document.getElementById('courtyardDiagram')){
   const existing=feed.querySelectorAll('.reveal').length;
   if(existing>=1){
     const img=document.createElement('div');
     img.id='courtyardDiagram'; img.className='reveal shown';
     img.innerHTML=`<div class="bubble"><img src="./nadvorni-start.svg?v=071" class="media courtyard-media" alt="Schéma začátku hlavolamu na nádvoří"></div>`;
     feed.appendChild(img);
   }
 }
 const wrap=document.createElement('div');
 wrap.className='reveal'; wrap.innerHTML=blockHTML(b); feed.appendChild(wrap);
 requestAnimationFrame(()=>wrap.classList.add('shown'));
 bindBlock(wrap,b);
 setTimeout(()=>wrap.scrollIntoView({behavior:'smooth',block:'end'}),80);
}

function unlock(){
 waiting=false; cursor++; setTimeout(revealUntilStop,300);
}
function bindBlock(w,b){
 const cfg=b.config||{};
 const hintBtn=w.querySelector('.hintBtn');
 if(hintBtn) hintBtn.onclick=async()=>{
   const hints=Array.isArray(cfg.hints)?cfg.hints:(Array.isArray(b.content?.hints)?b.content.hints:[]);
   const box=w.querySelector('.hintbox'),list=w.querySelector('.hintList');
   let count=Number(box?.dataset.count||0);
   if(count>=hints.length)return;
   const h=hints[count],txt=typeof h==='string'?h:(h.text||h.content||'');
   const el=document.createElement('div');el.className='hintItem';el.textContent=txt;list.appendChild(el);
   count++;box.dataset.count=String(count);
   hintBtn.textContent=count<hints.length?`Další nápověda (${count}/${hints.length})`:'Nápovědy vyčerpány';
   if(count>=hints.length)hintBtn.disabled=true;
   try{await persistProgress(b,'hint_used',{hint_index:count-1},stageIndex,cursor,false,false)}catch{}
 };
 const check=w.querySelector('.check');
 if(check) check.onclick=()=>{
   const val=w.querySelector('input').value, answers=cfg.answers||cfg.accepted_answers||[];
   const terms=cfg.required_terms||[];
   const nv=norm(val);
   const termsOk=terms.length && requiredTermsMatch(terms,val);
   const ok=termsOk || !answers.length || answers.some(a=>phraseMatch(a,val));
   const r=w.querySelector('.result'); r.textContent=ok?'Správně.':'To není ono. Hledejte dál.';
   if(ok){w.classList.add('solved');w.querySelector('input').disabled=true;check.disabled=true;persistProgress(b,'answer_correct',{answer:val}).then(r=>{if(r.accepted!==false)unlock()}).catch(()=>{r.textContent='Nepodařilo se uložit postup. Zkuste to znovu.';check.disabled=false;w.querySelector('input').disabled=false;});}
   else {w.classList.add('bad');setTimeout(()=>w.classList.remove('bad'),250)}
 };
 w.querySelectorAll('.choice').forEach(btn=>btn.onclick=()=>{
   w.querySelectorAll('.choice').forEach(x=>x.disabled=true);
   btn.classList.add('selected');
   state.lastChoice=btn.dataset.value; state.choices[b.id]=btn.dataset.value;
   const branch=cfg.branches?.[btn.dataset.value];
   if(branch?.response){
     const feed=document.getElementById('feed'),r=document.createElement('div');r.className='reveal shown';
     r.innerHTML=`<div class="bubble narrator"><div class="text">${esc(branch.response)}</div></div>`;
     feed.appendChild(r);
   }
   persistProgress(b,'choice',{value:btn.dataset.value}).then(r=>{if(r.accepted!==false)unlock()}).catch(()=>{w.querySelectorAll('.choice').forEach(x=>x.disabled=false)});
 });
 const confirm=w.querySelector('.confirmbtn');
 if(confirm) confirm.onclick=()=>{confirm.disabled=true;w.classList.add('solved');persistProgress(b,'confirm',{}).then(r=>{if(r.accepted!==false)unlock()});};
 const quizQs=w.querySelectorAll('.quizq');
 if(quizQs.length){
   const solved=new Set();
   const restoreQuestion=(qi,oi)=>{
     const box=w.querySelector(`.quizq[data-q="${qi}"]`); if(!box)return;
     const btn=box.querySelector(`.quizopt[data-i="${oi}"]`);
     box.querySelectorAll('.quizopt').forEach(x=>x.disabled=true);
     if(btn)btn.classList.add('selected');
     const r=box.querySelector('.result'); if(r)r.textContent='Správně.';
     solved.add(Number(qi));
   };
   Object.entries(state.quizAnswers||{}).forEach(([key,oi])=>{
     const prefix=`${b.id}:`;
     if(key.startsWith(prefix))restoreQuestion(Number(key.slice(prefix.length)),Number(oi));
   });
   if(solved.size===cfg.questions.length){w.classList.add('solved')}

   w.querySelectorAll('.quizopt').forEach(btn=>btn.onclick=async()=>{
     const qi=Number(btn.dataset.q), oi=Number(btn.dataset.i), q=cfg.questions[qi], box=btn.closest('.quizq'), r=box.querySelector('.result');
     if(solved.has(qi))return;
     if(oi===Number(q.correct_index)){
       r.textContent='Správně.';
       solved.add(qi);
       state.quizAnswers[`${b.id}:${qi}`]=oi;
       box.querySelectorAll('.quizopt').forEach(x=>x.disabled=true);
       btn.classList.add('selected');
       try{
         await persistProgress(
           b,'quiz_question_correct',{question_index:qi,answer_index:oi},
           stageIndex,cursor,false,false
         );
         if(solved.size===cfg.questions.length){
           w.classList.add('solved');
           const answers={};
           for(const key of Object.keys(state.quizAnswers||{})){
             const prefix=`${b.id}:`;
             if(key.startsWith(prefix))answers[key.slice(prefix.length)]=state.quizAnswers[key];
           }
           const result=await persistProgress(
             b,'quiz_complete',{answers},
             stageIndex,cursor+1,true,true
           );
           if(result.accepted!==false)setTimeout(unlock,250);
         }
       }catch(e){
         r.textContent='Nepodařilo se uložit odpověď. Zkuste to znovu.';
         solved.delete(qi);
         delete state.quizAnswers[`${b.id}:${qi}`];
         box.querySelectorAll('.quizopt').forEach(x=>x.disabled=false);
         btn.classList.remove('selected');
       }
     }else{
       r.textContent='To není správně. Zkuste to znovu.';
       btn.classList.add('bad');
       setTimeout(()=>btn.classList.remove('bad'),300);
     }
   });
 }
 const gps=w.querySelector('.gpsbtn');
 if(gps) gps.onclick=()=>{
   const r=w.querySelector('.result');
   if(!window.isSecureContext){r.textContent='GPS v telefonu vyžaduje HTTPS. Použij online testovací adresu Playeru v0.6.';return}
   if(!navigator.geolocation){r.textContent='Tento prohlížeč neumí zjistit polohu.';return}
   gps.disabled=true;r.textContent='Ověřuji polohu…';
   navigator.geolocation.getCurrentPosition(async pos=>{
     try{
       const currentLat=pos.coords.latitude,currentLng=pos.coords.longitude,accuracy=Math.round(pos.coords.accuracy||0);
       const lat=cfg.latitude??cfg.lat,lng=cfg.longitude??cfg.lng,rad=Number(cfg.radius_m??cfg.radius??50);
       const base={latitude:currentLat,longitude:currentLng,accuracy_m:accuracy,captured_at:new Date().toISOString()};
       if(lat==null||lng==null){
         r.textContent=`Poloha zaznamenána (přesnost cca ${accuracy} m). Cílové souřadnice zatím nejsou nastavené.`;
         const ev={...base,validated:false,validation:'pending_coordinates',target_latitude:null,target_longitude:null,radius_m:rad};
         const result=await persistProgress(b,'gps_confirmed',ev);
         if(result.accepted!==false)unlock();
         return;
       }
       const R=6371000,p1=currentLat*Math.PI/180,p2=Number(lat)*Math.PI/180,
         dp=(Number(lat)-currentLat)*Math.PI/180,dl=(Number(lng)-currentLng)*Math.PI/180,
         a=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2,
         d=2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
       if(d<=rad){
         const ev={...base,validated:true,distance_m:Math.round(d),target_latitude:Number(lat),target_longitude:Number(lng),radius_m:rad};
         r.textContent=`Jsme na místě. Vzdálenost přibližně ${Math.round(d)} m.`;
         const result=await persistProgress(b,'gps_confirmed',ev);
         if(result.accepted!==false)unlock();
       }else{
         r.textContent=`To není ono. Hledejte dál. Jste přibližně ${Math.round(d)} m od cíle.`;
         gps.disabled=false;
       }
     }catch(e){r.textContent='Poloha byla zjištěna, ale nepodařilo se uložit důkaz. Zkuste to znovu.';gps.disabled=false}
   },err=>{r.textContent=gpsErrorMessage(err);gps.disabled=false},{enableHighAccuracy:true,timeout:15000,maximumAge:0});
 };
 const photo=w.querySelector('.photoInput');
 if(photo) photo.onchange=async()=>{
   const file=photo.files?.[0];if(!file)return;
   const r=w.querySelector('.result'),label=w.querySelector('.photoPick'),preview=w.querySelector('.photoPreview');
   if(file.size>15*1024*1024){r.textContent='Fotografie je příliš velká. Maximum je 15 MB.';photo.value='';return}
   if(preview && file.type.startsWith('image/')){
     try{const u=URL.createObjectURL(file);preview.innerHTML=`<img class="media photo-thumb" src="${u}" alt="Vybraná fotografie">`}catch{}
   }
   label.classList.add('disabled');r.textContent='Nahrávám fotografii…';
   try{
     const uploaded=await uploadPhotoEvidence(file,b);
     const ev={evidence_id:uploaded.evidence_id,storage_path:uploaded.storage_path,file_name:uploaded.file_name,size_bytes:file.size,mime_type:file.type||null};
     r.textContent='Fotografie byla bezpečně uložena.';
     const result=await persistProgress(b,'photo_uploaded',ev);
     if(result.accepted!==false)unlock();
   }catch(e){
     r.textContent=`Fotografii se nepodařilo uložit. ${e.message||''}`.trim();
     label.classList.remove('disabled');photo.value='';
   }
 };
 const sortList=w.querySelector('.sortList'),sortCheck=w.querySelector('.sortCheck');
 if(sortList&&sortCheck){
   const rows=()=>[...sortList.querySelectorAll('.sortRow')];
   const move=(row,dir)=>{
     if(dir<0&&row.previousElementSibling)sortList.insertBefore(row,row.previousElementSibling);
     if(dir>0&&row.nextElementSibling)sortList.insertBefore(row.nextElementSibling,row);
   };
   sortList.querySelectorAll('.sortUp').forEach(btn=>btn.onclick=()=>move(btn.closest('.sortRow'),-1));
   sortList.querySelectorAll('.sortDown').forEach(btn=>btn.onclick=()=>move(btn.closest('.sortRow'),1));
   sortCheck.onclick=async()=>{
     const order=rows().map(r=>r.dataset.value);
     const correct=Array.isArray(cfg.correct_order)?cfg.correct_order:null;
     const resultBox=w.querySelector('.result');
     if(correct&&correct.length){
       const ok=order.length===correct.length&&order.every((x,i)=>norm(x)===norm(correct[i]));
       if(!ok){resultBox.textContent='Pořadí zatím není správně. Zkuste to znovu.';w.classList.add('bad');setTimeout(()=>w.classList.remove('bad'),250);return}
       resultBox.textContent=cfg.success_text||'Správně.';
       sortCheck.disabled=true;w.classList.add('solved');
       const saved=await persistProgress(b,'sorting_complete',{order});
       if(saved.accepted!==false)unlock();
     }else{
       resultBox.textContent='Pořadí bylo uloženo pro test. Finální správné pořadí ještě není potvrzené.';
       sortCheck.disabled=true;w.classList.add('solved');
       const saved=await persistProgress(b,'sorting_draft_complete',{order,pending_validation:true});
       if(saved.accepted!==false)unlock();
     }
   };
 }
 const logicCheck=w.querySelector('.logicCheck');
 if(logicCheck){
   logicCheck.onclick=async()=>{
     const values={};
     w.querySelectorAll('.logicSelect').forEach(sel=>{
       const row=sel.dataset.row,key=sel.dataset.key;
       if(!values[row])values[row]={};
       values[row][key]=sel.value;
     });
     const correct=cfg.correct||{};
     const rows=Array.isArray(cfg.rows)?cfg.rows:[];
     const cols=Array.isArray(cfg.columns)?cfg.columns:[];
     const complete=rows.every(row=>cols.every(col=>values[row]?.[col.key]));
     const ok=complete&&rows.every(row=>cols.every(col=>norm(values[row]?.[col.key])===norm(correct[row]?.[col.key])));
     const resultBox=w.querySelector('.result');
     if(!ok){
       resultBox.textContent=complete?'Tabulka zatím není správně. Zkuste to znovu.':'Doplňte celou tabulku.';
       if(complete){w.classList.add('bad');setTimeout(()=>w.classList.remove('bad'),250)}
       return;
     }
     resultBox.textContent=cfg.success_text||'Správně.';
     w.querySelectorAll('.logicSelect').forEach(x=>x.disabled=true);
     logicCheck.disabled=true;w.classList.add('solved');
     state.responses[b.id]={kind:'logic_grid',value:values};
     const saved=await persistProgress(b,'logic_grid_complete',{values});
     if(saved.accepted!==false)unlock();
   };
 }
}