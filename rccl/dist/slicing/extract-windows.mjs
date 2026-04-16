import { DEFAULT_SAMPLING_POLICY } from "../policies.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
//#region src/slicing/extract-windows.ts
function extractWindowsForFiles(projectRoot, files, policy = DEFAULT_SAMPLING_POLICY) {
	const windows = [];
	for (const file of files.slice(0, policy.max_files_per_slice)) {
		const content = readSafe(projectRoot, file.path);
		if (!content) continue;
		const lines = content.split("\n");
		const definitions = findDefinitionLines(lines);
		const descriptors = [];
		descriptors.push({
			purpose: "header",
			start: 1,
			end: Math.min(lines.length, 24)
		});
		if (definitions.length > 0) descriptors.push(windowAround(definitions[0], lines.length, "structure"));
		if (definitions.length > 1) descriptors.push(windowAround(definitions[Math.floor(definitions.length / 2)], lines.length, "implementation"));
		else descriptors.push(windowAround(Math.max(1, Math.floor(lines.length * .6)), lines.length, "implementation"));
		const unique = /* @__PURE__ */ new Map();
		for (const descriptor of descriptors.slice(0, policy.max_windows_per_file)) {
			const start = Math.max(1, descriptor.start);
			const end = Math.min(lines.length, descriptor.end);
			const key = `${descriptor.purpose}:${start}:${end}`;
			unique.set(key, {
				file: file.path,
				start_line: start,
				end_line: end,
				purpose: descriptor.purpose,
				snippet: lines.slice(start - 1, end).join("\n").trim()
			});
		}
		windows.push(...[...unique.values()].filter((window) => window.snippet.length > 0));
	}
	return windows;
}
function windowAround(line, totalLines, purpose) {
	const radius = purpose === "implementation" ? 16 : 12;
	return {
		purpose,
		start: Math.max(1, line - radius),
		end: Math.min(totalLines, line + radius)
	};
}
function findDefinitionLines(lines) {
	const result = [];
	for (let index = 0; index < lines.length; index += 1) if (/\b(function|class|interface|type|const|let|var|def|fn|struct|enum|trait)\b/.test(lines[index])) result.push(index + 1);
	return result;
}
function readSafe(projectRoot, file) {
	try {
		return readFileSync(join(projectRoot, file), "utf-8").replace(/\r\n/g, "\n");
	} catch {
		return null;
	}
}
//#endregion
export { extractWindowsForFiles };
