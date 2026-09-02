// 🎲 Prints the move tokens of a fixture, one per line (input for the native driver).
import { readFile } from "node:fs/promises";
import { parseFixture } from "./parse-fixture.mjs";

const { plies } = parseFixture(await readFile(process.argv[2], "utf8"));
console.log(plies.map((ply) => ply.chosen).join("\n"));
