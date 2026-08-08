'use strict';

// Free, 100%-local smart search over the dataset — keyword retrieval with a
// deterministic (non-AI) summary. No external API, no cost, no API key.

const STOPWORDS = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'of', 'in', 'on', 'for', 'to', 'and', 'or',
  'which', 'what', 'how', 'many', 'does', 'do', 'with', 'that', 'this', 'has', 'have']);

function tokenize(text) {
  return String(text).toLowerCase().match(/[a-z0-9'+-]+/g) || [];
}

function recordSearchableText(r) {
  return [
    r.enzyme, r.organism, r.family, r.genus, r.species, r.acceptorClass,
    r.primaryDonor, ...(r.allAcceptedDonors || []), ...(r.acceptedMetals || []),
    ...(r.acceptedAcceptors || []), r.expressionHost, r.author, r.doi, r.origin,
    r.year, r.product,
  ].filter(Boolean).join(' ').toLowerCase();
}

/** Keyword retrieval: score every record by query-term overlap, return the top N. */
function retrieveRelevantRecords(question, records, topN = 20) {
  const terms = tokenize(question).filter((t) => !STOPWORDS.has(t) && t.length > 1);
  if (terms.length === 0) return { matches: records.slice(0, topN), terms };

  const scored = records.map((r) => {
    const text = recordSearchableText(r);
    let score = 0;
    for (const term of terms) {
      if (text.includes(term)) score += 1;
      if (r.enzyme && r.enzyme.toLowerCase() === term) score += 3;
    }
    return { r, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const withHits = scored.filter((s) => s.score > 0);
  return { matches: withHits.slice(0, topN).map((s) => s.r), terms };
}

function mostCommon(values) {
  const counts = new Map();
  values.forEach((v) => { if (v) counts.set(v, (counts.get(v) || 0) + 1); });
  let best = null, bestCount = 0;
  for (const [v, c] of counts.entries()) if (c > bestCount) { best = v; bestCount = c; }
  return best ? { value: best, count: bestCount } : null;
}

/** A short, deterministic (rule-based, not AI-generated) summary of the matches. */
function summarize(matches, totalCount) {
  if (matches.length === 0) return 'No records matched this query in the current filtered set.';
  const plant = matches.filter((r) => r.origin === 'Plant').length;
  const fungal = matches.filter((r) => r.origin === 'Fungal').length;
  const topClass = mostCommon(matches.map((r) => r.acceptorClass));
  const topDonor = mostCommon(matches.flatMap((r) => r.allAcceptedDonors));

  const bits = [`${matches.length} of ${totalCount} records match`];
  bits.push(`${plant} plant, ${fungal} fungal`);
  if (topClass) bits.push(`most common acceptor class: ${topClass.value} (${topClass.count})`);
  if (topDonor) bits.push(`most common donor: ${topDonor.value} (${topDonor.count})`);
  return bits.join(' — ');
}

function searchRecords(question, records, topN = 20) {
  const { matches, terms } = retrieveRelevantRecords(question, records, topN);
  return {
    ok: true,
    summary: summarize(matches, records.length),
    matchedTerms: terms,
    totalCount: records.length,
    matchCount: matches.length,
    records: matches.map((r) => ({
      id: r.id, enzyme: r.enzyme, origin: r.origin, family: r.family, genus: r.genus,
      acceptorClass: r.acceptorClass, primaryDonor: r.primaryDonor,
      allAcceptedDonors: r.allAcceptedDonors, acceptedMetals: r.acceptedMetals,
      expressionHost: r.expressionHost, year: r.year, author: r.author, doi: r.doi,
    })),
  };
}

module.exports = { searchRecords, retrieveRelevantRecords };
