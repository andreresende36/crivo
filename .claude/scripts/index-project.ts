#!/usr/bin/env node
import * as fs from "fs"
import * as path from "path"
import { DatabaseSync } from "node:sqlite"

const db = new DatabaseSync(".claude/context.db");

db.exec(`
  DROP TABLE IF EXISTS dependencies;
  DROP TABLE IF EXISTS observations;
  DROP TABLE IF EXISTS symbols;

  CREATE TABLE symbols (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    type       TEXT NOT NULL,
    file       TEXT NOT NULL,
    line_start INTEGER,
    line_end   INTEGER,
    signature  TEXT,
    docstring  TEXT,
    last_indexed TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS observations (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol_id    INTEGER REFERENCES symbols(id),
    content      TEXT NOT NULL,
    session_date TEXT NOT NULL,
    is_stale     BOOLEAN DEFAULT FALSE
  );

  CREATE TABLE IF NOT EXISTS dependencies (
    caller_id INTEGER REFERENCES symbols(id),
    callee_id INTEGER REFERENCES symbols(id),
    PRIMARY KEY (caller_id, callee_id)
  );

  CREATE INDEX idx_symbols_name ON symbols(name);
  CREATE INDEX idx_symbols_file ON symbols(file);
`);

const insertSymbol = db.prepare(`
  INSERT INTO symbols (name, type, file, line_start, line_end, signature)
  VALUES (@name, @type, @file, @lineStart, @lineEnd, @signature)
`);

function parseFile(filePath: string, relativePath: string) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  lines.forEach((line, i) => {
    const lineNum = i + 1;

    const funcMatch = line.match(
      /^export\s+(async\s+)?function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)/
    );
    if (funcMatch) {
      const [, , name, params] = funcMatch;
      insertSymbol.run({
        name,
        type: "function",
        file: relativePath,
        lineStart: lineNum,
        lineEnd: lineNum,
        signature: `function ${name}(${params})`,
      });
    }

    const classMatch = line.match(
      /^export\s+(abstract\s+)?class\s+([a-zA-Z_][a-zA-Z0-9_]*)/
    );
    if (classMatch) {
      const [, , name] = classMatch;
      insertSymbol.run({
        name,
        type: "class",
        file: relativePath,
        lineStart: lineNum,
        lineEnd: lineNum,
        signature: `class ${name}`,
      });
    }

    const interfaceMatch = line.match(
      /^export\s+interface\s+([a-zA-Z_][a-zA-Z0-9_]*)/
    );
    if (interfaceMatch) {
      const [, name] = interfaceMatch;
      insertSymbol.run({
        name,
        type: "interface",
        file: relativePath,
        lineStart: lineNum,
        lineEnd: lineNum,
        signature: `interface ${name}`,
      });
    }

    const typeMatch = line.match(/^export\s+type\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (typeMatch) {
      const [, name] = typeMatch;
      insertSymbol.run({
        name,
        type: "type",
        file: relativePath,
        lineStart: lineNum,
        lineEnd: lineNum,
        signature: `type ${name}`,
      });
    }
  });
}

function walkDir(dir: string, baseDir: string) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (["node_modules", "dist", ".git", ".claude"].includes(entry.name)) {
      continue;
    }

    if (entry.isDirectory()) {
      walkDir(fullPath, baseDir);
    } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      try {
        parseFile(fullPath, relativePath);
      } catch {
        // ignore files that fail to parse
      }
    }
  }
}

const srcDir = process.argv[2] || "src";
const resolvedSrc = path.resolve(srcDir);

if (!fs.existsSync(resolvedSrc)) {
  console.log(`[i] Directory '${srcDir}' does not exist — nothing to index yet`);
  process.exit(0);
}

console.log(`Indexing ${srcDir}...`);

const startTime = Date.now();
walkDir(resolvedSrc, process.cwd());

const count = (db.prepare("SELECT COUNT(*) as c FROM symbols").get() as { c: number }).c;
const elapsed = Date.now() - startTime;

console.log(`[v] Indexed ${count} symbols in ${elapsed}ms`);
console.log(`    Database: .claude/context.db`);
