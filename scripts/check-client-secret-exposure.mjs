#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const requireDist = args.includes("--require-dist");

if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

const scanTargets = [
  {
    area: "browser source",
    required: true,
    roots: ["src", "index.html"],
    rules: [
      {
        id: "vite-provider-secret-env",
        pattern: /\bVITE_(?:QWEN|DASHSCOPE|OPENAI|ALIYUN)[A-Z0-9_]*(?:KEY|TOKEN|SECRET)\b/i,
      },
      {
        id: "import-meta-provider-secret-env",
        pattern: /import\.meta\.env\.[A-Z0-9_]*(?:QWEN|DASHSCOPE|OPENAI|ALIYUN)[A-Z0-9_]*(?:KEY|TOKEN|SECRET)\b/i,
      },
      {
        id: "process-provider-secret-env",
        pattern: /process\.env\.[A-Z0-9_]*(?:QWEN|DASHSCOPE|OPENAI|ALIYUN)[A-Z0-9_]*(?:KEY|TOKEN|SECRET)\b/i,
      },
      {
        id: "browser-bearer-auth-header",
        pattern: /\bAuthorization\s*:\s*[`'"]?\s*Bearer\b/i,
      },
      {
        id: "literal-api-key",
        pattern: /\b(?:sk-[A-Za-z0-9._-]{20,}|dashscope-[A-Za-z0-9._-]{20,})\b/,
      },
    ],
  },
  {
    area: "browser build",
    required: requireDist,
    roots: ["dist"],
    rules: [
      {
        id: "vite-provider-secret-env",
        pattern: /\bVITE_(?:QWEN|DASHSCOPE|OPENAI|ALIYUN)[A-Z0-9_]*(?:KEY|TOKEN|SECRET)\b/i,
      },
      {
        id: "browser-bearer-auth-header",
        pattern: /\bAuthorization\s*:\s*[`'"]?\s*Bearer\b/i,
      },
      {
        id: "literal-api-key",
        pattern: /\b(?:sk-[A-Za-z0-9._-]{20,}|dashscope-[A-Za-z0-9._-]{20,})\b/,
      },
    ],
  },
];

const findings = [];
const scanned = {};

for (const target of scanTargets) {
  scanned[target.area] = 0;
  for (const root of target.roots) {
    const absoluteRoot = path.join(repoRoot, root);
    if (!existsSync(absoluteRoot)) {
      if (target.required) {
        findings.push({ area: target.area, file: root, rule: "missing-required-scan-root" });
      }
      continue;
    }

    for (const file of listTextFiles(absoluteRoot)) {
      scanned[target.area] += 1;
      const text = readFileSync(file, "utf8");
      for (const rule of target.rules) {
        if (rule.pattern.test(text)) {
          findings.push({ area: target.area, file: path.relative(repoRoot, file), rule: rule.id });
        }
      }
    }
  }
}

if (findings.length > 0) {
  console.error("Client secret exposure check failed.");
  for (const finding of findings) {
    console.error(`- ${finding.area}: ${finding.file} matched ${finding.rule}`);
  }
  process.exit(1);
}

console.log("Client secret exposure check passed.");
for (const [area, count] of Object.entries(scanned)) {
  console.log(`- ${area}: scanned ${count} files`);
}

function listTextFiles(root) {
  const filePaths = [];
  const current = statSync(root);
  if (current.isFile()) {
    if (isTextFile(root)) filePaths.push(root);
    return filePaths;
  }

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      filePaths.push(...listTextFiles(absolutePath));
    } else if (entry.isFile() && isTextFile(absolutePath)) {
      filePaths.push(absolutePath);
    }
  }
  return filePaths;
}

function isTextFile(filePath) {
  return [
    ".css",
    ".html",
    ".js",
    ".json",
    ".jsx",
    ".mjs",
    ".svg",
    ".ts",
    ".tsx",
    ".txt",
  ].includes(path.extname(filePath));
}

function printHelp() {
  console.log(`Usage:
  node scripts/check-client-secret-exposure.mjs [--require-dist]

Checks browser source and, when present or required, dist assets for provider secret exposure.
The check reports only file paths and rule ids; it never prints matched content.

Options:
  --require-dist  Fail if dist is missing. Use after npm run build in CI or release validation.
`);
}
