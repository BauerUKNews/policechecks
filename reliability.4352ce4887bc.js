import {minutesAgo} from './logic.23036191bb0d.js';
const $=id=>document.getElementById(id),config=window.POLICE_CONFIG;
const text=(tag,value,cls='')=>{const e=document.createElement(tag);e.textContent=value;e.className=cls;return e;};
let client,session=null,access=false,accessBusy=false,epoch=0,accessTimer,accessUntil=0,accessWall=0;
let catalogue=[],patches=[],rows=new Map(),selected='',loading=false,requestController=null,serverAt=0,serverClock=0;
const now=()=>serverAt?serverClock+(performance.now()-serverAt):Date.now();
const permitted=()=>access&&performance.now()<accessUntil&&Date.now()<accessWall;
const current=row=>row&&Number.isFinite(Date.parse(row.valid_until))&&Date.parse(row.valid_until)>now();
const dateLabel=value=>new Date(value).toLocaleString('en-GB',{timeZone:'Europe/London',dateStyle:'medium',timeStyle:'short'});
const percent=n=>Number(n).toLocaleString('en-GB',{maximumFractionDigits:1})+'%';
async function bounded(request){let timer;try{return await Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Connection timed out.')),10000);})]);}finally{clearTimeout(timer);}}
function clearData(){epoch++;access=false;rows.clear();requestController?.abort();requestController=null;loading=false;clearTimeout(accessTimer);$('dashboard').hidden=true;$('station-list').replaceChildren();$('departure-content').replaceChildren();for(const id of ['reporting-count','affected-count','load-status'])$(id).textContent='';}
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
 try{const r=await bounded(client.from('desk_station_boards').select('*').order('name').limit(1000).abortSignal(controller.signal));if(version!==epoch||!permitted()||controller!==requestController)return;if(r.error)throw r.error;
  const gate=await bounded(client.rpc('desk_my_access'));if(version!==epoch||!permitted())return;if(gate.error||gate.data?.allowed!==true){clearData();waiting(gate.data?.reason||'error');return;}
  rows=new Map((r.data||[]).map(row=>[row.id,row]));$('data-error').hidden=true;$('load-status').textContent=rows.size?'Latest saved readings loaded · this page refreshes every 30 seconds.':'Awaiting the new Mac’s first station-board upload.';render();
 }catch(e){if(version!==epoch)return;$('data-error').hidden=false;$('data-error').textContent='Could not refresh the station readings. '+(rows.size?'Showing the last readings with their check times.':'Install the latest update on the collecting Mac, then try Refresh.');render();}
 finally{if(controller===requestController){requestController=null;loading=false;$('refresh-boards').disabled=false;}}
}
function boardNote(row){return !row?'Awaiting new Mac':(current(row)?'Checked ':'Out of date · checked ')+minutesAgo(row.checked_at,now()).toLowerCase();}
function render(){if(!permitted())return;
 const available=catalogue.map(s=>rows.get(s.crs)).filter(current);
 $('reporting-count').textContent=available.length;$('affected-count').textContent=available.filter(r=>r.total&&((r.delayed!==null&&r.cancelled!==null)?(r.delayed+r.cancelled)*2>r.total:r.affected_pct>50)).length;
 const search=$('station-search').value.trim().toLowerCase(),patch=$('patch-filter').value;
 const stations=catalogue.filter(s=>(s.name+' '+s.crs).toLowerCase().includes(search)&&(!patch||(rows.get(s.crs)?.patch_ids||s.patch_ids||[]).includes(patch)));
 stations.sort((a,b)=>{if($('station-sort').value==='affected'){const ar=rows.get(a.crs),br=rows.get(b.crs);const av=current(ar)&&ar.total?Number(ar.affected_pct):-1,bv=current(br)&&br.total?Number(br.affected_pct):-1;if(av!==bv)return bv-av;}return a.name.localeCompare(b.name);});
 $('station-count').textContent=stations.length+' of '+catalogue.length+' stations';const list=$('station-list');list.replaceChildren();
 if(!stations.length)list.append(text('p','No stations match these filters.','muted'));
 for(const s of stations){const row=rows.get(s.crs),card=text('article','','station-card'+(selected===s.crs?' selected':'')+(!current(row)?' outdated':''));
  card.append(text('span',s.crs,'station-code'),text('h2',s.name));
  const number=text('div',row?.total?percent(row.affected_pct):'—','station-percent');number.append(text('small',!row?'No reading yet':!row.total?'No departures returned':current(row)?'delayed / cancelled':'last recorded · delayed / cancelled'));card.append(number);
  const known=row&&row.delayed!==null&&row.cancelled!==null;
  card.append(text('p',row?.total?(known?percent(row.delayed/row.total*100)+' delayed · '+percent(row.cancelled/row.total*100)+' cancelled':row.total+' departures checked'):'', 'station-breakdown'));
  const bar=text('div','','station-bar');bar.setAttribute('aria-hidden','true');
  if(row?.total){for(const [value,cls]of [[100-row.affected_pct,'good'],[known?row.delayed/row.total*100:row.affected_pct,'delayed'],[known?row.cancelled/row.total*100:0,'cancelled']]){const segment=text('span','',cls);segment.style.width=Math.max(0,Math.min(100,value))+'%';bar.append(segment);}}card.append(bar);
  const stamp=text('p',boardNote(row),'station-status'+(!current(row)?' station-stale':''));if(row)stamp.title=dateLabel(row.checked_at);card.append(stamp);
  const button=text('button','View departures');button.type='button';button.setAttribute('aria-pressed',String(selected===s.crs));button.setAttribute('aria-label','View departures at '+s.name);button.onclick=()=>{selected=s.crs;render();if(matchMedia('(max-width:700px)').matches){$('departure-panel').scrollIntoView({behavior:'smooth',block:'start'});$('departure-panel').focus({preventScroll:true});}};card.append(button);list.append(card);
 }
 renderBoard();
}
function renderBoard(){const root=$('departure-content');root.replaceChildren();const station=catalogue.find(s=>s.crs===selected);if(!station){root.append(text('h2','Choose a station'),text('p','Its departure board will appear here.','muted'));return;}
 const row=rows.get(selected),header=text('div','','board-heading');header.append(text('h2',station.name),text('span',selected));root.append(header,text('p',boardNote(row),'board-note'+(!current(row)?' station-stale':'')));
 if(row)root.append(text('p',dateLabel(row.checked_at)+' · Next '+row.window_minutes+' minutes · '+row.total+' departures checked.','board-note'));
 if(!row)root.append(text('p','No station reading has been uploaded yet.','muted'));
 else if(!row.board_available)root.append(text('p','The percentage is available, but this reading does not include departure details. Install the latest collector update on the new Mac and allow the next station check.','board-note'));
 else if(!row.departures?.length)root.append(text('p',row.total?'Departure details were not returned in this reading.':'No departures were returned in this window. This is not a 100% reliability score.','board-note'));
 else {if(!current(row))root.append(text('p','This board is out of date. The times below are from the last successful check.','reliability-error'));
  root.append(text('p','Showing '+row.departures.length+' of '+row.total+' departures counted.','board-note'));
  const scroll=text('div','','departure-scroll'),table=text('table','','departure-table');const caption=text('caption',station.name+' departures');caption.className='sr-only';table.append(caption);
  const head=text('thead',''),hr=text('tr','');for(const label of ['Due','Destination','Expected','Plat.']){const th=text('th',label);th.scope='col';hr.append(th);}head.append(hr);table.append(head);const body=text('tbody','');
  for(const d of row.departures){const tr=text('tr',''),dest=text('td',d.dest||'Destination unavailable');if(d.operator)dest.append(text('small',d.operator));if(d.reason)dest.append(text('small',d.reason));tr.append(text('td',d.std||'—'),dest,text('td',d.etd||'Unknown',d.etd==='Cancelled'?'train-cancelled':d.bad?'train-late':''),text('td',d.plat||'—'));body.append(tr);}table.append(body);scroll.append(table);root.append(scroll);
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
