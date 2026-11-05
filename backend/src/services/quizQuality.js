const number = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?';
const literalPattern = new RegExp(`^(${number})(.*)$`, 'i');
const fractionPattern = new RegExp(`^(${number})\\s*\\/\\s*(${number})(.*)$`, 'i');
const rootPattern = new RegExp(`^([+-]?)(?:sqrt|√)\\s*(?:\\(\\s*(${number})\\s*\\)|(${number}))(.*)$`, 'i');

function safeScalarLiteral(text) {
  const numeric = Number(text);
  const significant = text.split(/e/i)[0].replace(/[+.-]/g, '').replace(/^0+|0+$/g, '');
  // Leave high-precision or underflowing inputs to the model rather than merge distinct values.
  if (!Number.isFinite(numeric) || significant.length > 15
    || (Number.isInteger(numeric) && !Number.isSafeInteger(numeric))
    || (numeric === 0 && significant)) return null;
  return numeric;
}

function scalarOption(text) {
  let value = text.normalize('NFKC').replace(/[−–]/g, '-').trim()
    .replace(/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)')
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '$1/$2')
    .replace(/\$/g, '').replace(/^[a-z]\s*=\s*/i, '');
  let precision = null;
  value = value.replace(/\(?\s*(?:to\s+)?(\d{1,2})\s*(s\.?\s*f\.?|significant figures?|d\.?\s*p\.?|decimal places?)\s*\)?/ig,
    (_, digits, kind) => {
      precision = { digits: Number(digits), significant: /^(s|significant)/i.test(kind) };
      return '';
    }).trim();
  const approximate = /^(?:≈|~|approximately\s+|about\s+)/i.test(value);
  value = value.replace(/^(?:≈|~|approximately\s+|about\s+)/i, '').trim();
  let match = value.match(rootPattern), numeric, suffix, expression = false;
  if (match) {
    const operand = safeScalarLiteral(match[2] ?? match[3]);
    if (operand === null) return null;
    numeric = (match[1] === '-' ? -1 : 1) * Math.sqrt(operand);
    suffix = match[4]; expression = true;
  } else if ((match = value.match(fractionPattern))) {
    const numerator = safeScalarLiteral(match[1]), denominator = safeScalarLiteral(match[2]);
    if (numerator === null || denominator === null || (numerator !== 0 && numerator / denominator === 0)) return null;
    numeric = numerator / denominator; suffix = match[3]; expression = true;
  } else if ((match = value.match(literalPattern))) {
    numeric = safeScalarLiteral(match[1]); suffix = match[2];
    if (numeric === null) return null;
  } else return null;
  if (!Number.isFinite(numeric) || (Number.isInteger(numeric) && !Number.isSafeInteger(numeric))) return null;
  let unit = suffix.trim().toLowerCase().replace(/^units?$/, 'unit');
  // Only compare standalone scalars with optional units, never arbitrary formulas or code.
  if (!/^(?:[a-z]+(?:\^?[23])?|%)?$/.test(unit)) return null;
  if (unit === '%') {
    if (numeric !== 0 && numeric / 100 === 0) return null;
    numeric /= 100; unit = '';
  }
  const decimals = !expression && /^[-+]?\d*\.(\d+)(?:e[-+]?\d+)?$/i.exec(match[1]);
  return { value: numeric, unit, precision, approximate, expression, decimals: decimals ? decimals[1].length : null };
}

function near(left, right) {
  return Math.abs(left - right) <= Number.EPSILON * 16 * Math.max(Math.abs(left), Math.abs(right), Number.MIN_VALUE);
}

function roundedMatches(exact, rounded) {
  const { precision } = rounded;
  if (precision) {
    if (precision.significant && (precision.digits < 1 || precision.digits > 15)) return false;
    if (!precision.significant && precision.digits > 12) return false;
    const result = precision.significant ? Number(exact.value.toPrecision(precision.digits)) : Number(exact.value.toFixed(precision.digits));
    return near(result, rounded.value);
  }
  if ((exact.expression || rounded.approximate) && rounded.decimals != null && rounded.decimals <= 12) {
    return near(Number(exact.value.toFixed(rounded.decimals)), rounded.value);
  }
  return false;
}

function hasEquivalentOptions(options) {
  const normalized = options.map(option => option.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' '));
  if (new Set(normalized).size !== normalized.length) return true;
  const scalars = options.map(scalarOption);
  return scalars.some((left, index) => left && scalars.slice(index + 1).some(right => {
    if (!right || (left.unit && right.unit && left.unit !== right.unit)) return false;
    const equal = left.expression || right.expression ? near(left.value, right.value) : left.value === right.value;
    return equal || roundedMatches(left, right) || roundedMatches(right, left);
  }));
}

module.exports = { hasEquivalentOptions };
