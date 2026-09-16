import {patchSelection,markerColour,safeLink,healthState} from './logic.js';
const $=s=>document.querySelector(s), config=window.POLICE_CONFIG;
const PAGE=100, state={mode:'all',selected:new Set(),rows:[],total:0,patches:[],member:null,session:null,version:0,busy:false,health:null,healthAt:0};
let overlayKey='',client,map,overlays,markers,signup=false,recovery=false,authVersion=0,searchTimer;
const text=(tag,value,cls)=>{const el=document.createElement(tag);el.textContent=value;if(cls)el.className=cls;return el;};
const date=value=>value?new Date(value).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Not yet';
function message(el,value){$(el).textContent=value;}
function readPreferences(){try {const p=JSON.parse(localStorage.getItem('police-desk-filters')||'{}');state.mode=['all','patches','review','outside'].includes(p.mode)?p.mode:'all';state.selected=new Set((p.patches||[]).filter(id=>state.patches.some(x=>x.id===id)));}catch{}}
function savePreferences(){try{localStorage.setItem('police-desk-filters',JSON.stringify({mode:state.mode,patches:[...state.selected]}));}catch{}}
function clearDesk(){state.rows=[];state.member=null;state.version++;state.busy=false;$('#desk').hidden=true;$('#releases').replaceChildren();$('#members').replaceChildren();if(markers)markers.clearLayers();}
function renderHealth(){const online=healthState(state.health,state.healthAt);$('#health').className='health '+(online?'online':'offline');message('#health-label',online?'Online':'Offline');message('#health-detail',state.health?.last_data_at?'Last update '+date(state.health.last_data_at):client?'No collector updates yet':'Not connected yet');$('#health').title=online?'The collector is sending updates.':'Updates are not arriving. Stored releases remain available. Offline detection may take a few minutes.';}
async function pollHealth(){try{const {data,error}=await client.rpc('desk_collector_health');if(error)throw error;state.health=data;state.healthAt=Date.now();}catch{state.health=null;}renderHealth();if(!$('#desk').hidden){let notes=[];const h=state.health;if(!healthState(h,state.healthAt))notes.push('The collector is offline. You are viewing stored releases.');if(h?.failed_forces)notes.push(`${h.failed_forces} of ${h.force_count} source feeds did not update on the latest check.`);if(h?.pending_releases)notes.push(`${h.pending_releases} releases are waiting to upload.`);message('#sync-status',notes.join(' '));$('#sync-status').hidden=!notes.length;}}
async function membership(){const {data,error}=await client.from('desk_members').select('*').eq('user_id',state.session.user.id).maybeSingle();if(error)throw error;return data;}
async function onSession(session){const version=++authVersion;clearDesk();state.session=session;$('#account').hidden=!session;$('#waiting').hidden=true;$('#auth').hidden=!!session&&!recovery;message('#email',session?.user.email||'');if(!session||recovery)return;
 try{const member=await membership();if(version!==authVersion)return;state.member=member;
 if(!member?.approved){$('#waiting').hidden=false;return;}
 $('#desk').hidden=false;$('#auth').hidden=true;$('#admin').hidden=!member.is_admin;
 if(!state.patches.length){const r=await fetch('./patches.json');if(!r.ok)throw new Error('Patch map could not be loaded.');state.patches=await r.json();readPreferences();renderPatches();}
 if(version!==authVersion)return;
 initMap();renderSelection();await loadReleases();if(member.is_admin)await loadMembers();
 }catch(e){if(version!==authVersion)return;clearDesk();$('#waiting').hidden=false;message('#waiting-message','Could not verify access. Please retry. '+e.message);}}
function renderPatches(){const root=$('#patches');root.replaceChildren();const groups=[...new Set(state.patches.map(p=>p.group))];const query=$('#patch-search').value.toLowerCase();
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
 for(const row of state.rows){const article=document.createElement('article');article.className='release'+(Date.now()-Date.parse(row.published_at)<3600000?' recent':'');article.id='release-'+row.id;
 const meta=text('div','','release-meta');meta.append(text('strong',row.force_name),text('span','· '+date(row.published_at)));article.append(meta);
 const heading=text('h2',''),url=safeLink(row.url);if(url){const link=text('a',row.title);link.href=url;link.target='_blank';link.rel='noopener noreferrer';heading.append(link);}else heading.textContent=row.title;article.append(heading);
 const tags=text('div','','tags');for(const id of row.patch_ids){tags.append(text('span',state.patches.find(p=>p.id===id)?.name||id,'tag'));}if(row.location_status!=='matched')tags.append(text('span',row.location_status==='outside'?'Outside mapped patches':'Needs location review','tag review'));article.append(tags);
 if(row.body)article.append(text('p',row.body.slice(0,290)+(row.body.length>290?'…':'')));
 const places=row.locations.map(p=>p.name).join(', ');article.append(text('div',places?'Inferred location: '+places:'Location not confirmed','location-evidence'));
 const details=document.createElement('details');details.append(text('summary','Release text & location evidence'));
 details.append(text('p',row.location_note,'fine muted'));
 for(const loc of row.locations)details.append(text('p',`${loc.name} — ${loc.source}: “${loc.excerpt}”`,'fine'));
 details.append(text('pre',row.body||(row.body_status==='unavailable'?'The source page could not be read. Open the original release above.':'Release text is waiting to be collected. The headline remains available.')));article.append(details);root.append(article);}
 renderMap();}
function initMap(){if(map){setTimeout(()=>map.invalidateSize(),0);return;}map=L.map('map',{preferCanvas:true}).setView([54.6,-3.5],6);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);overlays=L.layerGroup().addTo(map);markers=L.layerGroup().addTo(map);setTimeout(()=>map.invalidateSize(),0);}
function visiblePatches(){return state.mode==='patches'?state.patches.filter(p=>state.selected.has(p.id)):state.patches;}
function renderMap(){if(!map)return;markers.clearLayers();const key=state.mode+'|'+[...state.selected].sort().join(',')+'|'+$('#show-overlays').checked;
 if(key!==overlayKey){overlayKey=key;overlays.clearLayers();if($('#show-overlays').checked)for(const p of visiblePatches()){L.polygon(p.coords,{color:'#4700a3',weight:1,opacity:.65,fillColor:'#7b43b8',fillOpacity:.07,smoothFactor:1.5}).bindTooltip(text('span',p.name)).addTo(overlays);}}
 let located=0;for(const row of state.rows){let has=false;for(const loc of row.locations){if(state.mode==='patches'&&!loc.patch_ids.some(id=>state.selected.has(id)))continue;if(!Number.isFinite(loc.lat)||!Number.isFinite(loc.lng))continue;has=true;
 const popup=document.createElement('div'),link=text('a',row.title);const url=safeLink(row.url);if(url){link.href=url;link.target='_blank';link.rel='noopener noreferrer';}popup.append(link,text('small',`${row.force_name} · ${loc.name} (inferred)`),text('small',date(row.published_at)));
 const button=text('button','Read in list');button.addEventListener('click',()=>{map.closePopup();document.getElementById('release-'+row.id)?.scrollIntoView({behavior:'smooth',block:'center'});});popup.append(button);
 L.circleMarker([loc.lat,loc.lng],{radius:7,color:row.location_status==='review'?'#af6d00':'white',weight:2,fillColor:markerColour(row.published_at),fillOpacity:.95}).bindPopup(popup).addTo(markers);
 }if(has)located++;}
 message('#map-count',`${located} of ${state.rows.length} loaded releases mapped${state.total>state.rows.length?' · Load more below':''}`);}
function fitMap(){if(!map)return;const points=[];function collect(c){if(typeof c[0]==='number')points.push(c);else c.forEach(collect);}for(const p of visiblePatches())collect(p.coords);if(points.length)map.fitBounds(L.latLngBounds(points),{padding:[20,20],maxZoom:10});}
async function loadMembers(){const {data,error}=await client.from('desk_members').select('*').order('created_at',{ascending:false});if(error){message('#admin-message',error.message);return;}const root=$('#members');root.replaceChildren();
 for(const member of data){const line=text('div','','member'),info=text('div',member.email);info.append(text('small',member.is_admin?'Administrator':member.approved?'Approved':'Awaiting Owen’s approval'));line.append(info);
 if(member.user_id!==state.session.user.id){const btn=text('button',member.approved?'Revoke access':'Approve access');btn.addEventListener('click',async()=>{btn.disabled=true;const {error}=await client.rpc('desk_set_approval',{target:member.user_id,allow_access:!member.approved});if(error){message('#admin-message',error.message);btn.disabled=false;}else{message('#admin-message','Account access updated.');await loadMembers();}});line.append(btn);}root.append(line);}}
$('#toggle-signup').onclick=()=>{signup=!signup;message('#auth-submit',signup?'Create account':'Sign in');message('#toggle-signup',signup?'Already have an account? Sign in':'Create an account');$('#password').autocomplete=signup?'new-password':'current-password';message('#auth-message','');};
$('#auth-form').onsubmit=async event=>{event.preventDefault();$('#auth-submit').disabled=true;message('#auth-message','');try{const email=$('#auth-email').value.trim(),password=$('#password').value;let result;
 if(recovery){result=await client.auth.updateUser({password});if(result.error)throw result.error;recovery=false;message('#auth-message','Password updated.');await onSession((await client.auth.getSession()).data.session);}
 else if(signup){result=await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}});if(result.error)throw result.error;message('#auth-message','Check your email to verify your account. Owen must then approve your access.');}
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
$('#refresh').onclick=()=>{loadReleases();pollHealth();if(state.member?.is_admin)loadMembers();};
$('#show-overlays').onchange=renderMap;$('#fit-map').onclick=fitMap;
async function init(){if(!config?.supabaseUrl||!config?.supabasePublishableKey){$('#setup').hidden=false;document.querySelectorAll('#auth button,#auth input').forEach(el=>el.disabled=true);return;}
 let secretInBrowser=config.supabasePublishableKey.startsWith('sb_secret_');
 if(config.supabasePublishableKey.startsWith('eyJ')){try{secretInBrowser=JSON.parse(atob(config.supabasePublishableKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role!=='anon';}catch{secretInBrowser=true;}}
 if(secretInBrowser){message('#setup','Invalid browser configuration. Contact Owen.');$('#setup').hidden=false;return;}
 try{client=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey);const forces=await (await fetch('./forces.json')).json();for(const f of forces){if((f.type||'police')!=='police')continue;const option=text('option',f.name);option.value=f.key;$('#force').append(option);}
 client.auth.onAuthStateChange((event,session)=>{if(event==='TOKEN_REFRESHED'){state.session=session;return;}if(event==='PASSWORD_RECOVERY'){recovery=true;$('#auth-email').required=false;$('#auth-email').parentElement.hidden=true;message('#auth-submit','Set new password');$('#toggle-signup').hidden=true;$('#forgot').hidden=true;$('#password').autocomplete='new-password';}setTimeout(()=>onSession(session),0);});
 await pollHealth();setInterval(()=>{pollHealth();if(state.session&&!recovery)membership().then(m=>{if(!m?.approved){clearDesk();$('#waiting').hidden=false;}else if(!state.busy&&!$('#desk').hidden)loadReleases(false,true);}).catch(()=>{clearDesk();$('#waiting').hidden=false;message('#waiting-message','Access could not be checked. Please retry.');});},30000);setInterval(renderHealth,5000);
 }catch(e){message('#auth-message','The desk could not connect. '+e.message);}}
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
