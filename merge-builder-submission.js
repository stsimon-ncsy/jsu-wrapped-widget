const fs = require("fs");
const path = require("path");
const dataValidator = require("./validate-wrapped-data.js");

const SUBMISSION_SCHEMA = "jsu-wrapped-builder-submission";
const ALLOWED_ROOTS = ["defaults", "regions", "programs", "campaigns", "chapters"];
const BLOCKED_KEYS = ["__proto__", "constructor", "prototype"];
const DEFAULT_STORY_DATA_PATH = "sample-wrapped-2026.json";
const DEFAULT_TEEN_DATA_PATH = "sample-teen-wrapped-2026.json";

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

  if (!isBuilderGeneratedMergePath(mergePath)) {
    throw new Error("Submission merge_path must be a builder-generated scope or variant path.");
  }
}

function isBuilderGeneratedMergePath(mergePath) {
  const root = mergePath[0];

  if (root === "defaults") {
    return mergePath.length === 1 || (mergePath.length === 3 && mergePath[1] === "variants");
  }

  return mergePath.length === 2 || (mergePath.length === 4 && mergePath[2] === "variants");
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

function assertPatchHasChanges(value) {
  if (!isPlainObject(value) || !Object.keys(value).length) {
    throw new Error("Submission config_patch has no changes.");
  }
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
  assertPatchHasChanges(submission.config_patch);
}

function mergeSubmission(config, submission) {
  validateSubmission(submission);
  deepMerge(targetForMergePath(config, submission.merge_path), submission.config_patch);
  return config;
}

function validateMergedConfig(config, options) {
  const settings = options || {};
  const storyDataPath = settings.storyDataPath || DEFAULT_STORY_DATA_PATH;
  const teenDataPath = settings.teenDataPath || DEFAULT_TEEN_DATA_PATH;

  if (!fs.existsSync(storyDataPath) || !fs.existsSync(teenDataPath)) {
    return {
      ok: true,
      skipped: true,
      errors: []
    };
  }

  return dataValidator.validateWrappedPackage({
    chapterRecords: readJson(storyDataPath),
    teenRecords: readJson(teenDataPath),
    config
  });
}

function textValue(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function formatSubmitter(submission) {
  const name = textValue(submission.submitter_name);
  const email = textValue(submission.submitter_email);

  if (name && email) {
    return name + " <" + email + ">";
  }

  return name || email;
}

function formatChangeSummaryItem(item) {
  if (!isPlainObject(item)) {
    return "";
  }

  const label = textValue(item.label || item.field || item.card_id || item.type || "Change");

  if (item.type === "setting") {
    return label + ": " + textValue(item.value);
  }

  if (item.type === "metric_correction") {
    return label + ": " + textValue(item.official_value) + " -> " + textValue(item.corrected_value);
  }

  if (item.type === "hidden_screen") {
    return "Hide " + label;
  }

  if (item.type === "screen_rewrite") {
    const fields = Array.isArray(item.fields) ? item.fields.map(textValue).filter(Boolean).join(", ") : "";
    return label + (fields ? ": updated " + fields : ": updated copy");
  }

  if (item.type === "custom_screens") {
    const count = textValue(item.count || "");
    const headlines = Array.isArray(item.headlines) ? item.headlines.map(textValue).filter(Boolean).join("; ") : "";
    return (count ? count + " " : "") + "custom screen" + (count === "1" ? "" : "s") + (headlines ? ": " + headlines : "");
  }

  return label;
}

function printSubmissionReview(submission) {
  const submitter = formatSubmitter(submission);
  const note = textValue(submission.submitter_note);
  const previewUrl = textValue(submission.preview_url);
  const changes = Array.isArray(submission.change_summary)
    ? submission.change_summary.map(formatChangeSummaryItem).filter(Boolean)
    : [];

  if (submitter) {
    console.log("Submitter: " + submitter);
  }

  if (note) {
    console.log("Reviewer note: " + note);
  }

  if (previewUrl) {
    console.log("Preview URL: " + previewUrl);
  }

  if (changes.length) {
    console.log("Changes:");
    changes.forEach((change) => {
      console.log("- " + change);
    });
  }
}

function usage() {
  return [
    "Usage:",
    "  node merge-builder-submission.js path/to/submission.json [wrapped-config-2026.json] [--dry-run]",
    "",
    "The submission JSON should come from the builder's Copy submission or Download submission button."
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
  const merged = mergeSubmission(cloneValue(config), submission);
  const validation = validateMergedConfig(merged);
  const label = [
    submission.scope_type,
    submission.scope_slug,
    submission.variant_slug
  ].filter(Boolean).join(" / ") || submission.merge_path.join(".");

  if (!validation.ok) {
    console.error("Merged config validation failed");
    validation.errors.forEach((error) => {
      console.error("- " + error);
    });
    process.exit(1);
  }

  if (dryRun) {
    console.log("Submission is valid for " + label + (validation.skipped ? " (package validation skipped)." : "."));
    printSubmissionReview(submission);
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
  validateSubmission,
  validateMergedConfig
};
