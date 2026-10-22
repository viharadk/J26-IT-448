const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const SOURCES = Object.freeze([
  { id: 'emsr205', url: 'https://mapping.emergency.copernicus.eu/activations/EMSR205/' },
  { id: 'nsdi-layer6', url: 'https://gisapps.nsdi.gov.lk/server/rest/services/SLNSDI/Geo_Scientific_Information/MapServer/6?f=pjson' },
  { id: 'unspider2017', url: 'https://un-spider.org/advisory-support/emergency-support/10996/floods-and-landslides-sri-lanka' }
]);
const SUPPORTING = Object.freeze([
  { filename: 'nsdi-categories.json', url: SOURCES[1].url.replace('?f=pjson', '/query?where=1%3D1&outFields=layer_name_riskinfo&returnGeometry=false&returnDistinctValues=true&f=pjson') },
  { filename: 'nsdi-kelani-may2016.geojson', url: SOURCES[1].url.replace('?f=pjson', '/query?where=layer_name_riskinfo%3D%27Kelani%20River%20Floods%20May%202016%27&outFields=*&returnGeometry=true&outSR=4326&f=geojson') },
  { filename: 'iwmi-overview.png', url: 'https://un-spider.org/sites/default/files/Flood_SL_May2017-1-a.png' },
  ...[['29', '0BwGSKucj4pXQbHctV2FkV2d0bzQ'], ['30', '0BwGSKucj4pXQMC1QUzY0ZlNKWlk'], ['31', '0BwGSKucj4pXQSjJvekZYMEdpd3M']].map(([day, id]) => ({ filename: `iwmi-${day}may-drive.html`, url: `https://drive.google.com/drive/folders/${id}` })),
  { filename: 'copernicus-terms.html', url: 'https://mapping.emergency.copernicus.eu/terms-and-conditions/' }
]);
async function acquire(url, folder, filename) {
  const record = { requestedUrl: url, requestedAt: new Date().toISOString(), filename };
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    const buffer = Buffer.from(await response.arrayBuffer());
    Object.assign(record, { resolvedUrl: response.url, status: response.status, contentType: response.headers.get('content-type'),
      bytes: buffer.length, sha256: crypto.createHash('sha256').update(buffer).digest('hex'), ok: response.ok });
    if (new URL(response.url).hostname === 'accounts.google.com') record.datasetAcquisitionStatus = 'SIGN_IN_HTML_NOT_GEODATA';
    await fs.writeFile(path.join(folder, filename), buffer);
  } catch (error) { Object.assign(record, { ok: false, error: error.message, cause: error.cause?.code }); }
  const logFile = path.join(folder, 'acquisition-log.jsonl');
  await fs.appendFile(logFile, JSON.stringify(record) + '\n');
  return record;
}
async function main(args = process.argv.slice(2)) {
  const folder = path.resolve(__dirname, '..', 'artifacts', 'phase6a-reference-acquisition');
  await fs.mkdir(folder, { recursive: true });
  if (args[0] === '--supporting') {
    const records = await Promise.all(SUPPORTING.map(item => acquire(item.url, folder, item.filename)));
    records.forEach(record => console.log(JSON.stringify(record)));
    if (records.some(record => !record.ok)) process.exitCode = 1;
    return;
  }
  if (args[0] === '--products') {
    const html = await fs.readFile(path.join(folder, 'emsr205.html'), 'utf8');
    const urls = [...html.matchAll(/href="([^"]+(?:vector\.zip|200dpi\.pdf))"/g)].map(match => match[1]);
    if (urls.length !== 10) throw new Error(`Expected five map PDFs and five vectors; inspect changed source page (${urls.length} links).`);
    const records = await Promise.all(urls.map(url => acquire(url, folder, url.split('/').pop())));
    records.forEach(record => console.log(JSON.stringify(record)));
    if (records.some(record => !record.ok)) process.exitCode = 1;
    return;
  }
  if (args.length) {
    if (args.length !== 2 || path.basename(args[1]) !== args[1]) throw new Error('Usage: node scripts/acquire-phase6a-reference.js [official-url basename]');
    const record = await acquire(args[0], folder, args[1]);
    console.log(JSON.stringify(record));
    if (!record.ok) process.exitCode = 1;
  } else {
    const records = await Promise.all(SOURCES.map(source => acquire(source.url, folder, source.id + (source.id === 'nsdi-layer6' ? '.json' : '.html'))));
    records.forEach(record => console.log(JSON.stringify(record)));
    if (records.some(record => !record.ok)) process.exitCode = 1;
  }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { SOURCES, SUPPORTING, acquire };
