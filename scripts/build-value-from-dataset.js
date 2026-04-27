/**
 * Build public/data/value.json, segmentation_analysis.json, volume.json
 * from Dataset-Global Spectral Sensor Market.xlsx (Master Sheet).
 * CAGR is taken from the "Value" sheet (Excel) per segment path — not recalculated.
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
const CAGRCOL = 14;

const TOP_REGIONS = new Set([
  'Global',
  'North America',
  'Europe',
  'Asia Pacific',
  'Latin America',
  'Middle East & Africa',
  'U.S.',
  'Canada',
  'U.K.',
  'Germany',
  'France',
  'Italy',
  'Spain',
  'Russia',
  'China',
  'India',
  'Japan',
  'South Korea',
  'ASEAN',
  'Australia',
  'Brazil',
  'Argentina',
  'Mexico',
  'GCC',
  'South Africa',
  'Rest of Europe',
  'Rest of Asia Pacific',
  'Rest of Latin America',
  'Rest of Middle East & Africa',
]);

const OFFERING_TIERS = new Set(['Hardware', 'Software', 'Services']);
/** Data rows that are product lines under "Sensors & Detectors" (Value sheet order under Hardware) */
const SENSORS_DETECTOR_LEAF_NAMES = new Set([
  'Hyperspectral Sensors',
  'Multispectral Sensors',
  'Non-Imaging Spectral Sensor Modules / Detector Modules',
]);

function round4(n) {
  return Math.round(n * 10000) / 10000;
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

/**
 * Value sheet: CAGR in column 14 is stored as a decimal (e.g. 0.099 = 9.9%).
 * Convert to a string with one decimal, matching the Excel "Percentage" style.
 */
function cagrDecToString(dec) {
  if (dec === null || dec === undefined || (typeof dec === 'number' && (isNaN(dec) || !isFinite(dec)))) {
    return '0%';
  }
  if (typeof dec === 'string') {
    const t = String(dec).replace('%', '').trim();
    const n = parseFloat(t, 10);
    if (isNaN(n)) return '0%';
    if (n > 0 && n <= 1) return `${(n * 100).toFixed(1)}%`;
    return `${n.toFixed(1)}%`;
  }
  if (typeof dec === 'number' && dec >= -1 && dec <= 1) {
    return `${(dec * 100).toFixed(1)}%`;
  }
  return `${Number(dec).toFixed(1)}%`;
}

/**
 * Walk one Value-sheet region block (from first row after region title to next top header).
 * Returns Map: fullKey -> "9.9%" where fullKey = `${region}::${dedupedPath.join('||')}`.
 */
function buildCagrMapForRegionBlock(vRows, startR, endR, region) {
  const map = new Map();
  let stack = [];
  let inSensorsDetectorChildren = false;

  for (let r = startR; r < endR; r++) {
    const row = vRows[r];
    if (!row) break;
    const label = String(row[0] || '').trim();
    if (!label) continue;

    const isData = typeof row[1] === 'number' && !isNaN(row[1]);
    const cagrDec = row[CAGRCOL];

    if (!isData) {
      if (TOP_REGIONS.has(label)) {
        // New region in same file — only when scanning a slice; usually skip
        continue;
      }
      if (/^By /.test(label)) {
        stack = [label];
        inSensorsDetectorChildren = false;
        continue;
      }
      if (OFFERING_TIERS.has(label) && stack[0] === 'By Offering') {
        stack = ['By Offering', label];
        inSensorsDetectorChildren = false;
        continue;
      }
      continue;
    }

    // Data row
    let pathParts;
    if (inSensorsDetectorChildren && SENSORS_DETECTOR_LEAF_NAMES.has(label)) {
      pathParts = dedupePathParts([...stack, 'Sensors & Detectors', label]);
    } else if (inSensorsDetectorChildren) {
      // Sibling of Sensors & Detectors (e.g. Spectral Separation) at Hardware level
      inSensorsDetectorChildren = false;
      pathParts = dedupePathParts([...stack, label]);
    } else {
      pathParts = dedupePathParts([...stack, label]);
    }

    const fullKey = `${region}::${pathParts.join('||')}`;
    map.set(fullKey, cagrDecToString(cagrDec));

    // After recording "Sensors & Detectors" as its own data row under Hardware, next 3 are children
    if (
      label === 'Sensors & Detectors' &&
      stack.length === 2 &&
      stack[0] === 'By Offering' &&
      stack[1] === 'Hardware'
    ) {
      inSensorsDetectorChildren = true;
    } else if (inSensorsDetectorChildren) {
      if (SENSORS_DETECTOR_LEAF_NAMES.has(label)) {
        if (label === 'Non-Imaging Spectral Sensor Modules / Detector Modules') {
          inSensorsDetectorChildren = false;
        }
        // if last child, clear — Non-Imaging... is the last
      } else {
        inSensorsDetectorChildren = false;
      }
    }
  }

  return map;
}

function findValueRegionBlocks(vRows) {
  const blocks = [];
  for (let r = 0; r < vRows.length; r++) {
    const label = String(vRows[r][0] || '').trim();
    if (TOP_REGIONS.has(label) && typeof vRows[r][1] !== 'number') {
      blocks.push({ region: label, start: r + 1 });
    }
  }
  for (let i = 0; i < blocks.length; i++) {
    blocks[i].end = i + 1 < blocks.length ? blocks[i + 1].start - 1 : vRows.length;
  }
  return blocks;
}

/**
 * Full workbook: map `${region}::${path...}` -> "x.x%"
 */
function buildCagrMapFromValueSheet(wb) {
  const sh = wb.Sheets['Value'];
  if (!sh) {
    console.warn('No "Value" sheet — CAGRs will be computed from 2021/2033 in Master only.');
    return new Map();
  }
  if (sh['!ref']) {
    const range = XLSX.utils.decode_range(sh['!ref']);
    range.e.r = Math.min(range.e.r, 5000);
    sh['!ref'] = XLSX.utils.encode_range(range);
  }
  const vRows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });
  const blocks = findValueRegionBlocks(vRows);
  const merged = new Map();
  for (const b of blocks) {
    const part = buildCagrMapForRegionBlock(vRows, b.start, b.end, b.region);
    part.forEach((v, k) => merged.set(k, v));
  }
  return merged;
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

function cagrString(v0, v1) {
  if (!v0 || v0 <= 0) return '0%';
  const yearsSpan = 12; // 2021->2033
  const c = (Math.pow(v1 / v0, 1 / yearsSpan) - 1) * 100;
  return `${c.toFixed(1)}%`;
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
  const cagrByPath = buildCagrMapFromValueSheet(wb);

  const sheet = wb.Sheets['Master Sheet'];
  if (!sheet) {
    console.error('No Master Sheet');
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const valueData = {};
  const geoSet = new Set();
  let cagrFromExcel = 0;
  let cagrFallback = 0;

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

    const yearObj = buildYearObject(row);
    const k = `${region}::${path.join('||')}`;
    if (cagrByPath.has(k)) {
      yearObj.CAGR = cagrByPath.get(k);
      cagrFromExcel++;
    } else {
      cagrFallback++;
    }

    setDeepLeaf(valueData[region], path, yearObj);
  }

  console.log(`CAGR: ${cagrFromExcel} from Value sheet, ${cagrFallback} fallback (not matched)`);

  const allGeos = [...geoSet];
  const priority = (g) => {
    const order = [
      'Global', 'North America', 'U.S.', 'Canada', 'Europe', 'U.K.', 'Germany', 'Italy', 'France', 'Spain', 'Russia', 'Rest of Europe',
      'Asia Pacific', 'China', 'India', 'Japan', 'South Korea', 'ASEAN', 'Australia', 'Rest of Asia Pacific',
      'Latin America', 'Brazil', 'Argentina', 'Mexico', 'Rest of Latin America',
      'Middle East & Africa', 'GCC', 'South Africa', 'Rest of Middle East & Africa',
    ];
    const i = order.indexOf(g);
    return i === -1 ? 1000 + g.localeCompare('') : i;
  };
  allGeos.sort((a, b) => priority(a) - priority(b) || a.localeCompare(b));

  const ordered = {};
  for (const g of allGeos) {
    if (valueData[g]) ordered[g] = valueData[g];
  }

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
