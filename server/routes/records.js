'use strict';

const express = require('express');
const { stringify } = require('csv-stringify/sync');
const store = require('../store');
const { applyFilters } = require('../analysis');

const router = express.Router();

function paginate(records, req) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize) || 50));
  const start = (page - 1) * pageSize;
  return { page, pageSize, total: records.length, rows: records.slice(start, start + pageSize) };
}

router.get('/', (req, res) => {
  const filtered = applyFilters(store.state.records, req.query);
  const sortField = req.query.sortField || 'id';
  const sortDir = req.query.sortDir === 'desc' ? -1 : 1;
  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortField]; const bv = b[sortField];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sortDir;
    return String(av).localeCompare(String(bv)) * sortDir;
  });
  const result = paginate(sorted, req);
  res.json(result);
});

router.get('/entities/:kind', (req, res) => {
  const filtered = applyFilters(store.state.records, req.query);
  const kind = req.params.kind;
  let rows = [];
  if (kind === 'donors') {
    rows = filtered.flatMap((r) => r.allAcceptedDonors.map((d) => ({ recordId: r.id, enzyme: r.enzyme, origin: r.origin, donor: d })));
  } else if (kind === 'metals') {
    rows = filtered.flatMap((r) => r.acceptedMetals.map((m) => ({ recordId: r.id, enzyme: r.enzyme, origin: r.origin, metal: m })));
  } else if (kind === 'acceptors') {
    rows = filtered.flatMap((r) => r.acceptedAcceptors.map((a) => ({ recordId: r.id, enzyme: r.enzyme, origin: r.origin, acceptor: a })));
  } else {
    return res.status(400).json({ error: `Unknown entity kind "${kind}"` });
  }
  res.json({ total: rows.length, rows });
});

router.get('/export.csv', (req, res) => {
  const filtered = applyFilters(store.state.records, req.query);
  const rows = filtered.map((r) => ({
    id: r.id, enzyme: r.enzyme, origin: r.origin, acceptorClass: r.acceptorClass, family: r.family,
    genus: r.genus, species: r.species, expressionHost: r.expressionHost, year: r.year,
    primaryDonor: r.primaryDonor, allAcceptedDonors: r.allAcceptedDonors.join('; '),
    acceptedMetals: r.acceptedMetals.join('; '), regio: r.regioTokens.join('; '),
    ph: r.ph.mid, temperature: r.temp.mid, dataCompleteness: r.dataCompleteness,
    promiscuousDmapp: r.promiscuousDmapp, author: r.author, year_2: r.year, doi: r.doi,
    sourceRow: r.sourceRow,
  }));
  const csv = stringify(rows, { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="pt-atlas-filtered-records.csv"');
  res.send(csv);
});

router.get('/:id', (req, res) => {
  const rec = store.state.records.find((r) => String(r.id) === req.params.id);
  if (!rec) return res.status(404).json({ error: 'Record not found' });
  const raw = require('../db').getDb()
    .prepare('SELECT raw_json FROM raw_rows WHERE version = ? AND sno = ?')
    .get(store.state.meta.version, rec.id);
  res.json({ record: rec, raw: raw ? JSON.parse(raw.raw_json) : null });
});

module.exports = router;
