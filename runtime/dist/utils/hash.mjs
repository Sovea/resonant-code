import { createHash } from "node:crypto";
//#region src/utils/hash.ts
function stableHash(parts) {
	return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
}
//#endregion
export { stableHash };
