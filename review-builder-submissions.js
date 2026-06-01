const fs = require("fs");
const path = require("path");
const merger = require("./merge-builder-submission.js");

const DEFAULT_SUBMISSIONS_DIR = "staff-submissions";
const DEFAULT_CONFIG_PATH = "wrapped-config-2026.json";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function textValue(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function jsonFilesInDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs.readdirSync(dirPath)
    .filter((file) => file.toLowerCase().endsWith(".json"))
    .sort()
    .map((file) => path.join(dirPath, file));
}

function formatSubmitter(submission) {
  const name = textValue(submission.submitter_name);
  const email = textValue(submission.submitter_email);

  if (name && email) {
    return `${name} <${email}>`;
  }

  return name || email;
}

function formatChangeSummaryItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return "";
  }

  const label = textValue(item.label || item.field || item.card_id || item.type || "Change");

  if (item.type === "setting") {
    return `${label}: ${textValue(item.value)}`;
  }

  if (item.type === "metric_correction") {
    return `${label}: ${textValue(item.official_value)} -> ${textValue(item.corrected_value)}`;
  }

  if (item.type === "hidden_screen") {
    return `Hide ${label}`;
  }

  if (item.type === "screen_rewrite") {
    const fields = Array.isArray(item.fields) ? item.fields.map(textValue).filter(Boolean).join(", ") : "";
    return label + (fields ? `: updated ${fields}` : ": updated copy");
  }

  if (item.type === "custom_screens") {
    const count = textValue(item.count || "");
    const headlines = Array.isArray(item.headlines) ? item.headlines.map(textValue).filter(Boolean).join("; ") : "";
    return `${count ? count + " " : ""}custom screen${count === "1" ? "" : "s"}${headlines ? ": " + headlines : ""}`;
  }

  return label;
}

function reviewSubmissionFile(filePath, config) {
  const submission = merger.normalizeSubmission(readJson(filePath));
  const merged = merger.mergeSubmission(cloneValue(config), submission);
  const validation = merger.validateMergedConfig(merged);

  if (!validation.ok) {
    throw new Error(`Merged config validation failed: ${validation.errors.join("; ")}`);
  }

  return submission;
}

function printSubmissionSummary(submission) {
  const submitter = formatSubmitter(submission);
  const note = textValue(submission.submitter_note);
  const previewUrl = textValue(submission.preview_url);
  const changes = Array.isArray(submission.change_summary)
    ? submission.change_summary.map(formatChangeSummaryItem).filter(Boolean)
    : [];

  if (submitter) {
    console.log(`Submitter: ${submitter}`);
  }

  if (note) {
    console.log(`Reviewer note: ${note}`);
  }

  if (previewUrl) {
    console.log(`Preview URL: ${previewUrl}`);
  }

  if (changes.length) {
    console.log("Changes:");
    changes.forEach((change) => {
      console.log(`- ${change}`);
    });
  }
}

function reviewSubmissions(submissionsDir, configPath) {
  const files = jsonFilesInDir(submissionsDir);
  const config = readJson(configPath);
  const totals = {
    invalid: 0,
    valid: 0
  };

  if (!files.length) {
    console.log(`No staff submission JSON files found in ${submissionsDir}.`);
    return totals;
  }

  console.log(`Reviewing ${files.length} staff submission JSON files in ${submissionsDir}`);

  files.forEach((filePath) => {
    const fileName = path.basename(filePath);

    try {
      const submission = reviewSubmissionFile(filePath, config);

      totals.valid += 1;
      console.log(`\n[OK] ${fileName}`);
      printSubmissionSummary(submission);
    } catch (error) {
      totals.invalid += 1;
      console.log(`\n[INVALID] ${fileName}`);
      console.log(`Error: ${error.message}`);
    }
  });

  console.log(`\nSummary: ${totals.valid} valid, ${totals.invalid} invalid`);
  return totals;
}

function usage() {
  return [
    "Usage:",
    "  node review-builder-submissions.js [staff-submissions] [wrapped-config-2026.json]",
    "",
    "Reviews every JSON file in the submissions folder without writing to wrapped-config-2026.json."
  ].join("\n");
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return;
  }

  const submissionsDir = args[0] || DEFAULT_SUBMISSIONS_DIR;
  const configPath = args[1] || DEFAULT_CONFIG_PATH;
  const totals = reviewSubmissions(submissionsDir, configPath);

  if (totals.invalid > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`staff submission review failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  reviewSubmissions
};
