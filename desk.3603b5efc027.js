import {patchSelection,markerColour,safeLink,healthState,minutesAgo,releaseFreshness,orderedGroups,collectorTime,clockDisplay,nextScrapeLabel,isForceAreaOnly,webDraftSections} from './logic.4ac01426ebf6.js';
const $=s=>document.querySelector(s), config=window.POLICE_CONFIG;
const mobileView=window.matchMedia('(max-width: 760px), (max-width: 1000px) and (pointer: coarse) and (max-height: 500px)');
const PAGE=100, state={mode:'all',selected:new Set(),expanded:new Set(),rows:[],total:0,patches:[],member:null,session:null,version:0,busy:false,health:null,healthAt:0};
let syncResponsiveLayout=()=>{};
let writingUsage=null,currentDraft=null,writingBusy=false,writingMenuTrigger=null;
const drafts=new Map();
let overlayKey='',client,map,overlays,markers,signup=false,recovery=false,authVersion=0,searchTimer;
const text=(tag,value,cls)=>{const el=document.createElement(tag);el.textContent=value;if(cls)el.className=cls;return el;};
const date=value=>value?new Date(value).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Not yet';
function releaseTime(value){const el=text('time','', 'release-time');el.dateTime=value;el.append(text('span',date(value)));const age=text('span',minutesAgo(value),'release-age');age.dataset.releaseTime=value;el.append(age);return el;}
function updateReleaseTimes(){
 const now=Date.now();
 document.querySelectorAll('[data-release-time]').forEach(el=>{const label=minutesAgo(el.dataset.releaseTime,now);if(el.textContent!==label)el.textContent=label;});
 document.querySelectorAll('.release-banner[data-published]').forEach(el=>{const freshness=releaseFreshness(el.dataset.published,now);if(el.dataset.freshness!==freshness)el.dataset.freshness=freshness;});
}
function message(el,value){$(el).textContent=value;}
function readPreferences(){try {const p=JSON.parse(localStorage.getItem('police-desk-filters')||'{}');state.mode=['all','patches','review','outside'].includes(p.mode)?p.mode:'all';state.selected=new Set((p.patches||[]).filter(id=>state.patches.some(x=>x.id===id)));}catch{}}
function savePreferences(){try{localStorage.setItem('police-desk-filters',JSON.stringify({mode:state.mode,patches:[...state.selected]}));}catch{}}
function clearDesk(){clearWriting();state.expanded.clear();if($('#filter-dialog').open)$('#filter-dialog').close();$('#mobile-admin-tools').hidden=true;state.rows=[];state.member=null;state.version++;state.busy=false;$('#desk').hidden=true;$('#releases').replaceChildren();$('#members').replaceChildren();if(markers)markers.clearLayers();syncResponsiveLayout();}
function renderHealth(){const online=healthState(state.health,state.healthAt);$('#health').className='health '+(online?'online':'offline');message('#health-label',online?'Online':'Offline');message('#health-detail',state.health?.last_data_at?'Last update '+date(state.health.last_data_at):client?'No collector updates yet':'Not connected yet');$('#health').title=online?'The collector is sending updates.':'Updates are not arriving. Stored releases remain available. Offline detection may take a few minutes.';}
function renderTiming(){
 const now=Date.now(),clock=clockDisplay(collectorTime(state.health,state.healthAt,now));
 message('#current-time',clock.text);$('#current-time').classList.toggle('deadline',clock.red);
 message('#next-scrape',nextScrapeLabel(state.health,state.healthAt,now));
}
async function pollHealth(){try{const {data,error}=await client.rpc('desk_collector_health');if(error)throw error;state.health=data;state.healthAt=Date.now();}catch{state.health=null;}renderHealth();renderTiming();if(!$('#desk').hidden){let notes=[];const h=state.health;if(!healthState(h,state.healthAt))notes.push('The collector is offline. You are viewing stored releases.');if(h?.failed_forces)notes.push(`${h.failed_forces} of ${h.force_count} source feeds did not update on the latest check.`);if(h?.pending_releases)notes.push(`${h.pending_releases} releases are waiting to upload.`);message('#sync-status',notes.join(' '));$('#sync-status').hidden=!notes.length;}}
async function membership(){const {data,error}=await client.from('desk_members').select('*').eq('user_id',state.session.user.id).maybeSingle();if(error)throw error;return data;}
async function onSession(session){const version=++authVersion;clearDesk();state.session=session;$('#account').hidden=!session;$('#waiting').hidden=true;$('#auth').hidden=!!session&&!recovery;message('#email',session?.user.email||'');if(!session||recovery)return;
 try{const member=await membership();if(version!==authVersion)return;state.member=member;
 if(!member?.approved){$('#waiting').hidden=false;return;}
 $('#desk').hidden=false;$('#auth').hidden=true;$('#admin').hidden=!member.is_admin;$('#mobile-admin-tools').hidden=!member.is_admin;
 if(!state.patches.length){const r=await fetch('./patches.json');if(!r.ok)throw new Error('Patch map could not be loaded.');state.patches=await r.json();readPreferences();renderPatches();}
 if(version!==authVersion)return;
 syncResponsiveLayout();initMap();renderSelection();await loadReleases();await loadWritingUsage();if(member.is_admin)await loadMembers();
 }catch(e){if(version!==authVersion)return;clearDesk();$('#waiting').hidden=false;message('#waiting-message','Could not verify access. Please retry. '+e.message);}}
function renderPatches(){const root=$('#patches');root.replaceChildren();const groups=orderedGroups(state.patches);const query=$('#patch-search').value.toLowerCase();
 for(const group of groups){const all=state.patches.filter(p=>p.group===group), visible=all.filter(p=>(p.name+' '+group).toLowerCase().includes(query));if(!visible.length)continue;
 const details=document.createElement('details');details.className='group';details.open=!!query||all.some(p=>state.selected.has(p.id));const summary=text('summary',group);details.append(summary);
 const label=document.createElement('label');label.className='group-label';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.dataset.group=group;const count=all.filter(p=>state.selected.has(p.id)).length;checkbox.checked=state.mode==='patches'&&count===all.length;checkbox.indeterminate=state.mode==='patches'&&count>0&&count<all.length;label.append(checkbox,text('span','All '+group));details.append(label);
 checkbox.addEventListener('change',()=>{if(state.mode!=='patches')state.selected.clear();state.mode='patches';state.selected=patchSelection(state.selected,all.map(p=>p.id),checkbox.checked);changed(true);});
 for(const patch of visible){const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.checked=state.mode==='patches'&&state.selected.has(patch.id);label.append(box,text('span',patch.name));box.addEventListener('change',()=>{if(state.mode!=='patches')state.selected.clear();state.mode='patches';state.selected=patchSelection(state.selected,[patch.id],box.checked);changed(true);});details.append(label);}
 root.append(details);}}
function renderSelection(){for(const [id,mode] of [['all','all'],['review','review'],['outside','outside']])$('#'+id).classList.toggle('active',state.mode===mode);const names=state.patches.filter(p=>state.selected.has(p.id)).map(p=>p.name);
 message('#view-title',state.mode==='all'?'All releases':state.mode==='review'?'Needs location review':state.mode==='outside'?'Outside mapped patches':names.length===1?names[0]:`${names.length} patches selected`);
 message('#selection-label',state.mode==='all'?'Across all patches, including releases awaiting a location':state.mode==='patches'?(names.join(' · ')||'Select one or more patches to see releases'):state.mode==='review'?'Unlocated or ambiguous releases': 'Located releases outside the supplied TSA boundaries');renderPatches();renderMap();}
function changed(fit=false){savePreferences();renderSelection();loadReleases();if(fit)fitMap();}
function queryFor(){let q=client.from('police_releases').select('*',{count:'exact'}).order('published_at',{ascending:false}).order('id');
 const hours=Number($('#period').value);if(hours)q=q.gte('published_at',new Date(Date.now()-hours*3600000).toISOString());
 if($('#force').value)q=q.eq('force',$('#force').value);
 if(state.mode==='patches')q=q.overlaps('patch_ids',[...state.selected]);
 if(state.mode==='review')q=q.in('location_status',['unlocated','review']);
 if(state.mode==='outside')q=q.eq('location_status','outside');
 if($('#query').value.trim())q=q.textSearch('search_document',$('#query').value.trim(),{type:'websearch',config:'english'});
 return q;}
async function loadReleases(more=false,quiet=false){if(!state.member?.approved)return;if(more&&state.busy)return;const version=++state.version;state.busy=true;$('#more').disabled=true;$('#error').hidden=true;
 const refreshCount=quiet?Math.max(PAGE,state.rows.length):PAGE;
 if(!more&&!quiet){state.rows=[];state.total=0;renderRows();message('#result-count','Loading releases…');}
 if(state.mode==='patches'&&!state.selected.size){state.busy=false;renderRows();return;}
 const offset=more?state.rows.length:0;
 try{const {data,count,error}=await queryFor().range(offset,offset+refreshCount-1);if(version!==state.version)return;if(error)throw error;
 state.rows=more?[...state.rows,...data]:data;state.total=count;state.busy=false;renderRows();message('#updated','Updated '+date(new Date().toISOString()));
 }catch(e){if(version!==state.version)return;state.busy=false;message('#error','Releases could not be loaded. '+e.message);$('#error').hidden=false;message('#result-count',`${state.rows.length} releases loaded`);}
 finally{if(version===state.version){state.busy=false;$('#more').disabled=false;}}}
function renderRows(){const root=$('#releases');root.replaceChildren();message('#result-count',`${state.total.toLocaleString()} releases${state.rows.length<state.total?' · '+state.rows.length+' loaded':''}`);$('#more').hidden=state.rows.length>=state.total;$('#more').disabled=false;
 if(!state.rows.length&&!state.busy){const e=text('div','', 'empty');e.append(text('h2',state.mode==='patches'&&!state.selected.size?'Choose your patches':'No releases found'),text('p','Change the coverage, time period or search to see more.','muted'));root.append(e);}
 for(const row of state.rows){const article=document.createElement('article');article.className='release';article.id='release-'+row.id;
 const banner=text('div','','release-banner');banner.dataset.published=row.published_at;banner.dataset.freshness=releaseFreshness(row.published_at);
 const body=text('div','','release-body');body.id='release-body-'+row.id;body.hidden=!state.expanded.has(row.id);
 const meta=text('div','','release-meta');meta.append(text('strong',row.force_name),releaseTime(row.published_at));banner.append(meta);
 if(hasWritingAccess()){
  const actions=text('button','⋯','story-actions');actions.type='button';actions.setAttribute('aria-label','Writing options for '+row.title);actions.setAttribute('aria-haspopup','dialog');
  actions.addEventListener('click',()=>openWritingMenu(row,actions));meta.append(actions);
  article.addEventListener('contextmenu',event=>{event.preventDefault();openWritingMenu(row,actions,{x:event.clientX,y:event.clientY});});
 }
 const heading=text('h2',''),url=safeLink(row.url);if(url){const link=text('a',row.title);link.href=url;link.target='_blank';link.rel='noopener noreferrer';heading.append(link);}else heading.textContent=row.title;
 const headingRow=text('div','','release-heading'),toggle=text('button',body.hidden?'More':'Less','release-toggle');toggle.type='button';toggle.setAttribute('aria-controls',body.id);toggle.setAttribute('aria-expanded',String(!body.hidden));toggle.setAttribute('aria-label',(body.hidden?'More about ':'Less about ')+row.title);
 toggle.addEventListener('click',()=>{body.hidden=!body.hidden;if(body.hidden)state.expanded.delete(row.id);else state.expanded.add(row.id);toggle.textContent=body.hidden?'More':'Less';toggle.setAttribute('aria-expanded',String(!body.hidden));toggle.setAttribute('aria-label',(body.hidden?'More about ':'Less about ')+row.title);});
 headingRow.append(heading,toggle);banner.append(headingRow);article.append(banner);
 const forceFallback=isForceAreaOnly(row);
 const tags=text('div','','tags');for(const id of row.patch_ids){tags.append(text('span',state.patches.find(p=>p.id===id)?.name||id,'tag'));}if(row.location_status!=='matched')tags.append(text('span',forceFallback?'Force area only':row.location_status==='outside'?'Outside mapped patches':'Needs location review','tag review'));body.append(tags);
 body.append(text('pre',row.body||(row.body_status==='unavailable'?'The source page could not be read. Open the original release above.':'Release text is waiting to be collected. The headline remains available.'),'release-text'));
 const places=row.locations.map(p=>p.name).join(', ');body.append(text('div',places?'Inferred location: '+places:forceFallback?'Coverage based on '+row.force_name+' area; exact location unconfirmed.':'Location not confirmed','location-evidence'));
 const details=document.createElement('details');details.append(text('summary','Location evidence'));
 details.append(text('p',row.location_note,'fine muted'));
 for(const loc of row.locations)details.append(text('p',`${loc.name} — ${loc.source}: “${loc.excerpt}”`,'fine'));
 body.append(details);article.append(body);root.append(article);}
 renderMap();}
function initMap(){
 if(mobileView.matches)return;
 if(map){setTimeout(()=>map.invalidateSize(),0);return;}
 map=L.map('map',{preferCanvas:true,minZoom:4,maxZoom:14,maxBounds:[[47,-16],[64,11]],maxBoundsViscosity:.7}).setView([54.6,-3.5],5);
 map.createPane('baseLand');map.getPane('baseLand').style.zIndex='200';
 map.createPane('placeLabels');map.getPane('placeLabels').style.zIndex='350';map.getPane('placeLabels').style.pointerEvents='none';
 map.attributionControl.addAttribution('<a href="https://www.naturalearthdata.com/">Natural Earth</a>');
 fetch('./basemap.969e0725f651.json').then(r=>{if(!r.ok)throw new Error('Basemap unavailable');return r.json();}).then(data=>{
  L.geoJSON(data,{pane:'baseLand',interactive:false,style:{color:'#3b4b5c',weight:.8,fillColor:'#233140',fillOpacity:1}}).addTo(map);
 }).catch(()=>{message('#map-note','Background map unavailable. TSA boundaries and release dots are still shown.');$('#map-note').hidden=false;});
 const places=[['London',51.5074,-.1278],['Birmingham',52.4862,-1.8904],['Manchester',53.4808,-2.2426],['Liverpool',53.4084,-2.9916],['Leeds',53.8008,-1.5491],['Cardiff',51.4816,-3.1791],['Bristol',51.4545,-2.5879],['Newcastle',54.9783,-1.6178],['Edinburgh',55.9533,-3.1883],['Glasgow',55.8642,-4.2518],['Belfast',54.5973,-5.9301],['Aberdeen',57.1497,-2.0943],['Plymouth',50.3755,-4.1427]];
 const labels=L.layerGroup();for(const [name,lat,lng] of places)L.marker([lat,lng],{pane:'placeLabels',interactive:false,keyboard:false,icon:L.divIcon({className:'basemap-label',html:text('span',name),iconSize:[100,18],iconAnchor:[50,-6]})}).addTo(labels);
 const updateLabels=()=>{if(map.getZoom()>=7)labels.addTo(map);else labels.removeFrom(map);};map.on('zoomend',updateLabels);
 overlays=L.layerGroup().addTo(map);markers=L.layerGroup().addTo(map);
 new ResizeObserver(()=>map.invalidateSize({pan:false})).observe($('#map'));
 setTimeout(()=>{map.invalidateSize();fitMap();},0);
}

function visiblePatches(){return state.mode==='patches'?state.patches.filter(p=>state.selected.has(p.id)):state.patches;}
function renderMap(){if(!map||mobileView.matches)return;markers.clearLayers();const key=state.mode+'|'+[...state.selected].sort().join(',')+'|'+$('#show-overlays').checked;
 if(key!==overlayKey){overlayKey=key;overlays.clearLayers();if($('#show-overlays').checked)for(const p of visiblePatches()){L.polygon(p.coords,{color:'#a397ce',weight:1,opacity:.65,fillColor:'#8973b4',fillOpacity:.035,smoothFactor:1.5}).bindTooltip(text('span',p.name)).addTo(overlays);}}
 let located=0;for(const row of state.rows){let has=false;for(const loc of row.locations){if(state.mode==='patches'&&!loc.patch_ids.some(id=>state.selected.has(id)))continue;if(!Number.isFinite(loc.lat)||!Number.isFinite(loc.lng))continue;has=true;
 const popup=document.createElement('div'),link=text('a',row.title);const url=safeLink(row.url);if(url){link.href=url;link.target='_blank';link.rel='noopener noreferrer';}popup.append(link,text('small',`${row.force_name} · ${loc.name} (inferred)`),releaseTime(row.published_at));
 const button=text('button','Read in list');button.addEventListener('click',()=>{map.closePopup();document.getElementById('release-'+row.id)?.scrollIntoView({behavior:'smooth',block:'center'});});popup.append(button);
 L.circleMarker([loc.lat,loc.lng],{radius:7,color:row.location_status==='review'?'#af6d00':'white',weight:2,fillColor:markerColour(row.published_at),fillOpacity:.95}).bindPopup(popup).addTo(markers);
 }if(has)located++;}
 const forceOnly=state.rows.filter(isForceAreaOnly).length;
 message('#map-count',`${located} of ${state.rows.length} loaded releases mapped${forceOnly?' · '+forceOnly+' force area only (no pin)':''}${state.total>state.rows.length?' · Load more below':''}`);}
function fitMap(){if(!map||mobileView.matches)return;const points=[];function collect(c){if(typeof c[0]==='number')points.push(c);else c.forEach(collect);}for(const p of visiblePatches())collect(p.coords);if(points.length)map.fitBounds(L.latLngBounds(points),{padding:[20,20],maxZoom:10});}
async function loadMembers(){const version=authVersion;const {data,error}=await client.from('desk_members').select('*').order('created_at',{ascending:false});if(version!==authVersion||!state.member?.is_admin)return;if(error){message('#admin-message',error.message);return;}const usage=await client.rpc('desk_writing_admin_usage');if(version!==authVersion)return;const used=new Map((Array.isArray(usage.data)?usage.data:[]).map(x=>[x.user_id,x.used]));const root=$('#members');root.replaceChildren();
 for(const member of data){const line=text('div','','member'),info=text('div',member.email);info.append(text('small',member.is_admin?'Administrator':member.approved?'Approved':'Awaiting Owen’s approval'));line.append(info);
 if(member.user_id!==state.session.user.id){const btn=text('button',member.approved?'Revoke access':'Approve access');btn.addEventListener('click',async()=>{btn.disabled=true;const {error}=await client.rpc('desk_set_approval',{target:member.user_id,allow_access:!member.approved});if(error){message('#admin-message',error.message);btn.disabled=false;}else{message('#admin-message','Account access updated.');await loadMembers();}});line.append(btn);}
 if('writing_daily_limit' in member){
  const form=document.createElement('form');form.className='writing-permissions';
  const option=(caption,checked)=>{const label=text('label',''),input=document.createElement('input');input.type='checkbox';input.checked=checked;label.append(input,text('span',caption));form.append(label);return input;};
  const web=option('Write web',member.can_write_web),copy=option('Write copy',member.can_write_copy);
  const label=text('label','Daily requests'),limit=document.createElement('input');limit.type='number';limit.min='0';limit.max='1000';limit.step='1';limit.required=true;limit.value=member.writing_daily_limit;label.append(limit);form.append(label);
  form.append(text('small',usage.error?'Daily usage unavailable':`${used.get(member.user_id)||0} used today`));
  const save=text('button','Save writing settings');save.type='submit';form.append(save);
  form.onsubmit=async event=>{event.preventDefault();save.disabled=true;const {error}=await client.rpc('desk_set_writing',{target:member.user_id,allow_web:web.checked,allow_copy:copy.checked,daily_limit:Number(limit.value)});if(version!==authVersion)return;message('#admin-message',error?error.message:'Writing settings saved for '+member.email+'.');save.disabled=false;if(!error){if(member.user_id===state.session.user.id){state.member=await membership();await loadWritingUsage();renderRows();}await loadMembers();}};
  line.append(form);
 }else message('#admin-message','Install the story-writing database update to enable writing settings.');
 root.append(line);}}
function hasWritingAccess(){return !!(state.member?.approved&&(state.member.can_write_web||state.member.can_write_copy));}
function clearWriting(){drafts.clear();currentDraft=null;writingBusy=false;writingUsage=null;for(const id of ['writing-menu','writing-dialog'])if($('#'+id).open)$('#'+id).close();$('#draft-output').value='';for(const field of ['headline','subheading','body'])$('#web-'+field).value='';$('#web-draft-fields').hidden=true;$('#writing-summary').hidden=true;}
async function loadWritingUsage(){const version=authVersion;if(!state.session)return;const {data,error}=await client.rpc('desk_writing_usage');if(version!==authVersion)return;writingUsage=error?null:data;renderWritingUsage();}
function allowanceText(){return writingUsage&&Number.isInteger(writingUsage.daily_limit)?`${Math.max(0,writingUsage.daily_limit-writingUsage.used)} of ${writingUsage.daily_limit} requests left today · resets midnight UK time`:'Writing allowance unavailable';}
function renderWritingUsage(){message('#writing-summary',allowanceText());$('#writing-summary').hidden=!hasWritingAccess();message('#writing-allowance',allowanceText());message('#draft-allowance',allowanceText());}
function openWritingMenu(row,trigger,point){
 if(!hasWritingAccess())return;writingMenuTrigger=trigger;const menu=$('#writing-menu');
 message('#writing-story',row.title);message('#writing-source-note',row.body_status==='available'&&row.body?.trim().length>=120?'Choose a draft to write.':'Full release text is needed before a draft can be written.');
 for(const kind of ['web','copy']){const btn=$('#write-'+kind);btn.disabled=!state.member['can_write_'+kind]||row.body_status!=='available'||!row.body||row.body.trim().length<120;btn.onclick=()=>{menu.close();openDraft(row,kind);};}
 renderWritingUsage();menu.style.left='';menu.style.top='';menu.style.margin='';menu.showModal();
 if(!mobileView.matches){const rect=trigger.getBoundingClientRect();menu.style.margin='0';menu.style.left=Math.max(8,Math.min(point?.x??rect.left,window.innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(point?.y??rect.bottom,window.innerHeight-menu.offsetHeight-8))+'px';}
 loadWritingUsage();
}
function draftFailure(code){return code==='incomplete_response'?'The response was cut short. Request a new version if needed.':code==='interrupted'?'This request did not finish. It remains counted because the API may have processed it.':'The writing service could not complete this draft. The attempted request counts towards today’s allowance.';}
function showDraft(record){
 if(currentDraft!==record)return;message('#draft-title',record.kind==='copy'?'Write copy':'Write web');message('#draft-source-title',record.row.title);$('#draft-output').value=record.output||'';$('#draft-output').hidden=!record.output;
 const web=record.kind==='web'?webDraftSections(record.output):null;$('#web-draft-fields').hidden=!web;if(web){for(const field of ['headline','subheading','body'])$('#web-'+field).value=web[field];$('#draft-output').hidden=true;}message('#draft-message',record.message||'');$('#draft-copy').hidden=!record.output||!!web;$('#draft-check').hidden=!record.check;
 $('#draft-again').hidden=record.status==='processing';$('#draft-again').disabled=writingBusy;
 renderWritingUsage();
}
function openDraft(row,kind){
 const key=row.id+'|'+kind;let record=drafts.get(key);
 if(!record){let saved;try{saved=JSON.parse(sessionStorage.getItem('police-writing-'+state.session.user.id)||'{}')[key];}catch{}record={row,kind,key,id:saved||crypto.randomUUID(),status:'new',output:'',message:''};drafts.set(key,record);}
 currentDraft=record;showDraft(record);if(!$('#writing-dialog').open)$('#writing-dialog').showModal();
 if(record.status==='new')generateDraft(record);
}
async function generateDraft(record){
 if(writingBusy){record.message='Another draft is being written. Wait for it to finish, then try again.';record.status='blocked';showDraft(record);return;}
 const version=authVersion;writingBusy=true;record.status='processing';record.check=false;record.message='Writing your draft…';showDraft(record);
 // Save only an opaque request ID so a reload can retrieve the same request without paying twice.
 try{const key='police-writing-'+state.session.user.id,ids=JSON.parse(sessionStorage.getItem(key)||'{}');ids[record.key]=record.id;sessionStorage.setItem(key,JSON.stringify(ids));}catch{}
 try{
  const {data,error}=await client.functions.invoke('write-story',{body:{request_id:record.id,release_id:record.row.id,kind:record.kind}});
  if(version!==authVersion)return;
  if(error){let detail;try{detail=await error.context?.json();}catch{}
   const rejected=['access_denied','writing_denied','daily_limit','already_writing','source_not_ready','source_too_long','release_missing','invalid_request','request_conflict'].includes(detail?.code);
   record.status=rejected?'failed':'unknown';record.message=detail?.error||'The connection was interrupted. Check this request before starting another.';record.check=!rejected;
  }else if(data?.status==='succeeded'){record.status='succeeded';record.output=data.output;record.message='Draft ready. Check it against the source before use.';}
  else if(data?.status==='failed'){record.status='failed';record.message=draftFailure(data.error_code);}
  else {record.status='unknown';record.message='Your request is processing. Use Check request to retrieve it without sending another API request.';record.check=true;}
 }catch{if(version!==authVersion)return;record.status='unknown';record.message='The connection was interrupted. Check this request before starting another.';record.check=true;}
 finally{if(version===authVersion){writingBusy=false;showDraft(record);await loadWritingUsage();if(state.member?.is_admin)await loadMembers();}}
}
$('#close-writing-menu').onclick=()=>$('#writing-menu').close();
$('#writing-menu').addEventListener('click',e=>{if(e.target===$('#writing-menu'))$('#writing-menu').close();});
$('#writing-menu').addEventListener('close',()=>writingMenuTrigger?.isConnected&&writingMenuTrigger.focus());
$('#close-draft').onclick=()=>$('#writing-dialog').close();
$('#draft-output').addEventListener('input',()=>{if(currentDraft)currentDraft.output=$('#draft-output').value;});
for(const field of ['headline','subheading','body']){
 $('#web-'+field).addEventListener('input',()=>{if(currentDraft)currentDraft.output='HEADLINE\n'+$('#web-headline').value+'\n\nSUBHEADING\n'+$('#web-subheading').value+'\n\nBODY TEXT\n'+$('#web-body').value;});
 $('#copy-web-'+field).onclick=async()=>{const input=$('#web-'+field);try{await navigator.clipboard.writeText(input.value);message('#draft-message',field[0].toUpperCase()+field.slice(1)+' copied.');}catch{input.focus();input.select();message('#draft-message','Select and copy the '+field+'.');}};
}

$('#draft-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('#draft-output').value);message('#draft-message','Copied.');}catch{$('#draft-output').focus();$('#draft-output').select();message('#draft-message','Select and copy the draft text.');}};
$('#draft-check').onclick=async()=>{const record=currentDraft,version=authVersion;if(!record)return;$('#draft-check').disabled=true;try{const {data,error}=await client.rpc('desk_get_write',{rid:record.id});if(version!==authVersion)return;
 if(error){record.message='The request could not be checked. Try again.';}
 else if(data?.status==='succeeded'){record.output=data.output;record.status='succeeded';record.message='Draft ready. Check it against the source before use.';record.check=false;}
 else if(data?.status==='failed'){record.status='failed';record.message=draftFailure(data.error_code);record.check=false;}
 else if(data?.status==='processing'){record.message='Still writing. Check again shortly; this does not use another request.';}
 else {record.status='failed';record.message='No saved request is available to this account. Check your writing access and allowance before trying again.';record.check=false;}
 showDraft(record);await loadWritingUsage();}finally{$('#draft-check').disabled=false;}};
$('#draft-again').onclick=()=>{if(!currentDraft||writingBusy)return;const record=currentDraft;record.id=crypto.randomUUID();record.output='';record.check=false;generateDraft(record);};
$('#toggle-signup').onclick=()=>{signup=!signup;message('#auth-submit',signup?'Create account':'Sign in');message('#toggle-signup',signup?'Already have an account? Sign in':'Create an account');$('#password').autocomplete=signup?'new-password':'current-password';message('#auth-message','');};
$('#auth-form').onsubmit=async event=>{event.preventDefault();$('#auth-submit').disabled=true;message('#auth-message','');try{const email=$('#auth-email').value.trim(),password=$('#password').value;let result;
 if(recovery){result=await client.auth.updateUser({password});if(result.error)throw result.error;recovery=false;message('#auth-message','Password updated.');await onSession((await client.auth.getSession()).data.session);}
 else if(signup){result=await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}});if(result.error)throw result.error;message('#auth-message','Expect a verification email from Supabase Auth. Check your spam or junk folder too. Follow the link to verify your account; Owen must then approve your access.');}
 else {result=await client.auth.signInWithPassword({email,password});if(result.error)throw result.error;}
 $('#password').value='';}catch(e){message('#auth-message',e.message);}finally{$('#auth-submit').disabled=false;}};
$('#forgot').onclick=async()=>{const email=$('#auth-email').value.trim();if(!email){message('#auth-message','Enter your email address first.');return;}const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});message('#auth-message',error?error.message:'If the account exists, a password reset link will arrive by email.');};
$('#signout').onclick=async()=>{const {error}=await client.auth.signOut();if(error){message('#auth-message',error.message);return;}recovery=false;await onSession(null);};
$('#check-access').onclick=()=>onSession(state.session);
for(const id of ['all','review','outside'])$('#'+id).onclick=()=>{state.mode=id;changed(true);};
$('#clear').onclick=()=>{state.mode='patches';state.selected.clear();changed();};
$('#reset').onclick=()=>{state.mode='all';state.selected.clear();$('#query').value='';$('#force').value='';$('#period').value='24';changed(true);};
$('#patch-search').oninput=renderPatches;
$('#query').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadReleases(),350);};
$('#period').onchange=()=>loadReleases();$('#force').onchange=()=>loadReleases();$('#more').onclick=()=>loadReleases(true);
$('#refresh').onclick=()=>{loadReleases();pollHealth();loadWritingUsage();if(state.member?.is_admin)loadMembers();};
$('#show-overlays').onchange=renderMap;$('#fit-map').onclick=fitMap;
async function init(){if(!config?.supabaseUrl||!config?.supabasePublishableKey){$('#setup').hidden=false;document.querySelectorAll('#auth button,#auth input').forEach(el=>el.disabled=true);return;}
 let secretInBrowser=config.supabasePublishableKey.startsWith('sb_secret_');
 if(config.supabasePublishableKey.startsWith('eyJ')){try{secretInBrowser=JSON.parse(atob(config.supabasePublishableKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role!=='anon';}catch{secretInBrowser=true;}}
 if(secretInBrowser){message('#setup','Invalid browser configuration. Contact Owen.');$('#setup').hidden=false;return;}
 try{client=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey);const forces=await (await fetch('./forces.json')).json();for(const f of forces){if((f.type||'police')!=='police')continue;const option=text('option',f.name);option.value=f.key;$('#force').append(option);}
 client.auth.onAuthStateChange((event,session)=>{if(event==='TOKEN_REFRESHED'){state.session=session;return;}if(event==='PASSWORD_RECOVERY'){recovery=true;$('#auth-email').required=false;$('#auth-email').parentElement.hidden=true;message('#auth-submit','Set new password');$('#toggle-signup').hidden=true;$('#forgot').hidden=true;$('#password').autocomplete='new-password';}setTimeout(()=>onSession(session),0);});
 await pollHealth();setInterval(()=>{pollHealth();if(state.session&&!recovery){const version=authVersion;membership().then(m=>{if(version!==authVersion)return;if(!m?.approved){clearDesk();$('#waiting').hidden=false;}else {const permissionsChanged=state.member?.can_write_web!==m.can_write_web||state.member?.can_write_copy!==m.can_write_copy;state.member=m;if(permissionsChanged){clearWriting();renderRows();}loadWritingUsage();if(!state.busy&&!$('#desk').hidden)loadReleases(false,true);}}).catch(()=>{if(version!==authVersion)return;clearDesk();$('#waiting').hidden=false;message('#waiting-message','Access could not be checked. Please retry.');});}},30000);setInterval(renderHealth,5000);setInterval(updateReleaseTimes,1000);
 }catch(e){message('#auth-message','The desk could not connect. '+e.message);}}
function initResponsiveLayout(){
 const dialog=$('#filter-dialog'),trigger=$('#mobile-filters');
 // Move the existing controls so desktop and mobile always share one filter state.
 const panels=[['coverage-filters','mobile-coverage-slot'],['release-filters','mobile-search-slot'],['account','mobile-account-slot'],['admin','mobile-admin-slot']].map(([id,slot])=>{
  const node=$('#'+id),anchor=document.createComment(id+' desktop position');node.before(anchor);return {node,anchor,slot:$('#'+slot)};
 });
 const adapt=()=>{
  if(dialog.open)dialog.close();
  for(const {node,anchor,slot} of panels){if(mobileView.matches&&(node.id!=='account'||!$('#desk').hidden))slot.append(node);else anchor.after(node);}
  if(!mobileView.matches&&!$('#desk').hidden){initMap();requestAnimationFrame(()=>{map?.invalidateSize({pan:false});renderMap();fitMap();});}
 };
 trigger.onclick=()=>{if(mobileView.matches){dialog.showModal();dialog.scrollTop=0;trigger.setAttribute('aria-expanded','true');document.body.classList.add('filters-open');}};
 $('#close-filters').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{trigger.setAttribute('aria-expanded','false');document.body.classList.remove('filters-open');});
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
 syncResponsiveLayout=adapt;mobileView.addEventListener('change',adapt);adapt();
}
initResponsiveLayout();
new ResizeObserver(entries=>{document.documentElement.style.setProperty('--header-height',entries[0].target.getBoundingClientRect().height+'px');}).observe(document.querySelector('header'));
renderTiming();setInterval(renderTiming,1000);
init();

// Optional agent controls share the visible filter actions and never bypass access.
if(document.modelContext?.registerTool){
 const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
 const tool={name:'set_police_release_filters',title:'Set police release filters',description:'Change the signed-in desk to all releases, location review, or a chosen combination of patches.',inputSchema:{type:'object',properties:{mode:{type:'string',enum:['all','patches','review','outside']},patchIds:{type:'array',items:{type:'string'}}},required:['mode'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},async execute(input){
  if(!state.member?.approved)throw new Error('Sign in with an approved account first.');
  if(!input||!['all','patches','review','outside'].includes(input.mode)||Object.keys(input).some(k=>!['mode','patchIds'].includes(k)))throw new Error('Invalid filter.');
  if(input.patchIds!==undefined&&(!Array.isArray(input.patchIds)||input.patchIds.some(id=>typeof id!=='string'||!state.patches.some(p=>p.id===id))))throw new Error('Unknown patch.');
  state.mode=input.mode;state.selected=new Set(input.patchIds||[]);savePreferences();renderSelection();await loadReleases();fitMap();return {mode:state.mode,patchIds:[...state.selected],count:state.total};
 }};
 try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}
}
