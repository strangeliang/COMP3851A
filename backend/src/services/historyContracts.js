const { StudyError } = require('./studyContracts');
const { correctIndices, validIndices, validAnswer, isCorrect } = require('../../../shared/quiz.mjs');

const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 50000) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

function validateHistory(kind, payload) {
  const invalid = () => { throw new StudyError(400, 'INVALID_HISTORY', 'The study record contains invalid or incomplete data.'); };
  if (!object(payload) || JSON.stringify(payload).length > 200000) invalid();
  if (kind === 'summary') {
    if (!object(payload.summary) || !text(payload.summary.paragraph)
      || !Array.isArray(payload.summary.concepts) || payload.summary.concepts.length > 100
      || payload.summary.concepts.some((c) => !text(c, 5000))) invalid();
  } else if (kind === 'qa') {
    if (!['User', 'AI'].includes(payload.role) || !text(payload.text)) invalid();
  } else if (kind === 'flashcards') {
    if (!Array.isArray(payload.cards) || !payload.cards.length || payload.cards.length > 100
      || payload.cards.some((c) => !object(c) || !text(c.front, 5000) || !text(c.back, 10000)
        || (c.source !== undefined && typeof c.source !== 'string'))) invalid();
  } else if (kind === 'quiz') {
    const qs = payload.questions;
    if (!Array.isArray(qs) || !qs.length || qs.length > 20 || !object(payload.answers)
      || qs.some((q) => !object(q) || !(text(q.id, 100) || Number.isSafeInteger(q.id))
        || ['__proto__', 'constructor', 'prototype'].includes(String(q.id))
        || !text(q.question, 10000) || !Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4
        || q.options.some((o) => !text(o, 5000)) || (q.explanation !== undefined && typeof q.explanation !== 'string')
        || !validIndices(correctIndices(q), q.options.length) || !validAnswer(q, payload.answers[q.id]))
      || new Set(qs.map((q) => String(q.id))).size !== qs.length) invalid();
    payload.correct = qs.filter((q) => isCorrect(q, payload.answers[q.id])).length;
    payload.total = qs.length;
    payload.score = Math.round(payload.correct / qs.length * 100);
  } else invalid();
  return payload;
}

module.exports = { validateHistory };
