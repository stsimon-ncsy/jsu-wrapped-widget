const fs = require("fs");

const CHAPTER_DATA_PATH = "sample-wrapped-2026.json";
const TEEN_DATA_PATH = "sample-teen-wrapped-2026.json";
const CONFIG_PATH = "wrapped-config-2026.json";

const CHAPTER_REQUIRED_FIELDS = [
  "chapter_slug",
  "chapter_name",
  "region_name",
  "year_label"
];

const CHAPTER_NUMERIC_FIELDS = [
  "events_hosted",
  "unique_teens",
  "engagement_moments",
  "new_teens",
  "repeat_attendee_rate",
  "avg_attendance",
  "largest_event_attendance",
  "schools_represented",
  "learning_sessions",
  "shabbatons",
  "region_unique_teens",
  "region_events_hosted",
  "region_schools_represented",
  "national_engagement_moments",
  "national_programs_hosted",
  "national_teens_reached"
];

const TEEN_NUMERIC_FIELDS = [
  "events_attended",
  "longest_streak",
  "friends_brought",
  "schools_in_room",
  "shabbatons",
  "learning_sessions",
  "leadership_moments",
  "chapter_events_hosted",
  "chapter_unique_teens",
  "chapter_engagement_moments",
  "chapter_new_teens",
  "region_unique_teens",
  "region_schools_represented",
  "national_engagement_moments"
];

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function createReport() {
  return {
    ok: true,
    errors: [],
    warnings: []
  };
}

function addError(report, message) {
  report.ok = false;
  report.errors.push(message);
}

function mergeReport(target, source) {
  if (!source.ok) {
    target.ok = false;
  }

  target.errors.push(...source.errors);
  target.warnings.push(...source.warnings);
  return target;
}

function isNonNegativeNumber(value) {
  if (!hasValue(value)) {
    return true;
  }

  const numeric = Number(String(value).replace(/,/g, "").replace(/%$/, ""));
  return Number.isFinite(numeric) && numeric >= 0;
}

function validateRecordsArray(records, label) {
  const report = createReport();

  if (!Array.isArray(records)) {
    addError(report, `${label} must be an array`);
  }

  return report;
}

function validateUniqueSlug(report, seen, slug, label, index) {
  const normalized = slugify(slug);

  if (!normalized) {
    addError(report, `${label}[${index}] has a blank slug`);
    return;
  }

  if (seen[normalized] !== undefined) {
    addError(report, `Duplicate ${label} slug "${normalized}" at rows ${seen[normalized]} and ${index}`);
    return;
  }

  seen[normalized] = index;
}

function validateNumericFields(report, record, fields, label, index) {
  fields.forEach((field) => {
    if (!isNonNegativeNumber(record[field])) {
      addError(report, `${label}[${index}].${field} must be a non-negative number`);
    }
  });
}

function validateChapterRecords(records) {
  const report = validateRecordsArray(records, "chapter records");
  const seen = {};

  if (!report.ok) {
    return report;
  }

  records.forEach((record, index) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      addError(report, `chapter records[${index}] must be an object`);
      return;
    }

    CHAPTER_REQUIRED_FIELDS.forEach((field) => {
      if (!hasValue(record[field])) {
        addError(report, `chapter records[${index}].${field} is required`);
      }
    });

    validateUniqueSlug(report, seen, record.chapter_slug, "chapter_slug", index);
    validateNumericFields(report, record, CHAPTER_NUMERIC_FIELDS, "chapter records", index);

    if (hasValue(record.brand_logo) && !["jsu", "ncsy"].includes(String(record.brand_logo).trim().toLowerCase())) {
      addError(report, `chapter records[${index}].brand_logo must be jsu or ncsy`);
    }
  });

  return report;
}

function validateTeenRecords(records) {
  const report = validateRecordsArray(records, "teen records");
  const seen = {};

  if (!report.ok) {
    return report;
  }

  records.forEach((record, index) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      addError(report, `teen records[${index}] must be an object`);
      return;
    }

    ["teen_slug", "teen_name", "chapter_name", "year_label"].forEach((field) => {
      if (!hasValue(record[field])) {
        addError(report, `teen records[${index}].${field} is required`);
      }
    });

    validateUniqueSlug(report, seen, record.teen_slug, "teen_slug", index);
    validateNumericFields(report, record, TEEN_NUMERIC_FIELDS, "teen records", index);
  });

  return report;
}

function validateConfig(config, chapterRecords) {
  const report = createReport();
  const chapterSlugs = new Set((chapterRecords || []).map((record) => slugify(record && record.chapter_slug)).filter(Boolean));
  const regionSlugs = new Set((chapterRecords || []).map((record) => slugify(record && record.region_name)).filter(Boolean));

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    addError(report, "wrapped config must be an object");
    return report;
  }

  Object.keys(config.chapters || {}).forEach((slug) => {
    if (!chapterSlugs.has(slugify(slug))) {
      addError(report, `config chapter "${slug}" does not match a chapter_slug in data`);
    }
  });

  Object.keys(config.regions || {}).forEach((slug) => {
    if (!regionSlugs.has(slugify(slug))) {
      addError(report, `config region "${slug}" does not match a region_name in data`);
    }
  });

  return report;
}

function validateWrappedPackage(input) {
  const report = createReport();
  const chapterRecords = input && input.chapterRecords;
  const teenRecords = input && input.teenRecords;
  const config = input && input.config;

  mergeReport(report, validateChapterRecords(chapterRecords));
  mergeReport(report, validateTeenRecords(teenRecords));
  mergeReport(report, validateConfig(config, chapterRecords));

  return report;
}

function printReport(report) {
  if (report.ok) {
    console.log("wrapped data validation ok");
    return;
  }

  console.error("wrapped data validation failed");
  report.errors.forEach((error) => {
    console.error(`- ${error}`);
  });
}

function main() {
  const report = validateWrappedPackage({
    chapterRecords: readJson(CHAPTER_DATA_PATH),
    teenRecords: readJson(TEEN_DATA_PATH),
    config: readJson(CONFIG_PATH)
  });

  printReport(report);

  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  validateChapterRecords,
  validateTeenRecords,
  validateConfig,
  validateWrappedPackage
};
