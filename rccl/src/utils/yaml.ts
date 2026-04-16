type Scalar = string | number | boolean | null;
type YamlValue = Scalar | YamlMap | YamlValue[];
interface YamlMap {
  [key: string]: YamlValue;
}

export function parseYaml(text: string): YamlValue {
  const source = text.replace(/\r\n/g, '\n');
  const lines = source.split('\n');

  function stripQuotes(value: string): string {
    const trimmed = value.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  }

  function parseScalar(raw: string): YamlValue {
    const value = stripQuotes(raw);
    if (value === 'null') return null;
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim();
      if (inner === '') return [];
      return inner.split(',').map((part) => parseScalar(part.trim()));
    }
    return value;
  }

  function isClosedQuoted(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) return true;
    if (trimmed.startsWith('"')) return trimmed.endsWith('"') && trimmed.length > 1;
    if (trimmed.startsWith("'")) return trimmed.endsWith("'") && trimmed.length > 1;
    return true;
  }

  function readQuotedScalar(startValue: string, startIndex: number, parentIndent: number): { value: string; nextIndex: number } {
    const parts = [startValue.trim()];
    let index = startIndex + 1;
    while (index < lines.length && !isClosedQuoted(parts.join('\n'))) {
      const raw = lines[index];
      const trimmed = raw.trim();
      const indent = raw.search(/\S/);
      if (trimmed && indent <= parentIndent && (trimmed.includes(':') || trimmed.startsWith('- ')) && isClosedQuoted(parts.join('\n'))) break;
      if (!trimmed.startsWith('#')) parts.push(raw);
      index += 1;
    }
    return { value: stripQuotes(parts.join('\n').trim()), nextIndex: index };
  }

  function skipEmpty(index: number): number {
    let cursor = index;
    while (cursor < lines.length) {
      const trimmed = lines[cursor].trim();
      if (trimmed && !trimmed.startsWith('#')) break;
      cursor += 1;
    }
    return cursor;
  }

  function lineIndent(index: number): number {
    return lines[index].search(/\S/);
  }

  function readBlockScalar(startIndex: number, parentIndent: number, style: '|' | '>'): { value: string; nextIndex: number } {
    const content: string[] = [];
    let index = startIndex;
    let blockIndent = -1;
    while (index < lines.length) {
      const raw = lines[index];
      const trimmed = raw.trim();
      const indent = raw.search(/\S/);
      if (trimmed && indent <= parentIndent) break;
      if (blockIndent === -1 && trimmed) blockIndent = indent;
      if (!trimmed) content.push('');
      else content.push(raw.slice(Math.max(blockIndent, 0)));
      index += 1;
    }
    const value = style === '>'
      ? content.map((line, idx) => (line === '' ? '\n' : `${idx > 0 && content[idx - 1] !== '' ? ' ' : ''}${line}`)).join('').trim()
      : content.join('\n').trim();
    return { value, nextIndex: index };
  }

  function parseInlineMap(remainder: string, indent: number, index: number): { value: YamlMap; nextIndex: number } {
    const colon = remainder.indexOf(':');
    const key = remainder.slice(0, colon).trim();
    const rawValue = remainder.slice(colon + 1).trim();
    const map: YamlMap = {};
    if (rawValue === '' || rawValue === '|' || rawValue === '>') {
      if (rawValue === '|' || rawValue === '>') {
        const block = readBlockScalar(index + 1, indent, rawValue);
        map[key] = block.value;
        return { value: map, nextIndex: block.nextIndex };
      }
      const child = parseNode(index + 1, indent + 2);
      map[key] = child.value;
      return { value: map, nextIndex: child.nextIndex };
    }
    if ((rawValue.startsWith('"') || rawValue.startsWith("'")) && !isClosedQuoted(rawValue)) {
      const quoted = readQuotedScalar(rawValue, index, indent);
      map[key] = quoted.value;
      return { value: map, nextIndex: quoted.nextIndex };
    }
    map[key] = parseScalar(rawValue);
    return { value: map, nextIndex: index + 1 };
  }

  function parseSequence(startIndex: number, indent: number): { value: YamlValue[]; nextIndex: number } {
    const items: YamlValue[] = [];
    let index = startIndex;
    while (index < lines.length) {
      index = skipEmpty(index);
      if (index >= lines.length) break;
      const currentIndent = lineIndent(index);
      const trimmed = lines[index].trim();
      if (currentIndent < indent || !trimmed.startsWith('- ')) break;
      const remainder = trimmed.slice(2).trim();
      if (remainder === '') {
        const child = parseNode(index + 1, currentIndent + 2);
        items.push(child.value);
        index = child.nextIndex;
        continue;
      }
      if ((remainder.startsWith('"') || remainder.startsWith("'")) && !isClosedQuoted(remainder)) {
        const quoted = readQuotedScalar(remainder, index, currentIndent);
        items.push(quoted.value);
        index = quoted.nextIndex;
        continue;
      }
      if (remainder.includes(':')) {
        const item = parseInlineMap(remainder, currentIndent, index);
        const merged = item.value;
        let cursor = item.nextIndex;
        while (true) {
          const next = skipEmpty(cursor);
          if (next >= lines.length) {
            cursor = next;
            break;
          }
          const nextIndent = lineIndent(next);
          const nextTrimmed = lines[next].trim();
          if (nextIndent <= currentIndent || nextTrimmed.startsWith('- ')) break;
          const nested = parseMap(next, currentIndent + 2);
          Object.assign(merged, nested.value);
          cursor = nested.nextIndex;
        }
        items.push(merged);
        index = cursor;
        continue;
      }
      items.push(parseScalar(remainder));
      index += 1;
    }
    return { value: items, nextIndex: index };
  }

  function parseMap(startIndex: number, indent: number): { value: YamlMap; nextIndex: number } {
    const map: YamlMap = {};
    let index = startIndex;
    while (index < lines.length) {
      index = skipEmpty(index);
      if (index >= lines.length) break;
      const currentIndent = lineIndent(index);
      const trimmed = lines[index].trim();
      if (currentIndent < indent || trimmed.startsWith('- ')) break;
      const colon = trimmed.indexOf(':');
      if (colon === -1) throw new Error(`Invalid YAML line ${index + 1}: ${trimmed}`);
      const key = trimmed.slice(0, colon).trim();
      const rawValue = trimmed.slice(colon + 1).trim();
      if (rawValue === '' || rawValue === '|' || rawValue === '>') {
        if (rawValue === '|' || rawValue === '>') {
          const block = readBlockScalar(index + 1, currentIndent, rawValue);
          map[key] = block.value;
          index = block.nextIndex;
        } else {
          const child = parseNode(index + 1, currentIndent + 2);
          map[key] = child.value;
          index = child.nextIndex;
        }
      } else if ((rawValue.startsWith('"') || rawValue.startsWith("'")) && !isClosedQuoted(rawValue)) {
        const quoted = readQuotedScalar(rawValue, index, currentIndent);
        map[key] = quoted.value;
        index = quoted.nextIndex;
      } else {
        map[key] = parseScalar(rawValue);
        index += 1;
      }
    }
    return { value: map, nextIndex: index };
  }

  function parseNode(startIndex: number, indent: number): { value: YamlValue; nextIndex: number } {
    const index = skipEmpty(startIndex);
    if (index >= lines.length) return { value: {}, nextIndex: index };
    const currentIndent = lineIndent(index);
    const trimmed = lines[index].trim();
    if (trimmed.startsWith('- ') && currentIndent >= indent) return parseSequence(index, currentIndent);
    return parseMap(index, currentIndent);
  }

  return parseNode(0, 0).value;
}

function quoteIfNeeded(value: string): string {
  return value === '' || /[:"'{}[\]#&*!|>%@`]/.test(value) || /^[ \t\n\r-]/.test(value)
    ? `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    : value;
}

function emitScalar(value: Scalar): string {
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return quoteIfNeeded(value);
}

export function toYaml(value: YamlValue, indent = 0): string {
  const spaces = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return `${spaces}[]\n`;
    return value.map((item) => {
      if (Array.isArray(item) || (item && typeof item === 'object')) {
        const block = toYaml(item, indent + 2).trimEnd().replace(/^ */, '');
        return `${spaces}- ${block}\n`;
      }
      return `${spaces}- ${emitScalar(item as Scalar)}\n`;
    }).join('');
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).map((key) => {
      const child = value[key];
      if (typeof child === 'string' && child.includes('\n')) {
        const block = child.split('\n').map((line) => `${' '.repeat(indent + 2)}${line}`).join('\n');
        return `${spaces}${key}: |\n${block}\n`;
      }
      if (Array.isArray(child) || (child && typeof child === 'object')) {
        return `${spaces}${key}:\n${toYaml(child, indent + 2)}`;
      }
      return `${spaces}${key}: ${emitScalar(child as Scalar)}\n`;
    }).join('');
  }
  return `${spaces}${emitScalar(value as Scalar)}\n`;
}
