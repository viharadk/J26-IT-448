require("dotenv").config({ quiet: true });
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const express = require("express");
const { inflateSync } = require("node:zlib");
const { createSarPreviewService } = require("../services/sarPreviewService");
const { createSarPreviewRouter } = require("../routes/sarPreviewRoutes");

// Inspect the downloaded PNG itself, rather than treating a transparent XYZ
// response as proof that radar pixels are visible.
function inspectPng(buffer) {
  assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  let width, height, type, depth, interlace;
  const chunks = [];
  for (let offset = 8; offset < buffer.length;) {
    const size = buffer.readUInt32BE(offset), kind = buffer.toString("ascii", offset + 4, offset + 8), data = buffer.subarray(offset + 8, offset + 8 + size);
    if (kind === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    if (kind === "IDAT") chunks.push(data);
    offset += size + 12;
  }
  assert.equal(depth, 8, "Expected 8-bit PNG"); assert.equal(interlace, 0, "Expected non-interlaced PNG");
  assert.ok([0, 2, 4, 6].includes(type), `Unsupported PNG color type ${type}`);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[type], stride = width * channels;
  const packed = inflateSync(Buffer.concat(chunks));
  assert.equal(packed.length, (stride + 1) * height);
  let previous = Buffer.alloc(stride), visiblePixels = 0, minimum = 255, maximum = 0;
  function paeth(a, b, c) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
  for (let y = 0; y < height; y++) {
    const mode = packed[y * (stride + 1)], row = Buffer.alloc(stride);
    assert.ok(mode >= 0 && mode <= 4);
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? row[i - channels] : 0, above = previous[i], upperLeft = i >= channels ? previous[i - channels] : 0;
      const predictor = [0, left, above, Math.floor((left + above) / 2), paeth(left, above, upperLeft)][mode];
      row[i] = (packed[y * (stride + 1) + 1 + i] + predictor) & 255;
    }
    for (let x = 0; x < width; x++) {
      const alpha = type === 6 ? row[x * channels + 3] : type === 4 ? row[x * channels + 1] : 255;
      if (alpha) { visiblePixels++; minimum = Math.min(minimum, row[x * channels]); maximum = Math.max(maximum, row[x * channels]); }
    }
    previous = row;
  }
  return { width, height, colorType: type, visiblePixels, redChannelMinimum: minimum, redChannelMaximum: maximum };
}
function xyz(coordinate, zoom) {
  const [lon, lat] = coordinate, n = 2 ** zoom, radians = lat * Math.PI / 180;
  return { z: zoom, x: Math.floor((lon + 180) / 360 * n), y: Math.floor((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * n) };
}
async function main() {
  const service = createSarPreviewService();
  const quality = await service.pixelQuality();
  console.log("REAL SAR PIXELS", JSON.stringify({ queriedAt: quality.queriedAt, scenes: quality.scenes, common: quality.common, alignment: quality.alignment, statistics: quality.statistics, samples: quality.samples }, null, 2));
  const preview = await service.preview();
  const folder = path.resolve(__dirname, "..", "artifacts", `function2-phase2b-${Date.now()}`);
  await fs.mkdir(folder);
  const checks = [];
  const coordinate = quality.samples[0]?.geometry?.coordinates;
  assert.ok(coordinate, "No valid sample coordinate for real tile verification");
  for (const [name, layer] of Object.entries(preview.layers)) {
    for (const zoom of [11, 13]) {
      const point = xyz(coordinate, zoom);
      const url = layer.tileUrl.replace("{z}", point.z).replace("{x}", point.x).replace("{y}", point.y);
      const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
      assert.equal(response.status, 200); assert.match(response.headers.get("content-type"), /image\/png/);
      const png = Buffer.from(await response.arrayBuffer()), info = inspectPng(png);
      assert.ok(info.visiblePixels > 0, `${name} z${zoom} is entirely transparent`);
      await fs.writeFile(path.join(folder, `${name}-z${zoom}.png`), png);
      checks.push({ layer: name, tile: point, bytes: png.length, ...info });
    }
    const response = await fetch(layer.thumbnailUrl, { signal: AbortSignal.timeout(60000) });
    assert.equal(response.status, 200); assert.match(response.headers.get("content-type"), /image\/png/);
    const png = Buffer.from(await response.arrayBuffer()), info = inspectPng(png);
    assert.ok(info.visiblePixels > 0);
    await fs.writeFile(path.join(folder, `${name}-preview.png`), png);
    checks.push({ layer: name, kind: "thumbnail", bytes: png.length, ...info });
  }
  const app = express(); app.use("/api/sar", createSarPreviewRouter(service));
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  try {
    for (const endpoint of ["preview", "pixel-quality"]) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/sar/${endpoint}`);
      assert.equal(response.status, 200); assert.equal((await response.json()).success, true);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
  await fs.writeFile(path.join(folder, "verification.json"), `${JSON.stringify({ preview, tileAndThumbnailChecks: checks, liveHttpEndpointsPassed: true }, null, 2)}\n`);
  console.log("PASS actual pixels, six nontransparent XYZ tiles, three thumbnails and both live HTTP endpoints.");
  console.log("DOWNLOAD CHECKS", JSON.stringify(checks));
  console.log("Evidence folder:", folder);
}
main().catch(error => {
  console.error("FAIL real SAR preview:", error.code || "ERROR", error.message);
  const detail = typeof error.cause === "string" ? error.cause : error.cause?.message;
  if (detail) console.error("EE detail:", String(detail).slice(0, 1500));
  process.exitCode = 1;
});
