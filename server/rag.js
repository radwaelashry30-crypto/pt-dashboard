'use strict';

const Anthropic = require('@anthropic-ai/sdk');

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic();
  return client;
}

const STOPWORDS = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'of', 'in', 'on', 'for', 'to', 'and', 'or',
  'which', 'what', 'how', 'many', 'does', 'do', 'with', 'that', 'this', 'has', 'have', 'plant', 'plants', 'fungal', 'fungi']);

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

/** Retrieval: score every record by query-term overlap, return the top N.
 *  This is keyword retrieval, not embeddings — appropriate for ~200 short
 *  structured records where a vector index would be pure overhead. */
function retrieveRelevantRecords(question, records, topN = 15) {
  const terms = tokenize(question).filter((t) => !STOPWORDS.has(t) && t.length > 1);
  if (terms.length === 0) return records.slice(0, topN);

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
  const pool = withHits.length > 0 ? withHits : scored;
  return pool.slice(0, topN).map((s) => s.r);
}

function formatRecordForContext(r) {
  const km = r.kmEntries.map((k) => `${k.label} Km=${k.valueUM}µM(${k.role})`).join('; ') || 'none';
  return [
    `S.No ${r.id} | ${r.enzyme} | ${r.origin} | ${r.organism || 'n/a'}`,
    `  Family: ${r.family || 'n/a'} | Acceptor class: ${r.acceptorClass || 'n/a'}`,
    `  Primary donor: ${r.primaryDonor || 'n/a'} | All accepted donors: ${(r.allAcceptedDonors || []).join(', ') || 'none'}`,
    `  Metals: ${(r.acceptedMetals || []).join(', ') || 'none'} | Regio: ${(r.regioTokens || []).join(', ') || 'n/a'}`,
    `  Expression host: ${r.expressionHost || 'n/a'} | pH: ${r.ph.valid ? r.ph.mid : 'n/a'} | Temp: ${r.temp.valid ? r.temp.mid : 'n/a'}°C`,
    `  Km: ${km}`,
    `  Year: ${r.year || 'n/a'} | Author: ${r.author || 'n/a'} | DOI: ${r.doi || 'n/a'}`,
  ].join('\n');
}

const SYSTEM_PROMPT = `You are a data assistant embedded in the Prenyltransferase Atlas dashboard, a database of characterized plant and fungal aromatic prenyltransferase (PT) enzymes.

You will be given a question and a set of retrieved records (the ones most relevant to the question, out of the full dataset). Answer using ONLY the information in those records — never invent an enzyme, organism, value, or citation that isn't in the provided context.

Rules:
- Every factual claim must be traceable to a specific S.No in the provided records. Cite the S.No and enzyme name inline, e.g. "(S.No 55, AhPT1)".
- If the retrieved records don't contain enough information to answer, say so plainly instead of guessing — do not pad with general biochemistry knowledge not present in the data.
- If the question asks for a count or list, only count/list records actually present in the provided context, and say if the context appears to be a partial/top-N slice rather than the full dataset.
- Keep answers concise and factual — this is a scientific reference tool, not a conversation.`;

async function askQuestion(question, records) {
  const anthropic = getClient();
  if (!anthropic) {
    return {
      ok: false,
      error: 'ANTHROPIC_API_KEY is not configured on this server, so the "Ask the data" feature is unavailable. Set ANTHROPIC_API_KEY in the environment to enable it.',
    };
  }

  const retrieved = retrieveRelevantRecords(question, records, 15);
  const context = retrieved.map(formatRecordForContext).join('\n\n');

  const userContent = `Retrieved records (${retrieved.length} of ${records.length} total in the currently filtered dataset):\n\n${context}\n\nQuestion: ${question}`;

  let response;
  try {
    response = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    });
  } catch (err) {
    return { ok: false, error: `Request to Claude failed: ${err.message}` };
  }

  if (response.stop_reason === 'refusal') {
    return { ok: false, error: 'The model declined to answer this question.', stopDetails: response.stop_details || null };
  }

  const text = response.content.find((b) => b.type === 'text')?.text || '';
  return {
    ok: true,
    answer: text,
    retrievedRecordIds: retrieved.map((r) => r.id),
    retrievedCount: retrieved.length,
    totalCount: records.length,
    usage: response.usage,
  };
}

module.exports = { askQuestion, retrieveRelevantRecords, formatRecordForContext };
