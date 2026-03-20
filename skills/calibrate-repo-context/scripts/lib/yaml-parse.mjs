/**
 * Parses the limited YAML subset used by RCCL documents.
 *
 * @param {string} yamlText
 * @returns {{ version: string | number, generated_at: string | null, git_ref: string | null, observations: object[] }}
 */
export function parse(yamlText) {
  yamlText = yamlText.replace(/\r\n/g, '\n').trim();

  if (yamlText.startsWith('```')) {
    yamlText = yamlText.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '');
  }

  const lines = yamlText.split('\n');
  const result = {
    version: '1.0',
    generated_at: null,
    git_ref: null,
    observations: [],
  };

  let currentBlockType = null;
  let currentObs = null;
  let currentEv = null;
  let inVerification = false;

  /**
   * Removes one layer of surrounding YAML quotes from a scalar.
   *
   * @param {string} str
   * @returns {string}
   */
  function stripQuotes(str) {
    str = str.trim();
    if (str.startsWith('"') && str.endsWith('"')) return str.slice(1, -1);
    if (str.startsWith("'") && str.endsWith("'")) return str.slice(1, -1);
    return str;
  }

  /**
   * Parses a scalar from the narrow RCCL YAML subset.
   *
   * @param {string} str
   * @returns {string | number | boolean | null}
   */
  function parseScalar(str) {
    const value = stripQuotes(str);
    if (value === 'null') return null;
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
    return value;
  }

  /**
   * Flushes the current observation and pending evidence into the result list.
   *
   * @returns {void}
   */
  function finalizeObservation() {
    if (!currentObs) return;
    if (currentEv) {
      currentObs.evidence.push(currentEv);
      currentEv = null;
    }
    inVerification = false;
    result.observations.push(currentObs);
    currentObs = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = line.search(/\S/);

    if (indent === 0) {
      if (trimmed.startsWith('version:')) {
        result.version = parseScalar(trimmed.substring(8));
      } else if (trimmed.startsWith('generated_at:')) {
        result.generated_at = parseScalar(trimmed.substring(13));
      } else if (trimmed.startsWith('git_ref:')) {
        result.git_ref = parseScalar(trimmed.substring(8));
      } else if (trimmed.startsWith('observations:')) {
        currentBlockType = 'observations';
      }
      continue;
    }

    if (currentBlockType !== 'observations') {
      continue;
    }

    if (trimmed.startsWith('- id:')) {
      finalizeObservation();
      // Observation items are anchored by `- id:` to keep this parser small and predictable.
      currentObs = {
        id: stripQuotes(trimmed.substring(5)),
        category: null,
        scope: null,
        pattern: null,
        confidence: 0,
        adherence_quality: null,
        evidence: [],
        verification: {
          status: null,
          verified_count: null,
          verified_confidence: null,
          checked_at: null,
          disposition: null,
        },
      };
      continue;
    }

    if (!currentObs) {
      continue;
    }

    if (trimmed.startsWith('- file:')) {
      if (currentEv) currentObs.evidence.push(currentEv);
      inVerification = false;
      currentEv = {
        file: stripQuotes(trimmed.substring(7)),
        line_range: [],
        snippet: '',
      };
      continue;
    }

    if (currentEv) {
      if (trimmed.startsWith('line_range:')) {
        const arrMatch = trimmed.match(/\[\s*(\d+)\s*,\s*(\d+)\s*\]/);
        if (arrMatch) {
          currentEv.line_range = [parseInt(arrMatch[1], 10), parseInt(arrMatch[2], 10)];
        }
        continue;
      }

      if (trimmed.startsWith('snippet:')) {
        const value = trimmed.substring(8).trim();
        if (value === '|' || value === '>-') {
          // Snippets are the only multiline field we support; indentation determines its extent.
          const snippetLines = [];
          let j = i + 1;
          const expectedIndent = lines[j] ? lines[j].search(/\S/) : 0;
          while (j < lines.length) {
            if (lines[j].trim() === '') {
              snippetLines.push('');
              j++;
              continue;
            }

            const lineIndent = lines[j].search(/\S/);
            if (lineIndent < expectedIndent) break;
            snippetLines.push(lines[j].substring(expectedIndent));
            j++;
          }
          currentEv.snippet = snippetLines.join('\n').trim();
          i = j - 1;
        } else {
          currentEv.snippet = stripQuotes(value);
        }
        continue;
      }

      if (indent <= 2) {
        currentObs.evidence.push(currentEv);
        currentEv = null;
      }
    }

    if (trimmed.startsWith('category:')) {
      currentObs.category = stripQuotes(trimmed.substring(9));
    } else if (trimmed.startsWith('scope:')) {
      currentObs.scope = stripQuotes(trimmed.substring(6));
    } else if (trimmed.startsWith('pattern:')) {
      currentObs.pattern = stripQuotes(trimmed.substring(8));
    } else if (trimmed.startsWith('confidence:')) {
      currentObs.confidence = Number(trimmed.substring(11).trim());
    } else if (trimmed.startsWith('adherence_quality:')) {
      currentObs.adherence_quality = stripQuotes(trimmed.substring(18));
    } else if (trimmed.startsWith('evidence:')) {
      inVerification = false;
    } else if (trimmed.startsWith('verification:')) {
      if (currentEv) {
        currentObs.evidence.push(currentEv);
        currentEv = null;
      }
      // Verification fields are parsed as flat scalars under a dedicated sub-block.
      inVerification = true;
    } else if (inVerification && indent >= 4) {
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex !== -1) {
        const key = trimmed.slice(0, colonIndex).trim();
        const rawValue = trimmed.slice(colonIndex + 1).trim();
        currentObs.verification[key] = parseScalar(rawValue);
      }
    }
  }

  finalizeObservation();
  return result;
}
