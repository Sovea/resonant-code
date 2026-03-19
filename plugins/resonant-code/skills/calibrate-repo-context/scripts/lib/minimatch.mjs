/**
 * Lightweight glob matcher — supports `*`, `**`, and `?`.
 * No external dependencies. Handles path separators normalized to `/`.
 *
 * @param {string} filepath — forward-slash-separated relative path
 * @param {string} pattern  — glob pattern (e.g. "src/**", "**\/*.ts")
 * @returns {boolean}
 */
export function minimatch(filepath, pattern) {
  const regex = globToRegex(pattern);
  return regex.test(filepath);
}

/**
 * Convert a glob pattern to a RegExp.
 * Supported tokens: `**` (any path segments), `*` (any within segment), `?` (single char).
 *
 * @param {string} pattern
 * @returns {RegExp}
 */
function globToRegex(pattern) {
  let i = 0;
  let regex = '^';
  const len = pattern.length;

  while (i < len) {
    const c = pattern[i];

    if (c === '*') {
      if (pattern[i + 1] === '*') {
        // `**` — match any number of path segments
        // consume trailing slash if present: `**/`
        i += 2;
        if (pattern[i] === '/') {
          i++;
          regex += '(?:.+/)?';
        } else if (i === len) {
          // `**` at end — match everything remaining
          regex += '.*';
        } else {
          regex += '(?:.*/)?';
        }
      } else {
        // `*` — match anything except `/`
        i++;
        regex += '[^/]*';
      }
    } else if (c === '?') {
      i++;
      regex += '[^/]';
    } else if (c === '.') {
      i++;
      regex += '\\.';
    } else {
      i++;
      regex += c;
    }
  }

  regex += '$';
  return new RegExp(regex);
}
