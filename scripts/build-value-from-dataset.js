/**
 * Build public/data/value.json, segmentation_analysis.json, volume.json
 * from Dataset-Global Spectral Sensor Market.xlsx (Master Sheet).
 *
 * Run: node scripts/build-value-from-dataset.js
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ROOT = path.join(__dirname, '..');
const XLSX_PATH = path.join(ROOT, 'Dataset-Global Spectral Sensor Market.xlsx');
const OUT_DIR = path.join(ROOT, 'public', 'data');

const years = [2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033];

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

function cagrString(v0, v1) {
  if (!v0 || v0 <= 0) return '0%';
  const yearsSpan = 12; // 2021->2033
  const c = (Math.pow(v1 / v0, 1 / yearsSpan) - 1) * 100;
  return `${c.toFixed(1)}%`;
}

function dedupePathParts(parts) {
  const out = [];
  for (const p of parts) {
    const t = String(p || '').trim();
    if (!t) continue;
    if (out[out.length - 1] !== t) out.push(t);
  }
  return out;
}

function setDeepLeaf(root, pathKeys, yearObj) {
  let o = root;
  for (let i = 0; i < pathKeys.length - 1; i++) {
    const k = pathKeys[i];
    if (!o[k] || typeof o[k] !== 'object') o[k] = {};
    o = o[k];
  }
  const leaf = pathKeys[pathKeys.length - 1];
  o[leaf] = { ...yearObj, CAGR: yearObj.CAGR };
}

function buildYearObject(row) {
  const o = {};
  for (let i = 0; i < years.length; i++) {
    const y = String(years[i]);
    const raw = row[5 + i];
    const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/,/g, '')) || 0;
    o[y] = round4(n);
  }
  o.CAGR = cagrString(o['2021'], o['2033']);
  return o;
}

function stripYearData(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (/^\d{4}$/.test(k) || k === 'CAGR') continue;
    out[k] = typeof v === 'object' && v !== null && !Array.isArray(v) ? stripYearData(v) : {};
  }
  return out;
}

function main() {
  if (!fs.existsSync(XLSX_PATH)) {
    console.error('Missing:', XLSX_PATH);
    process.exit(1);
  }

  const wb = XLSX.readFile(XLSX_PATH);
  const sheet = wb.Sheets['Master Sheet'];
  if (!sheet) {
    console.error('No Master Sheet');
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const valueData = {};
  const geoSet = new Set();

  for (let r = 6; r < rows.length; r++) {
    const row = rows[r];
    const region = String(row[0] || '').trim();
    const seg = String(row[1] || '').trim();
    if (!region || !seg) continue;
    if (region === 'Region' || seg === 'Segment') continue;

    const path = dedupePathParts([row[1], row[2], row[3], row[4]]);
    if (path.length === 0) continue;

    if (!valueData[region]) valueData[region] = {};
    geoSet.add(region);
    setDeepLeaf(valueData[region], path, buildYearObject(row));
  }

  // Stable geography order: Global first, then common macro regions, then rest A–Z
  const allGeos = [...geoSet];
  const priority = (g) => {
    const order = [
      'Global', 'North America', 'U.S.', 'Canada', 'Europe', 'U.K.', 'Germany', 'Italy', 'France', 'Spain', 'Russia', 'Rest of Europe',
      'Asia Pacific', 'China', 'India', 'Japan', 'South Korea', 'ASEAN', 'Australia', 'Rest of Asia Pacific',
      'Latin America', 'Brazil', 'Argentina', 'Mexico', 'Rest of Latin America',
      'Middle East & Africa', 'GCC', 'South Africa', 'Rest of Middle East & Africa'
    ];
    const i = order.indexOf(g);
    return i === -1 ? 1000 + g.localeCompare('') : i;
  };
  allGeos.sort((a, b) => priority(a) - priority(b) || a.localeCompare(b));

  const ordered = {};
  for (const g of allGeos) {
    if (valueData[g]) ordered[g] = valueData[g];
  }

  // Volume: same structure, values scaled to synthetic Mn units (structure only; UI hides volume)
  const volScale = 1e-3;
  function scaleYears(obj) {
    if (!obj || typeof obj !== 'object') return;
    for (const k of Object.keys(obj)) {
      if (/^\d{4}$/.test(k)) {
        const v = obj[k];
        if (typeof v === 'number') obj[k] = round4(v * volScale);
      } else if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
        if (k === 'CAGR') continue;
        scaleYears(obj[k]);
      }
    }
  }
  const volumeData = JSON.parse(JSON.stringify(ordered));
  scaleYears(volumeData);

  const segAnalysis = stripYearData(ordered);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'value.json'), JSON.stringify(ordered, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'segmentation_analysis.json'), JSON.stringify(segAnalysis, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'volume.json'), JSON.stringify(volumeData, null, 2));

  console.log('Wrote value.json, segmentation_analysis.json, volume.json');
  console.log('Geographies:', allGeos.length, allGeos.slice(0, 8).join(', '), '...');
}

main();
