import { checkRasterTiles, getHazardTiles, inspectLocation, inspectionLabel } from '../src/api/flood';

async function main() {
  const signal = new AbortController().signal;
  const tiles = await getHazardTiles(signal);
  console.log('PASS hazard endpoint returned both HTTPS XYZ templates (URLs omitted).');
  await checkRasterTiles(tiles, signal);
  console.log('PASS both sample XYZ tiles downloaded as images.');
  for (const [latitude, longitude] of [[6.925, 79.95], [0, 0]]) {
    const result = await inspectLocation(latitude, longitude, signal);
    if (latitude === 0 && (result.insideClassifiedArea || result.isPermanentWater === true)) throw new Error('Outside-study inspection unexpectedly returned classified data.');
    console.log(`PASS inspect ${latitude}, ${longitude}: ${inspectionLabel(result)}`);
  }
}
main().catch(error => { console.error('FAIL GIS integration:', error.message); process.exitCode = 1; });
