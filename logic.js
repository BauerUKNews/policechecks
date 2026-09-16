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
