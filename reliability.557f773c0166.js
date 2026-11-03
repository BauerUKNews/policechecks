import {minutesAgo} from './logic.23036191bb0d.js';
// Only the selected station's already-authorised history is held in memory.
let historyDays=1, historyKey='', historyRows=null, historyError=false, historyController=null;
function clearHistory(){historyController?.abort();historyController=null;historyKey='';historyRows=null;historyError=false;}
function chooseHistory(days){historyDays=days;clearHistory();renderBoard();}
function comparisonText(row){
 if(!row)return '';
 if(!current(row))return 'Last reading is out of date; it cannot raise a current alert.';
 if(!row.total)return 'No departures to compare in this reading.';
 if(row.usual_pct==null)return 'Learning this station’s usual pattern: '+(row.compare_days||0)+' of 3 comparable days available.';
 const normal='Usually '+percent(row.usual_pct)+' affected around this time ('+row.compare_days+' comparable days). ';
 return normal+({alert:'Alert: a sustained rise above usual.',watch:'Above usual; waiting for another check before alerting.',unavailable:'No exact affected count on this board; no alert.',normal:'No alert on this reading.'}[row.alert_state]||'');
}
const svgNS='http://www.w3.org/2000/svg';
function svgEl(name,attrs={},label){const element=document.createElementNS(svgNS,name);for(const [k,v] of Object.entries(attrs))element.setAttribute(k,v);if(label!=null)element.textContent=label;return element;}
function timeAxis(t,days){return new Date(t).toLocaleString('en-GB',days===1?{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'}:{timeZone:'Europe/London',day:'numeric',month:'short'});}
const statusBands = [
 {key:'on_time_pct', label:'Running normally', cls:'good'},
 {key:'delayed_pct', label:'Delayed', cls:'delayed'},
 {key:'cancelled_pct', label:'Cancelled', cls:'cancelled'},
 {key:'unsplit_pct', label:'Affected · split unknown', cls:'unsplit'}
];
function trainStatus(d) {
 const expected = String(d.etd || '').trim();
 if (/^cancelled$|^canceled$/i.test(expected)) return 'cancelled';
 if (!expected || /^(unknown|no report|not available)$/i.test(expected)) return '';
 if (d.bad === true || /^delayed$/i.test(expected)) return 'delayed';
 return /^(on time|early)$/i.test(expected) || (d.bad === false && /^\d\d:\d\d$/.test(expected)) ? 'good' : '';
}
function appendStationBreakdown(card, row) {
 const summary=text('p','','station-breakdown'), bar=text('div','','station-bar');
 bar.setAttribute('aria-hidden','true');
 if (row?.total > 0 && row.affected_pct != null) {
  const known=Number.isInteger(row.delayed) && Number.isInteger(row.cancelled);
  const values=known ? [(row.total-row.delayed-row.cancelled)*100/row.total,row.delayed*100/row.total,row.cancelled*100/row.total,null] :
                       [100-row.affected_pct,null,null,row.affected_pct];
  statusBands.forEach((band,i)=>{
   if (values[i] == null) return;
   const label=text('span',percent(values[i])+' '+band.label.toLowerCase(),'status-label '+band.cls);
   const segment=text('span','',band.cls);segment.style.width=values[i]+'%';
   summary.append(label);bar.append(segment);
  });
 }
 card.append(summary,bar);
}
function paintHistory(root,points) {
 const usable=points.filter(p=>p.on_time_pct!=null && Number.isFinite(Date.parse(p.point_at)));
 if (!usable.length) {root.append(text('p','No recorded departures in this period yet.','board-note'));return;}
 const hasUnknown=usable.some(p=>Number(p.unsplit_pct)>0);
 const bands=hasUnknown?statusBands:statusBands.slice(0,3);
 const hasUsual=usable.some(p=>p.usual_on_time_pct!=null);
 const legend=text('ul','','history-key');
 for(const band of bands) legend.append(text('li',band.label,'status-label '+band.cls));
 if(hasUsual) legend.append(text('li','Usual running normally','usual-line'));
 root.append(legend);

 const step=(historyDays===1?15:historyDays===7?60:240)*60000;
 const end=now(),start=end-historyDays*86400000;
 const L=36,R=468,T=14,B=144;
 const x=t=>L+Math.max(0,Math.min(1,(t-start)/(end-start)))*(R-L);
 const y=v=>B-Math.max(0,Math.min(100,v))*(B-T)/100;
 const svg=svgEl('svg',{viewBox:'0 0 480 171',role:'img','aria-label':'Stacked percentages of departures running normally, delayed and cancelled at '+selected+'. Exact figures follow the chart.'});
 for(const n of [0,25,50,75,100]) {
  svg.append(svgEl('line',{x1:L,x2:R,y1:y(n),y2:y(n),stroke:'#e6e2ea'}),svgEl('text',{x:L-5,y:y(n)+3,'text-anchor':'end',class:'axis-label'},n+'%'));
 }
 for(const [t,align] of [[start,'start'],[(start+end)/2,'middle'],[end,'end']])
  svg.append(svgEl('text',{x:x(t),y:162,'text-anchor':align,class:'axis-label'},timeAxis(t,historyDays)));

 // A bucket represents its recorded quarter, hour or four-hour period. Step edges and
 // unpainted gaps keep a missed period distinct from a measured zero.
 const paths=bands.map(()=>[]);
 const usual=[];
 let previousUsualEnd=null;
 for (const p of usable) {
  const t=Date.parse(p.point_at), left=x(t), right=x(t+step);
  if(right<=left) continue;
  let lower=0;
  bands.forEach((band,i)=>{
   const value=Number(p[band.key]);
   const a=y(lower); lower+=value;
   if(value>0) paths[i].push('M'+left+','+a+'V'+y(lower)+'H'+right+'V'+a+'Z');
  });
  if(p.usual_on_time_pct!=null) {
   usual.push((previousUsualEnd===t?'L':'M')+left+','+y(p.usual_on_time_pct)+'H'+right);
   previousUsualEnd=t+step;
  } else previousUsualEnd=null;
 }
 bands.forEach((band,i)=>{if(paths[i].length)svg.append(svgEl('path',{class:'area-'+band.cls,d:paths[i].join(' ')}));});
 if(usual.length) svg.append(svgEl('path',{d:usual.join(' '),fill:'none',stroke:'#253147','stroke-width':1.8,'stroke-dasharray':'4 3'}));
 const share=(p,band)=>p.split_readings===0 && (band.cls==='delayed'||band.cls==='cancelled')?'—':percent(p[band.key]);
 for(const p of usable) {
  const t=Date.parse(p.point_at),left=x(t),right=x(t+step);
  if(right<=left)continue;
  const hit=svgEl('rect',{x:left,y:T,width:right-left,height:B-T,fill:'transparent'});
  hit.append(svgEl('title',{},[dateLabel(t),...bands.map(band=>band.label+' '+share(p,band))].join(' · ')));svg.append(hit);
 }
 root.append(svg);
 const detail=text('details','','history-values');detail.append(text('summary','View chart figures'));
 const table=text('table','','history-table'), head=text('thead',''),header=text('tr','');
 for(const label of ['UK time',...bands.map(b=>b.label),...(hasUsual?['Usual normal']:[])]) {
  const th=text('th',label);th.scope='col';header.append(th);
 }
 head.append(header);table.append(head);
 const body=text('tbody','');
 for(const p of [...usable].reverse()) {
  const tr=text('tr','');
  const values=[dateLabel(p.point_at),...bands.map(band=>share(p,band))];
  if(hasUsual)values.push(p.usual_on_time_pct==null?'—':percent(p.usual_on_time_pct));
  values.forEach(value=>tr.append(text('td',value)));body.append(tr);
 }
 table.append(body);detail.append(table);root.append(detail);
 root.append(text('p',hasUnknown?'Grey shows affected departures where the delay and cancellation split was unavailable. Gaps mean no reading.':'Gaps mean no reading.','board-note'));
}
function renderHistory(root,row){
 const section=text('section','','station-history');section.setAttribute('aria-label','Station reliability history');root.append(section);
 section.append(text('h3','Reliability history'),text('p','Share of checked departures by status. Each recorded period adds up to 100%.','board-note'));
 const controls=text('div','','history-controls');for(const [d,label] of [[1,'24 hours'],[7,'7 days'],[28,'28 days']]){const btn=text('button',label);btn.type='button';btn.setAttribute('aria-pressed',String(d===historyDays));btn.onclick=()=>chooseHistory(d);controls.append(btn);}section.append(controls);
 const key=[selected,historyDays,row?.checked_at||'',epoch].join('|');
 if(historyKey!==key){clearHistory();historyKey=key;const ctrl=historyController=new AbortController(),ver=epoch;const station=selected;
  (async()=>{try{const reply=await bounded(client.rpc('desk_station_status_history',{station,lookback_days:historyDays}).abortSignal(ctrl.signal));
   if(historyKey!==key||ver!==epoch||!permitted()||ctrl.signal.aborted)return;if(reply.error||!Array.isArray(reply.data))throw new Error('No history response');historyRows=reply.data;
  }catch{if(historyKey!==key||ver!==epoch||!permitted()||ctrl.signal.aborted)return;historyError=true;}finally{if(historyKey===key&&ver===epoch&&permitted()&&!ctrl.signal.aborted){historyController=null;renderBoard();}}})();
 }
 if(historyError){const msg=text('p','History could not be loaded. ','board-note');const retry=text('button','Retry');retry.type='button';retry.onclick=()=>chooseHistory(historyDays);msg.append(retry);section.append(msg);}
 else if(historyRows===null)section.append(text('p','Loading recorded checks…','board-note'));
 else paintHistory(section,historyRows);
}

const $=id=>document.getElementById(id),config=window.POLICE_CONFIG;
const text=(tag,value,cls='')=>{const e=document.createElement(tag);e.textContent=value;e.className=cls;return e;};
let client,session=null,access=false,accessBusy=false,epoch=0,accessTimer,accessUntil=0,accessWall=0;
let catalogue=[],patches=[],rows=new Map(),selected=(new URLSearchParams(location.search).get('station')||'').toUpperCase(),loading=false,requestController=null,serverAt=0,serverClock=0;
const now=()=>serverAt?serverClock+(performance.now()-serverAt):Date.now();
const permitted=()=>access&&performance.now()<accessUntil&&Date.now()<accessWall;
const current=row=>row&&Number.isFinite(Date.parse(row.valid_until))&&Date.parse(row.valid_until)>now();
const dateLabel=value=>new Date(value).toLocaleString('en-GB',{timeZone:'Europe/London',dateStyle:'medium',timeStyle:'short'});
const percent=n=>Number(n).toLocaleString('en-GB',{maximumFractionDigits:1})+'%';
async function bounded(request){let timer;try{return await Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Connection timed out.')),10000);})]);}finally{clearTimeout(timer);}}
function clearData(){clearHistory();epoch++;access=false;rows.clear();requestController?.abort();requestController=null;loading=false;clearTimeout(accessTimer);$('dashboard').hidden=true;$('station-list').replaceChildren();$('departure-content').replaceChildren();for(const id of ['reporting-count','affected-count','load-status'])$(id).textContent='';}
function waiting(reason){$('auth').hidden=true;$('waiting').hidden=false;const labels={approval:['Awaiting approval','Owen needs to approve your account.'],verification:['Verify your email','Follow the email from Supabase Auth.'],paused:['Access paused','Owen has paused your account.'],outside_shift:['Outside your allowed hours','Come back during your approved shifts.'],blocked:['Access unavailable at this time','This period is blocked for your account.'],error:['Connection interrupted','Access could not be checked. Reconnecting automatically…'],check:['Checking access','Checking your account and allowed hours…']};const pair=labels[reason]||labels.approval;$('waiting-title').textContent=pair[0];$('waiting-detail').textContent=pair[1];}
async function checkAccess(){
 if(!session||accessBusy)return;accessBusy=true;const version=epoch,start=performance.now();
 try{const r=await bounded(client.rpc('desk_my_access'));if(version!==epoch)return;
  if(r.error||typeof r.data?.allowed!=='boolean')throw new Error('Access unavailable');
  if(!r.data.allowed){clearData();waiting(r.data.reason);return;}
  const duration=Math.max(0,Math.min(30000,Date.parse(r.data.check_at)-Date.parse(r.data.server_now)-(performance.now()-start)));
  if(!Number.isFinite(duration)||!duration)throw new Error('Access expired');
  const opening=!access;access=true;accessUntil=performance.now()+duration;accessWall=Date.now()+duration;
  serverClock=Date.parse(r.data.server_now);serverAt=performance.now();
  clearTimeout(accessTimer);accessTimer=setTimeout(()=>{clearData();waiting('check');checkAccess();},duration);
  $('auth').hidden=true;$('waiting').hidden=true;$('dashboard').hidden=false;
  if(opening){await prepare();if(version===epoch&&permitted())loadBoards();}
 }catch{if(version===epoch){clearData();waiting('error');}}finally{accessBusy=false;}
}
function onSession(next){const changed=session?.user.id!==next?.user.id;session=next;$('account').hidden=!next;$('email').textContent=next?.user.email||'';if(changed||!next)clearData();if(!next){$('waiting').hidden=true;$('auth').hidden=false;return;}checkAccess();}
async function prepare(){if(catalogue.length)return;const result=await Promise.all(['stations.json','patches.json'].map(async file=>{const r=await bounded(fetch('./'+file));if(!r.ok)throw new Error('Station list unavailable');return r.json();}));[catalogue,patches]=result;
 for(const p of [...patches].sort((a,b)=>a.name.localeCompare(b.name))){const option=text('option',p.name);option.value=p.id;$('patch-filter').append(option);}
 $('monitored-count').textContent=catalogue.length;render();
}
async function loadBoards(){if(!permitted()||loading)return;loading=true;$('refresh-boards').disabled=true;const version=epoch,controller=requestController=new AbortController();
 try{const r=await bounded(client.from('desk_station_dashboard').select('*').order('name').limit(1000).abortSignal(controller.signal));if(version!==epoch||!permitted()||controller!==requestController)return;if(r.error)throw r.error;
  const gate=await bounded(client.rpc('desk_my_access'));if(version!==epoch||!permitted())return;if(gate.error||gate.data?.allowed!==true){clearData();waiting(gate.data?.reason||'error');return;}
  rows=new Map((r.data||[]).map(row=>[row.id,row]));$('data-error').hidden=true;$('load-status').textContent=rows.size?'Latest saved readings loaded · this page refreshes every 30 seconds.':'Awaiting the new Mac’s first station-board upload.';render();
 }catch(e){if(version!==epoch)return;$('data-error').hidden=false;$('data-error').textContent='Could not refresh the station readings. '+(rows.size?'Showing the last readings with their check times.':'Install the latest update on the collecting Mac, then try Refresh.');render();}
 finally{if(controller===requestController){requestController=null;loading=false;$('refresh-boards').disabled=false;}}
}
function boardNote(row){return !row?'Awaiting new Mac':(current(row)?'Checked ':'Out of date · checked ')+minutesAgo(row.checked_at,now()).toLowerCase();}
function render(){if(!permitted())return;
 const available=catalogue.map(s=>rows.get(s.crs)).filter(current);
 $('reporting-count').textContent=available.length;$('affected-count').textContent=available.filter(r=>r.alert_state==='alert').length;
 const search=$('station-search').value.trim().toLowerCase(),patch=$('patch-filter').value;
 const stations=catalogue.filter(s=>(s.name+' '+s.crs).toLowerCase().includes(search)&&(!patch||(rows.get(s.crs)?.patch_ids||s.patch_ids||[]).includes(patch)));
 stations.sort((a,b)=>{if($('station-sort').value==='affected'){const ar=rows.get(a.crs),br=rows.get(b.crs);const av=current(ar)&&ar.total?Number(ar.affected_pct):-1,bv=current(br)&&br.total?Number(br.affected_pct):-1;if(av!==bv)return bv-av;}return a.name.localeCompare(b.name);});
 $('station-count').textContent=stations.length+' of '+catalogue.length+' stations';const list=$('station-list');list.replaceChildren();
 if(!stations.length)list.append(text('p','No stations match these filters.','muted'));
 for(const s of stations){const row=rows.get(s.crs),card=text('article','','station-card'+(selected===s.crs?' selected':'')+(!current(row)?' outdated':''));
  card.append(text('span',s.crs,'station-code'),text('h2',s.name));
  const number=text('div',row?.total?percent(row.affected_pct):'—','station-percent');number.append(text('small',!row?'No reading yet':!row.total?'No departures returned':current(row)?'delayed / cancelled':'last recorded · delayed / cancelled'));card.append(number);
  appendStationBreakdown(card,row);
  const stamp=text('p',boardNote(row),'station-status'+(!current(row)?' station-stale':''));if(row)stamp.title=dateLabel(row.checked_at);card.append(stamp);
  const button=text('button','View graph & departures');button.type='button';button.setAttribute('aria-pressed',String(selected===s.crs));button.setAttribute('aria-label','View history and departures at '+s.name);button.onclick=()=>{selected=s.crs;render();if(matchMedia('(max-width:700px)').matches){$('departure-panel').scrollIntoView({behavior:'smooth',block:'start'});$('departure-panel').focus({preventScroll:true});}};card.append(button);card.onclick=e=>{if(!e.target.closest('button'))button.click();};list.append(card);
 }
 renderBoard();
}
function renderBoard(){const root=$('departure-content');root.replaceChildren();const station=catalogue.find(s=>s.crs===selected);if(!station){root.append(text('h2','Choose a station'),text('p','Its reliability graph and departures will appear here.','muted'));return;}
 const row=rows.get(selected),header=text('div','','board-heading');header.append(text('h2',station.name),text('span',selected));root.append(header,text('p',boardNote(row),'board-note'+(!current(row)?' station-stale':'')));
 if(row)root.append(text('p',comparisonText(row),'history-comparison '+row.alert_state));renderHistory(root,row);root.append(text('h3','Departures'));
 if(row)root.append(text('p',dateLabel(row.checked_at)+' · Next '+row.window_minutes+' minutes · '+row.total+' departures checked.','board-note'));
 if(!row)root.append(text('p','No station reading has been uploaded yet.','muted'));
 else if(!row.board_available)root.append(text('p','The percentage is available, but this reading does not include departure details. Install the latest collector update on the new Mac and allow the next station check.','board-note'));
 else if(!row.departures?.length)root.append(text('p',row.total?'Departure details were not returned in this reading.':'No departures were returned in this window. This is not a 100% reliability score.','board-note'));
 else {if(!current(row))root.append(text('p','This board is out of date. The times below are from the last successful check.','reliability-error'));
  root.append(text('p','Showing '+row.departures.length+' of '+row.total+' departures counted.','board-note'));
  const scroll=text('div','','departure-scroll'),table=text('table','','departure-table');const caption=text('caption',station.name+' departures');caption.className='sr-only';table.append(caption);
  const head=text('thead',''),hr=text('tr','');for(const label of ['Due','Destination','Expected','Plat.']){const th=text('th',label);th.scope='col';hr.append(th);}head.append(hr);table.append(head);const body=text('tbody','');
  for(const d of row.departures){const tr=text('tr',''),dest=text('td',d.dest||'Destination unavailable');if(d.operator)dest.append(text('small',d.operator));if(d.reason)dest.append(text('small',d.reason));tr.append(text('td',d.std||'—'),dest,text('td',d.etd||'Unknown','departure-status '+trainStatus(d)),text('td',d.plat||'—'));body.append(tr);}table.append(body);scroll.append(table);root.append(scroll);
 }
 const link=text('a','Open National Rail live board ↗');link.href='https://www.nationalrail.co.uk/live-trains/departures/'+selected+'/';link.target='_blank';link.rel='noopener noreferrer';root.append(link);
}
for(const id of ['station-search','patch-filter','station-sort'])$(id).addEventListener(id==='station-search'?'input':'change',render);
$('refresh-boards').onclick=loadBoards;$('check-access').onclick=checkAccess;
$('auth-form').onsubmit=async e=>{e.preventDefault();$('auth-submit').disabled=true;$('auth-message').textContent='';try{const r=await client.auth.signInWithPassword({email:$('auth-email').value.trim(),password:$('password').value});if(r.error)throw r.error;$('password').value='';}catch(e){$('auth-message').textContent=e.message;}finally{$('auth-submit').disabled=false;}};
$('signout').onclick=async()=>{clearData();session=null;onSession(null);await client.auth.signOut({scope:'local'});};
try{let publicKey=config?.supabasePublishableKey?.startsWith('sb_publishable_');if(config?.supabasePublishableKey?.startsWith('eyJ')){try{publicKey=JSON.parse(atob(config.supabasePublishableKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='anon';}catch{}}
 if(!publicKey||!config?.supabaseUrl)throw new Error('The website needs its public Supabase settings. Contact Owen.');
 client=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey);
 client.auth.onAuthStateChange((event,next)=>{if(event==='TOKEN_REFRESHED'){session=next;return;}setTimeout(()=>onSession(next),0);});
 const initial=await client.auth.getSession();onSession(initial.data?.session||null);
 setInterval(checkAccess,10000);setInterval(loadBoards,30000);setInterval(()=>{if(permitted())render();},60000);
 const resume=()=>{if(!session)return;if(!permitted()){clearData();waiting('check');}checkAccess();};document.addEventListener('visibilitychange',()=>{if(!document.hidden)resume();});window.addEventListener('pageshow',e=>{if(e.persisted)resume();});
}catch(e){clearData();$('waiting').hidden=true;$('auth').hidden=false;$('auth-submit').disabled=true;$('auth-message').textContent=e.message;}
