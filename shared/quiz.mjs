// Shared by generation, marking, history and review. Legacy single-answer records remain readable.
const indices = (value) => Array.isArray(value) ? value : Number.isInteger(value) ? [value] : [];
const correctIndices = (question) => indices(question.answerIndices ?? question.answerIndex);
const isMultiple = (question) => correctIndices(question).length > 1;
function validIndices(value, size) {
  const list = indices(value);
  return list.length > 0 && list.length <= size && new Set(list).size === list.length
    && list.every((index) => Number.isInteger(index) && index >= 0 && index < size);
}
function validAnswer(question, value) {
  return validIndices(value, question.options.length) && (isMultiple(question) || indices(value).length === 1);
}
function isCorrect(question, value) {
  const expected = correctIndices(question);
  const actual = indices(value);
  return validAnswer(question, value) && expected.length === actual.length && expected.every((i) => actual.includes(i));
}
function toggleAnswer(question, value, index) {
  if (!isMultiple(question)) return index;
  const selected = indices(value);
  return selected.includes(index) ? selected.filter((i) => i !== index) : [...selected, index];
}
const answerText = (question, value) => indices(value).map((i) => question.options[i]).join("; ");
function shuffleOptions(question, random = Math.random) {
  const order = question.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const answers = correctIndices(question);
  const rest = { ...question };
  delete rest.answerIndex;
  return { ...rest, options: order.map((i) => question.options[i]), answerIndices: order.flatMap((original, i) => answers.includes(original) ? [i] : []) };
}
export { indices, correctIndices, isMultiple, validIndices, validAnswer, isCorrect, toggleAnswer, answerText, shuffleOptions };
