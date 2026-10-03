import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const parser = require("next/dist/compiled/babel/parser");
const sharp = require("sharp");
const postcss = require("postcss");
const files = [...new Set(execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean))].sort();
const tracked = new Set(files);
const sources = new Map();
const imports = new Map();
const clients = [];
const findings = [];
const coverage = [];
const stats = { files: files.length, code: 0, imports: 0, adminRoutes: 0, images: 0 };
const problem = (file, message) => findings.push({ file, message });

function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (["loc", "start", "end", "extra", "comments", "tokens"].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(n => walk(n, visit));
    else if (value && typeof value === "object") walk(value, visit);
  }
}
function resolveLocal(file, specifier) {
  const base = specifier.startsWith("@/") ? specifier.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
  return ["", ".js", ".mjs", ".ts", "/index.js", "/index.ts"].map(ext => base + ext).find(candidate => tracked.has(candidate));
}

for (const file of files) {
  if (!fs.existsSync(file)) { problem(file, "Tracked file is missing"); continue; }
  const bytes = fs.readFileSync(file);
  const checks = [];
  const record = { file, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, checks };
  coverage.push(record);
  if (file.endsWith(".png")) {
    try { await sharp(bytes).raw().toBuffer(); stats.images++; checks.push("image decoded"); }
    catch { problem(file, "PNG cannot be decoded"); }
    continue;
  }
  const text = bytes.toString("utf8");
  sources.set(file, text);
  checks.push("text and credential patterns");
  if (text.includes("\0")) problem(file, "Unexpected binary data in a text file");
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) problem(file, "Private key material must not be committed");
  if (/^\.env(?:\.|$)/.test(file) && file !== ".env.example") problem(file, "Environment credentials must not be tracked");
  if (file === "supabase/cron.sql" && /'x-cron-secret',\s*'[^']+'/.test(text)) problem(file, "Cron credentials must be read from Vault");
  if (/\.(?:js|mjs|ts)$/.test(file)) {
    try {
      const ast = parser.parse(text, { sourceType: "module", plugins: ["jsx", ...(file.endsWith(".ts") ? ["typescript"] : [])] });
      stats.code++; checks.push("syntax", "local imports");
      const deps = [];
      if (ast.program.directives.some(d => d.value.value === "use client")) clients.push(file);
      walk(ast, node => {
        if (node.type === "ImportDeclaration" || node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration") {
          const specifier = node.source?.value;
          if (!specifier) return;
          stats.imports++;
          if (specifier.startsWith("@/") || specifier.startsWith(".")) {
            const resolved = resolveLocal(file, specifier);
            if (resolved) deps.push(resolved);
            else problem(file, `Missing or incorrectly cased import: ${specifier}`);
          }
        }
      });
      imports.set(file, deps);
    } catch (error) { problem(file, `Syntax error: ${error.message}`); }
    if (file.startsWith("app/api/admin/") && file.endsWith("route.js")) {
      stats.adminRoutes++; checks.push("admin guard");
      if (/if\s*\(\s*!isAuthorizedCron\(/.test(text)) problem(file, "Cron authentication must be awaited");
      if (!/isAdmin\(profile\)/.test(text)) problem(file, "Admin route is missing its role guard");
    }
  } else if (file.endsWith(".json")) {
    try { JSON.parse(text); checks.push("JSON parsed"); }
    catch { problem(file, "Invalid JSON"); }
  } else if (file.endsWith(".css")) {
    try { postcss.parse(text, { from: file }); checks.push("CSS parsed"); }
    catch { problem(file, "Invalid CSS"); }
  } else if (file.endsWith(".sql")) {
    checks.push("database policy patterns");
    for (const match of text.matchAll(/create table if not exists public\.(\w+)/gi)) {
      if (!new RegExp(`alter table public\\.${match[1]} enable row level security`, "i").test(text)) problem(file, `Missing RLS enablement for ${match[1]}`);
    }
  }
}

for (const client of clients) {
  const seen = new Set();
  function visit(file, chain) {
    if (seen.has(file)) return;
    seen.add(file);
    const text = sources.get(file) || "";
    if (/import ["']server-only|process\.env\.SUPABASE_SERVICE_ROLE_KEY/.test(text)) problem(client, `Client imports server-only code: ${chain.join(" -> ")}`);
    (imports.get(file) || []).forEach(dep => visit(dep, [...chain, dep]));
  }
  visit(client, [client]);
}

const report = { checkedAt: new Date().toISOString(), stats, findings, coverage };
if (process.env.REPOSITORY_AUDIT_REPORT) fs.writeFileSync(process.env.REPOSITORY_AUDIT_REPORT, JSON.stringify(report, null, 2));
console.log(`Repository checks: ${stats.files} files, ${stats.code} code files, ${stats.imports} imports, ${stats.adminRoutes} admin guards, ${stats.images} decoded images.`);
for (const finding of findings) console.error(`${finding.file}: ${finding.message}`);
if (findings.length) process.exitCode = 1;
