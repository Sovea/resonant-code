//#region src/utils/yaml.ts
function parseYaml(text) {
	const lines = text.replace(/\r\n/g, "\n").split("\n");
	function stripQuotes(value) {
		const trimmed = value.trim();
		if (trimmed.startsWith("\"") && trimmed.endsWith("\"") || trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1);
		return trimmed;
	}
	function parseScalar(raw) {
		const value = stripQuotes(raw);
		if (value === "null") return null;
		if (value === "true") return true;
		if (value === "false") return false;
		if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
		if (value.startsWith("[") && value.endsWith("]")) {
			const inner = value.slice(1, -1).trim();
			if (inner === "") return [];
			return inner.split(",").map((part) => parseScalar(part.trim()));
		}
		return value;
	}
	function isClosedQuoted(value) {
		const trimmed = value.trim();
		if (!trimmed) return true;
		if (trimmed.startsWith("\"")) return trimmed.endsWith("\"") && trimmed.length > 1;
		if (trimmed.startsWith("'")) return trimmed.endsWith("'") && trimmed.length > 1;
		return true;
	}
	function readQuotedScalar(startValue, startIndex, parentIndent) {
		const parts = [startValue.trim()];
		let index = startIndex + 1;
		while (index < lines.length && !isClosedQuoted(parts.join("\n"))) {
			const raw = lines[index];
			const trimmed = raw.trim();
			const indent = raw.search(/\S/);
			if (trimmed && indent <= parentIndent && (trimmed.includes(":") || trimmed.startsWith("- ")) && isClosedQuoted(parts.join("\n"))) break;
			if (!trimmed.startsWith("#")) parts.push(raw);
			index += 1;
		}
		return {
			value: stripQuotes(parts.join("\n").trim()),
			nextIndex: index
		};
	}
	function skipEmpty(index) {
		let cursor = index;
		while (cursor < lines.length) {
			const trimmed = lines[cursor].trim();
			if (trimmed && !trimmed.startsWith("#")) break;
			cursor += 1;
		}
		return cursor;
	}
	function lineIndent(index) {
		return lines[index].search(/\S/);
	}
	function readBlockScalar(startIndex, parentIndent, style) {
		const content = [];
		let index = startIndex;
		let blockIndent = -1;
		while (index < lines.length) {
			const raw = lines[index];
			const trimmed = raw.trim();
			const indent = raw.search(/\S/);
			if (trimmed && indent <= parentIndent) break;
			if (blockIndent === -1 && trimmed) blockIndent = indent;
			if (!trimmed) content.push("");
			else content.push(raw.slice(Math.max(blockIndent, 0)));
			index += 1;
		}
		return {
			value: style === ">" ? content.map((line, idx) => line === "" ? "\n" : `${idx > 0 && content[idx - 1] !== "" ? " " : ""}${line}`).join("").trim() : content.join("\n").trim(),
			nextIndex: index
		};
	}
	function parseInlineMap(remainder, indent, index) {
		const colon = remainder.indexOf(":");
		const key = remainder.slice(0, colon).trim();
		const rawValue = remainder.slice(colon + 1).trim();
		const map = {};
		if (rawValue === "" || rawValue === "|" || rawValue === ">") {
			if (rawValue === "|" || rawValue === ">") {
				const block = readBlockScalar(index + 1, indent, rawValue);
				map[key] = block.value;
				return {
					value: map,
					nextIndex: block.nextIndex
				};
			}
			const child = parseNode(index + 1, indent + 2);
			map[key] = child.value;
			return {
				value: map,
				nextIndex: child.nextIndex
			};
		}
		if ((rawValue.startsWith("\"") || rawValue.startsWith("'")) && !isClosedQuoted(rawValue)) {
			const quoted = readQuotedScalar(rawValue, index, indent);
			map[key] = quoted.value;
			return {
				value: map,
				nextIndex: quoted.nextIndex
			};
		}
		map[key] = parseScalar(rawValue);
		return {
			value: map,
			nextIndex: index + 1
		};
	}
	function parseSequence(startIndex, indent) {
		const items = [];
		let index = startIndex;
		while (index < lines.length) {
			index = skipEmpty(index);
			if (index >= lines.length) break;
			const currentIndent = lineIndent(index);
			const trimmed = lines[index].trim();
			if (currentIndent < indent || !trimmed.startsWith("- ")) break;
			const remainder = trimmed.slice(2).trim();
			if (remainder === "") {
				const child = parseNode(index + 1, currentIndent + 2);
				items.push(child.value);
				index = child.nextIndex;
				continue;
			}
			if ((remainder.startsWith("\"") || remainder.startsWith("'")) && !isClosedQuoted(remainder)) {
				const quoted = readQuotedScalar(remainder, index, currentIndent);
				items.push(quoted.value);
				index = quoted.nextIndex;
				continue;
			}
			if (remainder.includes(":")) {
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
					if (nextIndent <= currentIndent || nextTrimmed.startsWith("- ")) break;
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
		return {
			value: items,
			nextIndex: index
		};
	}
	function parseMap(startIndex, indent) {
		const map = {};
		let index = startIndex;
		while (index < lines.length) {
			index = skipEmpty(index);
			if (index >= lines.length) break;
			const currentIndent = lineIndent(index);
			const trimmed = lines[index].trim();
			if (currentIndent < indent || trimmed.startsWith("- ")) break;
			const colon = trimmed.indexOf(":");
			if (colon === -1) throw new Error(`Invalid YAML line ${index + 1}: ${trimmed}`);
			const key = trimmed.slice(0, colon).trim();
			const rawValue = trimmed.slice(colon + 1).trim();
			if (rawValue === "" || rawValue === "|" || rawValue === ">") if (rawValue === "|" || rawValue === ">") {
				const block = readBlockScalar(index + 1, currentIndent, rawValue);
				map[key] = block.value;
				index = block.nextIndex;
			} else {
				const child = parseNode(index + 1, currentIndent + 2);
				map[key] = child.value;
				index = child.nextIndex;
			}
			else if ((rawValue.startsWith("\"") || rawValue.startsWith("'")) && !isClosedQuoted(rawValue)) {
				const quoted = readQuotedScalar(rawValue, index, currentIndent);
				map[key] = quoted.value;
				index = quoted.nextIndex;
			} else {
				map[key] = parseScalar(rawValue);
				index += 1;
			}
		}
		return {
			value: map,
			nextIndex: index
		};
	}
	function parseNode(startIndex, indent) {
		const index = skipEmpty(startIndex);
		if (index >= lines.length) return {
			value: {},
			nextIndex: index
		};
		const currentIndent = lineIndent(index);
		if (lines[index].trim().startsWith("- ") && currentIndent >= indent) return parseSequence(index, currentIndent);
		return parseMap(index, currentIndent);
	}
	return parseNode(0, 0).value;
}
function quoteIfNeeded(value) {
	return value === "" || /[:"'{}[\]#&*!|>%@`]/.test(value) || /^[ \t\n\r-]/.test(value) ? `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"` : value;
}
function emitScalar(value) {
	if (value === null) return "null";
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return quoteIfNeeded(value);
}
function toYaml(value, indent = 0) {
	const spaces = " ".repeat(indent);
	if (Array.isArray(value)) {
		if (value.length === 0) return `${spaces}[]\n`;
		return value.map((item) => {
			if (Array.isArray(item) || item && typeof item === "object") return `${spaces}- ${toYaml(item, indent + 2).trimEnd().replace(/^ */, "")}\n`;
			return `${spaces}- ${emitScalar(item)}\n`;
		}).join("");
	}
	if (value && typeof value === "object") return Object.keys(value).map((key) => {
		const child = value[key];
		if (typeof child === "string" && child.includes("\n")) return `${spaces}${key}: |\n${child.split("\n").map((line) => `${" ".repeat(indent + 2)}${line}`).join("\n")}\n`;
		if (Array.isArray(child) || child && typeof child === "object") return `${spaces}${key}:\n${toYaml(child, indent + 2)}`;
		return `${spaces}${key}: ${emitScalar(child)}\n`;
	}).join("");
	return `${spaces}${emitScalar(value)}\n`;
}
//#endregion
export { parseYaml, toYaml };
