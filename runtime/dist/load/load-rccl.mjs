import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
//#region src/load/load-rccl.ts
/**
* Loads RCCL from disk via the RCCL package's canonical parser/normalizer.
*/
async function loadRccl(filePath) {
	if (!filePath || !existsSync(filePath)) return null;
	const parsed = (await loadRcclModule()).parseRccl(readFileSync(filePath, "utf-8"), { allowVerifiedFields: true });
	if (!parsed.valid || !parsed.data) throw new Error(`Failed to parse RCCL document: ${parsed.errors?.join("; ") || "unknown parse error"}`);
	return parsed.data;
}
async function loadRcclModule() {
	return import(pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "rccl", "dist", "index.mjs")).href);
}
//#endregion
export { loadRccl };
