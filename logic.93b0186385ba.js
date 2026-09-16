export function patchSelection(selected, ids, checked) {
 const out = new Set(selected); for (const id of ids) checked ? out.add(id) : out.delete(id); return out;
}
export function markerColour(published, now = Date.now()) {
 const age = (now - Date.parse(published)) / 60000;
 return age < 10 ? '#d62b46' : age < 60 ? '#c38a03' : '#747586';
}
export function safeLink(url) { try { return new URL(url).protocol === 'https:' ? url : null; } catch { return null; } }
export function healthState(value, receivedAt, now = Date.now()) {
 return !!value?.online && now - receivedAt < 100000;
}

export function minutesAgo(published, now = Date.now()) {
 const timestamp = Date.parse(published);
 if (!Number.isFinite(timestamp)) return 'Time unavailable';
 const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
 return minutes < 1 ? 'Just now' : `${minutes.toLocaleString('en-GB')} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
}

export function releaseFreshness(published, now = Date.now()) {
 const timestamp = Date.parse(published);
 if (!Number.isFinite(timestamp)) return 'older';
 const age = Math.max(0, now - timestamp);
 return age < 5 * 60000 ? 'fresh' : age < 60 * 60000 ? 'recent' : 'older';
}

export function orderedGroups(patches) {
 const rank = name => /^focus\b/i.test(name) ? 0 : /^hub\b/i.test(name) ? 1 : 2;
 return [...new Set(patches.map(p => p.group))].sort((a,b) => rank(a)-rank(b) || a.localeCompare(b,'en-GB',{numeric:true}));
}

export function collectorTime(health, receivedAt, now = Date.now()) {
 const server = Date.parse(health?.server_now);
 return Number.isFinite(server) ? server + now - receivedAt : now;
}

const ukClock = new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hourCycle:'h23',hour:'2-digit',minute:'2-digit',second:'2-digit'});
export function clockDisplay(now = Date.now()) {
 const parts = Object.fromEntries(ukClock.formatToParts(now).map(p => [p.type,p.value]));
 return {text:`${parts.hour}:${parts.minute}:${parts.second}`,red:Number(parts.minute)>=40};
}

export function nextScrapeLabel(health, receivedAt, now = Date.now()) {
 if (!healthState(health,receivedAt,now)) return 'Offline';
 if (health.collector_state === 'scraping') return 'Checking now';
 const next = Date.parse(health.next_run_at);
 if (!Number.isFinite(next)) return 'Schedule unavailable';
 const seconds = Math.ceil((next-collectorTime(health,receivedAt,now))/1000);
 if (seconds <= 0) return 'Due now';
 return `${Math.floor(seconds/60)}m ${String(seconds%60).padStart(2,'0')}s`;
}
