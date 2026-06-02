const fs = require("fs");

const CACHE_TOKEN_RE = /jsuw-prod-\d{8}[a-z0-9-]*/gi;
const TOKEN_FORMAT_RE = /^jsuw-prod-\d{8}[a-z0-9-]*$/i;
const FILES = [
  "index.html",
  "embed-example.html",
  "builder.html",
  "cta-prefill-smoke.html",
  "cta-link-smoke.html",
  "wrapped-builder.js",
  "wordpress-inline-embed.html",
  "README.md",
  "docs/production-readiness.md",
  "qa-smoke.js"
];

function validateToken(token) {
  const value = String(token || "").trim();

  if (!TOKEN_FORMAT_RE.test(value)) {
    throw new Error("Cache token must look like jsuw-prod-20260601h.");
  }

  return value;
}

function replaceCacheTokenInText(text, token) {
  let count = 0;
  const nextToken = validateToken(token);
  const output = String(text).replace(CACHE_TOKEN_RE, () => {
    count += 1;
    return nextToken;
  });

  return {
    count,
    text: output
  };
}

function updateFile(filePath, token) {
  const original = fs.readFileSync(filePath, "utf8");
  const result = replaceCacheTokenInText(original, token);

  if (result.count) {
    fs.writeFileSync(filePath, result.text);
  }

  return {
    count: result.count,
    filePath
  };
}

function updateFiles(files, token) {
  return files.map((filePath) => updateFile(filePath, token));
}

function usage() {
  return [
    "Usage:",
    "  node bump-cache-token.js jsuw-prod-YYYYMMDDx",
    "",
    "Updates every shared static asset cache token reference used by hosted previews,",
    "the WordPress embed handoff, builder fetches, docs, and smoke tests."
  ].join("\n");
}

function main() {
  const token = process.argv[2];

  if (!token || process.argv.includes("--help") || process.argv.includes("-h")) {
    console.error(usage());
    process.exit(token ? 0 : 1);
  }

  const nextToken = validateToken(token);
  const results = updateFiles(FILES, nextToken);
  const changed = results.filter((item) => item.count > 0);

  if (!changed.length) {
    console.log("No cache tokens found to update.");
    return;
  }

  changed.forEach((item) => {
    console.log(item.filePath + ": " + item.count + " token" + (item.count === 1 ? "" : "s"));
  });
  console.log("Updated shared cache token to " + nextToken + ".");
  console.log("Next: run node sync-wordpress-inline.js and node check-production.js.");
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  FILES,
  replaceCacheTokenInText,
  updateFiles,
  validateToken
};
