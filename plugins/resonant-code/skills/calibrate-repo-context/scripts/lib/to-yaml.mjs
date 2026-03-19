/**
 * Returns whether a scalar needs YAML quotes to round-trip safely.
 *
 * @param {string} value
 * @returns {boolean}
 */
function needsQuotes(value) {
  return value === '' || /[:"'{}[\]#&*!|>%@`]/.test(value) || /^[ \t\n\r-]/.test(value);
}

/**
 * Formats one primitive value as YAML, returning null for multiline strings.
 *
 * @param {unknown} value
 * @returns {string | null}
 */
function formatScalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value !== 'string') return String(value);
  if (value.includes('\n')) return null;
  if (needsQuotes(value)) return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  return value;
}

/**
 * Chooses stable field order for known RCCL object shapes.
 *
 * @param {Record<string, unknown>} obj
 * @returns {string[]}
 */
function orderedKeys(obj) {
  const keys = Object.keys(obj);

  const observationOrder = [
    'id',
    'category',
    'scope',
    'pattern',
    'confidence',
    'adherence_quality',
    'evidence',
    'verification',
  ];
  const evidenceOrder = ['file', 'line_range', 'snippet'];
  const verificationOrder = [
    'status',
    'verified_count',
    'verified_confidence',
    'checked_at',
    'disposition',
  ];
  const topLevelOrder = ['version', 'generated_at', 'git_ref', 'observations'];

  let preferred = null;
  if (keys.includes('observations')) {
    preferred = topLevelOrder;
  } else if (keys.includes('id') && keys.includes('evidence')) {
    preferred = observationOrder;
  } else if (keys.includes('file') && keys.includes('line_range')) {
    preferred = evidenceOrder;
  } else if (keys.includes('verified_count') && keys.includes('disposition')) {
    preferred = verificationOrder;
  }

  if (!preferred) {
    return keys.sort();
  }

  // Keep human-meaningful field order for the RCCL shapes that our parser expects.
  const rank = new Map(preferred.map((key, index) => [key, index]));
  return keys.sort((a, b) => {
    const aRank = rank.has(a) ? rank.get(a) : Number.MAX_SAFE_INTEGER;
    const bRank = rank.has(b) ? rank.get(b) : Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) return aRank - bRank;
    return a.localeCompare(b);
  });
}

/**
 * Emits a block scalar for multiline snippet content.
 *
 * @param {string} value
 * @param {number} indent
 * @returns {string}
 */
function emitMultilineString(value, indent) {
  const spaces = ' '.repeat(indent);
  return `|\n${value.split('\n').map(line => `${spaces}${line}`).join('\n')}`;
}

/**
 * Recursively serializes one YAML node using the restricted RCCL shape rules.
 *
 * @param {unknown} value
 * @param {number} indent
 * @returns {string}
 */
function emitNode(value, indent) {
  const spaces = ' '.repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) return `${spaces}[]`;
    if (value.every(item => typeof item !== 'object' || item === null)) {
      return `${spaces}[${value.map(item => formatScalar(item)).join(', ')}]`;
    }

    const lines = [];
    for (const item of value) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const entries = orderedKeys(item);
        const firstKey = entries[0];
        const firstValue = item[firstKey];
        const firstScalar = formatScalar(firstValue);

        // Emit the first key on the same line as the dash so list items stay compact.
        if (firstScalar !== null) {
          lines.push(`${spaces}- ${firstKey}: ${firstScalar}`);
        } else {
          lines.push(`${spaces}- ${firstKey}: ${emitMultilineString(firstValue, indent + 4).trimStart()}`);
        }

        for (const key of entries.slice(1)) {
          lines.push(...emitKeyValue(key, item[key], indent + 2));
        }
      } else {
        lines.push(`${spaces}- ${formatScalar(item)}`);
      }
    }
    return lines.join('\n');
  }

  if (value && typeof value === 'object') {
    return orderedKeys(value)
      .flatMap(key => emitKeyValue(key, value[key], indent))
      .join('\n');
  }

  const scalar = formatScalar(value);
  return scalar === null ? `${spaces}${emitMultilineString(String(value), indent + 2)}` : `${spaces}${scalar}`;
}

/**
 * Serializes a single object property while preserving RCCL-specific formatting.
 *
 * @param {string} key
 * @param {unknown} value
 * @param {number} indent
 * @returns {string[]}
 */
function emitKeyValue(key, value, indent) {
  const spaces = ' '.repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) return [`${spaces}${key}: []`];
    // Primitive arrays stay inline; object arrays expand for readability and parser stability.
    if (value.every(item => typeof item !== 'object' || item === null)) {
      return [`${spaces}${key}: [${value.map(item => formatScalar(item)).join(', ')}]`];
    }
    return [`${spaces}${key}:`, emitNode(value, indent + 2)];
  }

  if (value && typeof value === 'object') {
    const keys = orderedKeys(value);
    if (keys.length === 0) return [`${spaces}${key}: {}`];
    return [`${spaces}${key}:`, emitNode(value, indent + 2)];
  }

  const scalar = formatScalar(value);
  if (scalar !== null) {
    return [`${spaces}${key}: ${scalar}`];
  }

  return [`${spaces}${key}: ${emitMultilineString(value, indent + 2).trimStart()}`];
}

/**
 * Serializes an RCCL document to deterministic YAML.
 *
 * @param {object} obj
 * @returns {string}
 */
export function toYaml(obj) {
  return `${emitNode(obj, 0)}\n`;
}
