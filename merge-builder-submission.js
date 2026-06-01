const fs = require("fs");
const path = require("path");

const SUBMISSION_SCHEMA = "jsu-wrapped-builder-submission";
const ALLOWED_ROOTS = ["defaults", "regions", "programs", "campaigns", "chapters"];
const BLOCKED_KEYS = ["__proto__", "constructor", "prototype"];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function assertSafeMergePath(mergePath) {
  if (!Array.isArray(mergePath) || !mergePath.length) {
    throw new Error("Submission is missing merge_path.");
  }

  if (ALLOWED_ROOTS.indexOf(mergePath[0]) === -1) {
    throw new Error("Submission merge_path must start with " + ALLOWED_ROOTS.join(", ") + ".");
  }

  mergePath.forEach((segment) => {
    if (typeof segment !== "string" || !segment.trim()) {
      throw new Error("Submission merge_path contains an invalid segment.");
    }

    if (BLOCKED_KEYS.indexOf(segment) !== -1) {
      throw new Error("Submission merge_path contains a blocked segment.");
    }
  });
}

function assertSafePatch(value, trail) {
  if (!isPlainObject(value)) {
    throw new Error("Submission config_patch must be an object.");
  }

  Object.keys(value).forEach((key) => {
    if (BLOCKED_KEYS.indexOf(key) !== -1) {
      throw new Error("Submission config_patch contains a blocked key at " + trail.concat(key).join(".") + ".");
    }

    if (isPlainObject(value[key])) {
      assertSafePatch(value[key], trail.concat(key));
    }
  });
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }

  if (isPlainObject(value)) {
    return Object.keys(value).reduce((output, key) => {
      output[key] = cloneValue(value[key]);
      return output;
    }, {});
  }

  return value;
}

function deepMerge(target, patch) {
  const output = isPlainObject(target) ? target : {};

  Object.keys(patch).forEach((key) => {
    const value = patch[key];

    if (isPlainObject(value) && isPlainObject(output[key])) {
      deepMerge(output[key], value);
    } else {
      output[key] = cloneValue(value);
    }
  });

  return output;
}

function targetForMergePath(config, mergePath) {
  let cursor = config;

  mergePath.forEach((segment) => {
    if (!isPlainObject(cursor[segment])) {
      cursor[segment] = {};
    }

    cursor = cursor[segment];
  });

  return cursor;
}

function validateSubmission(submission) {
  if (!isPlainObject(submission)) {
    throw new Error("Submission file must contain a JSON object.");
  }

  if (submission.schema !== SUBMISSION_SCHEMA) {
    throw new Error("Submission schema must be " + SUBMISSION_SCHEMA + ".");
  }

  assertSafeMergePath(submission.merge_path);
  assertSafePatch(submission.config_patch, ["config_patch"]);
}

function mergeSubmission(config, submission) {
  validateSubmission(submission);
  deepMerge(targetForMergePath(config, submission.merge_path), submission.config_patch);
  return config;
}

function usage() {
  return [
    "Usage:",
    "  node merge-builder-submission.js path/to/submission.json [wrapped-config-2026.json] [--dry-run]",
    "",
    "The submission file should come from the builder's Download submission button."
  ].join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.indexOf("--dry-run") !== -1;
  const positional = args.filter((arg) => arg !== "--dry-run");
  const submissionPath = positional[0];
  const configPath = positional[1] || "wrapped-config-2026.json";

  if (!submissionPath) {
    console.error(usage());
    process.exit(1);
  }

  const config = readJson(configPath);
  const submission = readJson(submissionPath);
  const merged = mergeSubmission(config, submission);
  const label = [
    submission.scope_type,
    submission.scope_slug,
    submission.variant_slug
  ].filter(Boolean).join(" / ") || submission.merge_path.join(".");

  if (dryRun) {
    console.log("Submission is valid for " + label + ".");
    return;
  }

  writeJson(configPath, merged);
  console.log("Merged submission into " + path.basename(configPath) + " at " + submission.merge_path.join(".") + ".");
}

if (require.main === module) {
  main();
}

module.exports = {
  mergeSubmission,
  validateSubmission
};
