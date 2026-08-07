'use strict';

const express = require('express');
const store = require('../store');
const { applyFilters, allBivariate, statisticalAnalysis, biologicalInsights, literature } = require('../analysis');

const router = express.Router();

router.get('/bivariate', (req, res) => {
  const filtered = applyFilters(store.state.records, req.query);
  res.json(allBivariate(filtered));
});

router.get('/stats', (req, res) => {
  const filtered = applyFilters(store.state.records, req.query);
  res.json(statisticalAnalysis(filtered));
});

router.get('/insights', (req, res) => {
  const filtered = applyFilters(store.state.records, req.query);
  res.json(biologicalInsights(filtered));
});

router.get('/literature', (req, res) => {
  const filtered = applyFilters(store.state.records, req.query);
  res.json(literature(filtered));
});

module.exports = router;
