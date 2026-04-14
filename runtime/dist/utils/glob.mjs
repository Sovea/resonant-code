//#region src/utils/glob.ts
/**
* Lightweight glob matcher for the subset used by playbook scopes and RCCL scopes.
*/
function minimatch(filepath, pattern) {
	return globToRegex(pattern).test(filepath.replace(/\\/g, "/"));
}
function globToRegex(pattern) {
	let i = 0;
	let regex = "^";
	while (i < pattern.length) {
		const c = pattern[i];
		if (c === "*") if (pattern[i + 1] === "*") {
			i += 2;
			if (pattern[i] === "/") {
				i += 1;
				regex += "(?:.+/)?";
			} else regex += ".*";
		} else {
			i += 1;
			regex += "[^/]*";
		}
		else if (c === "?") {
			i += 1;
			regex += "[^/]";
		} else if (c === "{") {
			const closeIndex = pattern.indexOf("}", i + 1);
			if (closeIndex === -1) {
				regex += "\\{";
				i += 1;
				continue;
			}
			const options = pattern.slice(i + 1, closeIndex).split(",").map((option) => option.trim()).filter(Boolean).map(escapeRegex);
			regex += options.length ? `(?:${options.join("|")})` : "\\{\\}";
			i = closeIndex + 1;
		} else if (c === ".") {
			i += 1;
			regex += "\\.";
		} else {
			regex += escapeRegex(c);
			i += 1;
		}
	}
	return new RegExp(`${regex}$`);
}
function escapeRegex(value) {
	return value.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
}
//#endregion
export { minimatch };
