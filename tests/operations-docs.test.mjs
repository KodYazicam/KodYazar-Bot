// Keeps docs/OPERATIONS.md honest: every command, environment variable, and
// repository path it tells an operator to use must exist on this branch, and
// the behaviour it describes must still be present in the source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(join(root, file), "utf8");
const DOC = "docs/OPERATIONS.md";

const pkg = JSON.parse(read("package.json"));
const envKeys = read(".env.example")
  .split(/\r?\n/)
  .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
  .filter(Boolean);

function fences(text) {
  return (text.match(/^```/gm) ?? []).length;
}

/** Environment variables the runbook documents in its configuration table. */
function documentedEnvKeys(text) {
  return [...text.matchAll(/^\|\s*`([A-Z][A-Z0-9_]*)`\s*\|/gm)].map((match) => match[1]);
}

/** npm scripts the runbook tells an operator to run. */
function referencedScripts(text) {
  const scripts = new Set();
  for (const match of text.matchAll(/npm run ([a-z][a-z0-9:-]*)/g)) scripts.add(match[1]);
  if (/\bnpm start\b/.test(text)) scripts.add("start");
  if (/\bnpm test\b/.test(text)) scripts.add("test");
  return [...scripts];
}

/** Repository-relative paths named in backticks, excluding URLs and runtime paths. */
function referencedPaths(text) {
  const candidates = [...text.matchAll(/`([^`\n]+)`/g)].map((match) => match[1].trim());
  return candidates.filter((candidate) =>
    /^(Dockerfile|docker-compose\.yml|\.env\.example|package\.json|README\.md|CHANGELOG\.md)$/.test(candidate) ||
    /^(src|tests|\.github)\//.test(candidate),
  );
}

test("the operator runbook exists and is linked from the README", () => {
  assert.ok(existsSync(join(root, DOC)), `${DOC} is missing`);
  assert.match(read("README.md"), /\]\(\.\/docs\/OPERATIONS\.md\)/, "README.md must link the runbook");
});

test("the runbook has balanced code fences and no placeholders", () => {
  const text = read(DOC);
  const count = fences(text);
  assert.equal(count % 2, 0, `${DOC} has ${count} fence markers`);
  assert.doesNotMatch(text, /\bTODO\b|\bTBD\b|\bFIXME\b/, `${DOC} must not ship placeholders`);
});

test("every environment variable in .env.example is documented", () => {
  const text = read(DOC);
  const documented = new Set(documentedEnvKeys(text));
  for (const key of envKeys) {
    assert.ok(documented.has(key), `${DOC} must document ${key} in its configuration table`);
    assert.ok(text.includes(key), `${DOC} must mention ${key}`);
  }
});

test("the runbook does not invent environment variables", () => {
  const known = new Set(envKeys);
  for (const key of documentedEnvKeys(read(DOC))) {
    assert.ok(known.has(key), `${DOC} documents ${key}, but .env.example does not define it`);
  }
});

test("every npm script the runbook references exists in package.json", () => {
  for (const script of referencedScripts(read(DOC))) {
    assert.ok(pkg.scripts?.[script], `${DOC} references "npm run ${script}", which package.json does not define`);
  }
});

test("every repository path the runbook references exists", () => {
  const paths = referencedPaths(read(DOC));
  assert.ok(paths.length >= 6, "the runbook should point at the real deploy surface");
  for (const path of paths) {
    assert.ok(existsSync(join(root, path)), `${DOC} references ${path}, which does not exist`);
  }
});

test("the runbook's code-level claims match the source", () => {
  const text = read(DOC);
  const index = read("src/index.ts");
  const health = read("src/health.ts");
  const config = read("src/config.ts");

  assert.match(text, /\/healthz/, "must document the health path");
  assert.ok(health.includes("'/healthz'"), "src/health.ts no longer serves /healthz");

  assert.match(text, /404/, "must document the 404 branch");
  assert.match(text, /405/, "must document the 405 branch");
  assert.ok(health.includes("404") && health.includes("405"), "src/health.ts no longer returns 404/405");

  for (const signal of ["SIGTERM", "SIGINT"]) {
    assert.ok(text.includes(signal), `must document ${signal} shutdown`);
    assert.ok(index.includes(`'${signal}'`), `src/index.ts no longer handles ${signal}`);
  }

  for (const level of ["debug", "info", "warn", "error"]) {
    assert.ok(text.includes(level), `must document LOG_LEVEL=${level}`);
    assert.ok(config.includes(level), `src/config.ts no longer accepts LOG_LEVEL=${level}`);
  }

  assert.match(text, /3000/, "must document the default PORT");
  assert.match(config, /\?\s*3000\b/, "src/config.ts no longer defaults PORT to 3000");

  assert.match(text, /GUILDS/, "must document the GUILDS intent");
  assert.ok(index.includes("GatewayIntentBits.Guilds"), "src/index.ts no longer requests the Guilds intent");
  assert.ok(index.includes("createSparkBot"), "src/index.ts no longer dispatches through sparkcord");
});

test("the runbook states that /healthz is not gateway readiness", () => {
  const text = read(DOC);
  assert.match(text, /liveness/i, "must call the probe a liveness signal");
  assert.match(text, /gateway/i, "must explain the gateway caveat");
  assert.match(text, /readiness|not proof|does not prove/i, "must say it is not a readiness signal");
});
