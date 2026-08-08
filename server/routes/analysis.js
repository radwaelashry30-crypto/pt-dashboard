'use strict';

const express = require('express');
const store = require('../store');
const { applyFilters, allBivariate, statisticalAnalysis, biologicalInsights, literature } = require('../analysis');
const { askQuestion } = require('../rag');

const router = express.Router();

router.post('/ask', express.json(), async (req, res) => {
  const question = (req.body?.question || '').trim();
  if (!question) return res.status(400).json({ ok: false, error: 'Missing "question" in request body.' });
  if (question.length > 500) return res.status(400).json({ ok: false, error: 'Question is too long (max 500 characters).' });

  const filtered = applyFilters(store.state.records, req.body?.filters || {});
  const result = await askQuestion(question, filtered);
  if (!result.ok) return res.status(result.error.includes('not configured') ? 503 : 502).json(result);
  res.json(result);
});

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
