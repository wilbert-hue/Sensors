/**
 * Import Customer Database_Spectral Sensors Market.xlsx -> public/data/customer_database.json
 * Preserves the exact column headers from sheet "Customer Database" (row 5 sub-headers; row 4
 * for cells merged/empty in row 5, e.g. S.No.).
 * Run: node scripts/import-customer-database.js
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'Customer Database_Spectral Sensors Market.xlsx');
const OUT = path.join(ROOT, 'public', 'data', 'customer_database.json');
const HEADER_ROW_TOP = 4; // 0-based: "S.No." + group headers
const HEADER_ROW_DETAIL = 5; // 0-based: full column titles
const DATA_START_ROW = 6; // 0-based: first data row

function normalizeHeader(s) {
  return String(s || '')
    .replace(/\r\n/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error('Missing:', SRC);
    process.exit(1);
  }
  const wb = XLSX.readFile(SRC);
  if (!wb.Sheets['Customer Database']) {
    console.error('Sheet "Customer Database" not found. Sheets:', wb.SheetNames);
    process.exit(1);
  }
  const sh = wb.Sheets['Customer Database'];
  if (sh['!ref']) {
    const r = XLSX.utils.decode_range(sh['!ref']);
    r.e.r = Math.min(r.e.r, 5000);
    sh['!ref'] = XLSX.utils.encode_range(r);
  }
  const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });
  const hTop = rows[HEADER_ROW_TOP] || [];
  const hDetail = rows[HEADER_ROW_DETAIL] || [];
  const colCount = Math.max(hTop.length, hDetail.length, 23);

  // Row 4: group titles (S.No., Customer Information, Contact Details, …); forward-fill for merged cells
  let currentGroup = '';
  const columns = [];
  for (let i = 0; i < colCount; i++) {
    const g = normalizeHeader(hTop[i]);
    if (g) {
      currentGroup = g;
    }
    const d = normalizeHeader(hDetail[i]);
    const t = normalizeHeader(hTop[i]);
    const headerText = d || t || `Column ${i + 1}`;
    columns.push({
      key: `c${i}`,
      header: headerText,
      group: currentGroup || '—',
    });
  }

  const records = [];
  for (let r = DATA_START_ROW; r < rows.length; r++) {
    const row = rows[r] || [];
    const customerName = String(row[1] || '')
      .replace(/\r\n/g, ' ')
      .trim();
    if (!customerName) continue;

    const rec = {};
    columns.forEach((col, i) => {
      const v = row[i];
      if (i === 0) {
        if (v !== '' && v !== undefined && v !== null) {
          rec[col.key] = typeof v === 'number' && !Number.isNaN(v) ? v : Number(v) || String(v).trim();
        } else {
          rec[col.key] = r - HEADER_ROW_DETAIL;
        }
        return;
      }
      if (v === null || v === undefined || v === '') {
        rec[col.key] = '';
        return;
      }
      if (typeof v === 'number' && !Number.isNaN(v)) {
        rec[col.key] = v;
      } else {
        rec[col.key] = String(v).replace(/\r\n/g, ' ').trim();
      }
    });
    records.push(rec);
  }

  const meta = {
    sourceFile: 'Customer Database_Spectral Sensors Market.xlsx',
    sheet: 'Customer Database',
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ meta, columns, records }, null, 2), 'utf8');
  console.log('Wrote', OUT, 'columns', columns.length, 'rows', records.length);
}

main();
