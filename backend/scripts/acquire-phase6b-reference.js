const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { acquire } = require('./acquire-phase6a-reference');
const ROOT = path.resolve(__dirname, '..');
const FOLDER = path.join(ROOT, 'artifacts/phase6b-feasibility');
const SOURCES = [
  { filename: 'survey-2016.html', url: 'https://survey.gov.lk/sdweb/pages_feature_products.php?id=5&link=ad7f4ea4f67f571c2b23aea179c6318a307fcd7e' },
  { filename: 'dmc-reports.html', url: 'https://www.dmc.gov.lk/index.php?Itemid=275&lang=en&limit=0&option=com_dmcreports&report_type_id=3&view=reports' }
];
const LINKED = [
  { filename: 'survey-kelaniya.html', url: 'https://survey.gov.lk/sdweb/pages_feature_products.php?link=d52054357cb0145728bb0e02cc71c0acc500b7f5&id=4' },
  { filename: 'survey-kelaniya-2016.pdf', url: 'https://survey.gov.lk/sdweb/pdf/flood_map/Flood_Map_2016_June_03_kelaniya.pdf' },
  { filename: 'survey-gampaha-2016.pdf', url: 'https://survey.gov.lk/sdweb/pdf/flood_map/Flood_Map_2016_June_09_Gampaha.pdf' },
  { filename: 'survey-kelaniya-2016-kml-response.html', url: 'https://drive.google.com/uc?export=download&id=0BwtHKWY5sCyVZzViVEdNTXZvekE' },
  { filename: 'survey-gampaha-2016-kml-response.html', url: 'https://drive.google.com/uc?export=download&id=0BwtHKWY5sCyVUGNHZmZjVEotSkE' },
  { filename: 'irrigation-may2016.pdf', url: 'https://www.irrigation.gov.lk/web/images/Hydrological-Annual/8_Hydrological_Annual_2014-2015.pdf' },
  { filename: 'esa-roanu2016.html', url: 'https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Sentinel-1/Sentinel-1_helping_Cyclone_Roanu_relief' },
  ...['2016', 'Kelani', '2017'].map(search => ({ filename: `dmc-search-${search.toLowerCase()}.html`,
    url: `https://www.dmc.gov.lk/index.php?option=com_dmcreports&view=reports&Itemid=275&search=${search}&report_type_id=3&limit=0&lang=en` })),
  { filename: 'unspider-2017-followup.html', url: 'https://un-spider.org/advisory-support/emergency-support/10996/floods-and-landslides-sri-lanka' },
  { filename: 'iwmi-may30-2017-response.html', url: 'https://drive.google.com/drive/folders/0BwGSKucj4pXQMC1QUzY0ZlNKWlk' }
];
async function main(args = process.argv.slice(2)) {
  await fs.mkdir(FOLDER, { recursive: true });
  if (args[0] === '--linked') {
    for (let i = 0; i < LINKED.length; i += 4) {
      const records = await Promise.all(LINKED.slice(i, i + 4).map(source => acquire(source.url, FOLDER, source.filename)));
      records.forEach(record => console.log(JSON.stringify(record)));
      if (records.some(record => !record.ok)) process.exitCode = 1;
    }
    return;
  }
  if (args.length) {
    if (args.length !== 2 || path.basename(args[1]) !== args[1]) throw new Error('Usage: node scripts/acquire-phase6b-reference.js [official-url basename]');
    const record = await acquire(args[0], FOLDER, args[1]);
    console.log(JSON.stringify(record)); if (!record.ok) process.exitCode = 1;
    return;
  }
  const records = await Promise.all(SOURCES.map(source => acquire(source.url, FOLDER, source.filename)));
  records.forEach(record => console.log(JSON.stringify(record)));
  const nsdiFile = 'nsdi-kelani-may2016.geojson';
  const source = path.join(ROOT, 'artifacts/phase6a-reference-acquisition', nsdiFile);
  const bytes = await fs.readFile(source);
  await fs.writeFile(path.join(FOLDER, nsdiFile), bytes);
  await fs.writeFile(path.join(FOLDER, 'nsdi-reuse-provenance.json'), JSON.stringify({ sourceFile: path.relative(ROOT, source),
    reusedAt: new Date().toISOString(), sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    originalAcquisitionLog: 'artifacts/phase6a-reference-acquisition/acquisition-log.jsonl',
    officialLayer: 'https://gisapps.nsdi.gov.lk/server/rest/services/SLNSDI/Geo_Scientific_Information/MapServer/6' }, null, 2));
  if (records.some(record => !record.ok)) process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { FOLDER, SOURCES, LINKED };
