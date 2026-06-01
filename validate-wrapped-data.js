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

const TEEN_BLOCKED_FIELD_NAMES = new Set([
  "teen_id",
  "student_id",
  "participant_id",
  "person_id",
  "individual_id",
  "user_id",
  "contact_id",
  "crm_id",
  "external_id",
  "first_name",
  "last_name",
  "full_name",
  "student_name",
  "legal_name"
]);

const TEEN_BLOCKED_FIELD_PARTS = [
  "email",
  "phone",
  "mobile",
  "cell",
  "address",
  "birthdate",
  "birthday",
  "date_of_birth",
  "dob"
];

const EMAIL_VALUE_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_VALUE_PATTERN = /\b(?:\+?1[\s.-]?)?(?:\(?[2-9]\d{2}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/;

const STORY_CARD_IDS = new Set([
  "cover",
  "events",
  "reach",
  "moments",
  "new",
  "repeat",
  "biggest",
  "persona",
  "movement",
  "final"
]);

const PROTECTED_STORY_CARD_IDS = new Set([
  "cover",
  "final"
]);

const CUSTOM_CARD_TYPES = new Set([
  "text",
  "metric",
  "stat",
  "number",
  "media",
  "photo",
  "image"
]);

const CUSTOM_CARD_TYPE_LABEL = Array.from(CUSTOM_CARD_TYPES).join(", ");

const MEDIA_CUSTOM_CARD_TYPES = new Set([
  "media",
  "photo",
  "image"
]);

const CONFIG_TOP_LEVEL_KEYS = new Set([
  "version",
  "year",
  "defaults",
  "regions",
  "programs",
  "campaigns",
  "chapters"
]);

const CONFIG_SECTION_KEYS = new Set([
  "label",
  "name",
  "title",
  "description",
  "hidden_from_picker",
  "hiddenFromPicker",
  "brand_logo",
  "palette",
  "accent_palette",
  "cta_label",
  "ctaLabel",
  "cta_target",
  "ctaTarget",
  "cta_href",
  "ctaHref",
  "hidden_cards",
  "card_overrides",
  "record_overrides",
  "custom_cards",
  "variants"
]);

const CARD_OVERRIDE_KEYS = new Set([
  "eyebrow",
  "displayEyebrow",
  "headline",
  "displayHeadline",
  "subtext",
  "badge",
  "markerText",
  "persona",
  "chapterName",
  "schoolName",
  "yearLabel"
]);

const CUSTOM_CARD_KEYS = new Set([
  "id",
  "type",
  "placement",
  "after",
  "before",
  "hidden",
  "eyebrow",
  "displayEyebrow",
  "headline",
  "displayHeadline",
  "value",
  "label",
  "statLabel",
  "subtext",
  "copy",
  "badge",
  "image_url",
  "imageUrl",
  "src",
  "image_alt",
  "imageAlt",
  "alt",
  "caption"
]);

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeCardId(value) {
  const id = slugify(value);
  const aliases = {
    event: "events",
    "events-hosted": "events",
    teens: "reach",
    "teen-reach": "reach",
    "unique-teens": "reach",
    engagement: "moments",
    "engagement-moments": "moments",
    "new-teens": "new",
    "new-faces": "new",
    "repeat-engagement": "repeat",
    "repeat-attendee-rate": "repeat",
    "biggest-event": "biggest",
    "chapter-persona": "persona",
    "bigger-movement": "movement",
    share: "final",
    "final-share": "final"
  };

  return aliases[id] || id;
}

function normalizePlacement(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
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

function normalizeScopeType(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (normalized === "chapter" || normalized === "chapters") {
    return "chapter";
  }

  if (normalized === "region" || normalized === "regional" || normalized === "regions") {
    return "region";
  }

  if (normalized === "program" || normalized === "programs" || normalized === "campaign" || normalized === "campaigns") {
    return "program";
  }

  return "";
}

function getRecordScopeType(record) {
  const explicit = normalizeScopeType(record.scope_type || record.scopeType || record.story_scope || record.storyScope || record.wrapped_scope || record.entity_type);

  if (explicit) {
    return explicit;
  }

  if (!hasValue(record.chapter_slug) && !hasValue(record.chapter_name)) {
    if (hasValue(record.program_slug) || hasValue(record.program_name) || hasValue(record.campaign_slug) || hasValue(record.campaign_name)) {
      return "program";
    }

    if (hasValue(record.region_slug) || hasValue(record.region_name)) {
      return "region";
    }
  }

  return "chapter";
}

function getRecordScopeSlug(record, type) {
  if (type === "region") {
    return record.scope_slug || record.region_slug || record.region_name || record.scope_name;
  }

  if (type === "program") {
    return record.scope_slug || record.program_slug || record.campaign_slug || record.program_name || record.campaign_name || record.scope_name || record.top_program_type;
  }

  return record.chapter_slug || record.scope_slug;
}

function getRecordScopeName(record, type) {
  if (type === "region") {
    return record.scope_name || record.region_name || record.chapter_name;
  }

  if (type === "program") {
    return record.scope_name || record.program_name || record.campaign_name || record.chapter_name || record.top_program_type;
  }

  return record.chapter_name || record.scope_name;
}

function validateRequiredValue(report, value, label, index, field) {
  if (!hasValue(value)) {
    addError(report, `${label}[${index}].${field} is required`);
  }
}

function validateNumericFields(report, record, fields, label, index) {
  fields.forEach((field) => {
    if (!isNonNegativeNumber(record[field])) {
      addError(report, `${label}[${index}].${field} must be a non-negative number`);
    }
  });
}

function normalizeFieldName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function validateTeenPrivacyFields(report, record, index) {
  Object.keys(record).forEach((field) => {
    const normalized = normalizeFieldName(field);
    const value = record[field];

    if (TEEN_BLOCKED_FIELD_NAMES.has(normalized) || TEEN_BLOCKED_FIELD_PARTS.some((part) => normalized.includes(part))) {
      addError(report, `teen records[${index}].${field} is not allowed in teen proof-of-concept data`);
    }

    if (typeof value === "string") {
      if (EMAIL_VALUE_PATTERN.test(value)) {
        addError(report, `teen records[${index}].${field} must not contain an email address`);
      }

      if (PHONE_VALUE_PATTERN.test(value)) {
        addError(report, `teen records[${index}].${field} must not contain a phone number`);
      }
    }
  });
}

function validateChapterRecords(records) {
  const report = validateRecordsArray(records, "story records");
  const seen = {
    chapter: {},
    region: {},
    program: {}
  };

  if (!report.ok) {
    return report;
  }

  records.forEach((record, index) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      addError(report, `story records[${index}] must be an object`);
      return;
    }

    const explicitScope = record.scope_type || record.scopeType || record.story_scope || record.storyScope || record.wrapped_scope || record.entity_type;
    const type = getRecordScopeType(record);
    const scopeSlug = getRecordScopeSlug(record, type);
    const scopeName = getRecordScopeName(record, type);

    if (hasValue(explicitScope) && !normalizeScopeType(explicitScope)) {
      addError(report, `story records[${index}].scope_type must be chapter, region, or program`);
    }

    if (type === "chapter") {
      CHAPTER_REQUIRED_FIELDS.forEach((field) => {
        validateRequiredValue(report, record[field], "story records", index, field);
      });
      validateUniqueSlug(report, seen.chapter, record.chapter_slug, "chapter_slug", index);
    } else {
      validateRequiredValue(report, scopeSlug, "story records", index, "scope_slug");
      validateRequiredValue(report, scopeName, "story records", index, "scope_name");
      validateRequiredValue(report, record.year_label || record.school_year, "story records", index, "year_label");
      validateUniqueSlug(report, seen[type], scopeSlug, `${type} scope_slug`, index);
    }

    validateNumericFields(report, record, CHAPTER_NUMERIC_FIELDS, "story records", index);

    if (hasValue(record.brand_logo) && !["jsu", "ncsy"].includes(String(record.brand_logo).trim().toLowerCase())) {
      addError(report, `story records[${index}].brand_logo must be jsu or ncsy`);
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
    validateTeenPrivacyFields(report, record, index);
  });

  return report;
}

function isKnownPlacement(value) {
  const placement = normalizePlacement(value || "before_final");

  if (["start", "end", "before_final", "after_final"].includes(placement)) {
    return true;
  }

  const match = placement.match(/^(after|before)_(.+)$/);
  const target = match ? normalizeCardId(match[2]) : normalizeCardId(placement);

  return STORY_CARD_IDS.has(target);
}

function validateHiddenCards(report, section, label) {
  if (section.hidden_cards === undefined) {
    return;
  }

  if (!Array.isArray(section.hidden_cards)) {
    addError(report, `${label}.hidden_cards must be an array`);
    return;
  }

  section.hidden_cards.forEach((cardId, index) => {
    const normalized = normalizeCardId(cardId);

    if (!STORY_CARD_IDS.has(normalized)) {
      addError(report, `${label}.hidden_cards[${index}] references unknown card "${cardId}"`);
      return;
    }

    if (PROTECTED_STORY_CARD_IDS.has(normalized)) {
      addError(report, `${label}.hidden_cards[${index}] cannot hide protected card "${normalized}"`);
    }
  });
}

function validateCardOverrides(report, section, label) {
  if (section.card_overrides === undefined) {
    return;
  }

  if (!section.card_overrides || typeof section.card_overrides !== "object" || Array.isArray(section.card_overrides)) {
    addError(report, `${label}.card_overrides must be an object`);
    return;
  }

  Object.keys(section.card_overrides).forEach((cardId) => {
    const normalized = normalizeCardId(cardId);

    if (!STORY_CARD_IDS.has(normalized)) {
      addError(report, `${label}.card_overrides.${cardId} references unknown card`);
    }

    const override = section.card_overrides[cardId];

    if (override && (typeof override !== "object" || Array.isArray(override))) {
      addError(report, `${label}.card_overrides.${cardId} must be an object`);
      return;
    }

    validateKnownKeys(report, override || {}, CARD_OVERRIDE_KEYS, `${label}.card_overrides.${cardId}`);
  });
}

function validateCustomCards(report, section, label) {
  if (section.custom_cards === undefined) {
    return;
  }

  if (!Array.isArray(section.custom_cards)) {
    addError(report, `${label}.custom_cards must be an array`);
    return;
  }

  section.custom_cards.forEach((card, index) => {
    const cardLabel = `${label}.custom_cards[${index}]`;

    if (!card || typeof card !== "object" || Array.isArray(card)) {
      addError(report, `${cardLabel} must be an object`);
      return;
    }

    validateKnownKeys(report, card, CUSTOM_CARD_KEYS, cardLabel);

    const type = String(card.type || "text").trim().toLowerCase();

    if (!CUSTOM_CARD_TYPES.has(type)) {
      addError(report, `${cardLabel}.type must be one of: ${CUSTOM_CARD_TYPE_LABEL}`);
    }

    if (MEDIA_CUSTOM_CARD_TYPES.has(type) && !hasValue(card.image_url) && !hasValue(card.imageUrl) && !hasValue(card.src)) {
      addError(report, `${cardLabel}.image_url is required for media custom cards`);
    }

    [
      ["placement", card.placement],
      ["after", card.after],
      ["before", card.before]
    ].forEach(([field, value]) => {
      if (value !== undefined && !isKnownPlacement(value)) {
        addError(report, `${cardLabel}.${field} references unknown card "${value}"`);
      }
    });
  });
}

function validateKnownKeys(report, object, allowedKeys, label) {
  Object.keys(object || {}).forEach((key) => {
    if (!allowedKeys.has(key)) {
      addError(report, `${label}.${key} is not a supported config key`);
    }
  });
}

function createStoryRecordFieldSet(chapterRecords) {
  const fields = new Set(CHAPTER_REQUIRED_FIELDS.concat(CHAPTER_NUMERIC_FIELDS, [
    "school_year",
    "school_name",
    "brand_logo",
    "largest_event_name",
    "most_active_month",
    "top_program_type",
    "chapter_persona",
    "chapter_line"
  ]));

  (chapterRecords || []).forEach((record) => {
    if (record && typeof record === "object" && !Array.isArray(record)) {
      Object.keys(record).forEach((key) => fields.add(key));
    }
  });

  return fields;
}

function validateRecordOverrides(report, section, label, storyRecordFields) {
  if (section.record_overrides === undefined) {
    return;
  }

  if (!section.record_overrides || typeof section.record_overrides !== "object" || Array.isArray(section.record_overrides)) {
    addError(report, `${label}.record_overrides must be an object`);
    return;
  }

  Object.keys(section.record_overrides).forEach((key) => {
    if (!storyRecordFields.has(key)) {
      addError(report, `${label}.record_overrides.${key} is not a field in the story data`);
    }
  });
}

function validateConfigSection(report, section, label, storyRecordFields) {
  if (section === undefined) {
    return;
  }

  if (!section || typeof section !== "object" || Array.isArray(section)) {
    addError(report, `${label} must be an object`);
    return;
  }

  validateKnownKeys(report, section, CONFIG_SECTION_KEYS, label);
  validateHiddenCards(report, section, label);
  validateCardOverrides(report, section, label);
  validateCustomCards(report, section, label);
  validateRecordOverrides(report, section, label, storyRecordFields);

  if (section.variants !== undefined) {
    if (!section.variants || typeof section.variants !== "object" || Array.isArray(section.variants)) {
      addError(report, `${label}.variants must be an object`);
      return;
    }

    Object.keys(section.variants).forEach((slug) => {
      validateConfigSection(report, section.variants[slug], `${label}.variants.${slug}`, storyRecordFields);
    });
  }
}

function validateConfig(config, chapterRecords) {
  const report = createReport();
  const chapterSlugs = new Set();
  const regionSlugs = new Set();
  const programSlugs = new Set();

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    addError(report, "wrapped config must be an object");
    return report;
  }

  validateKnownKeys(report, config, CONFIG_TOP_LEVEL_KEYS, "config");
  const storyRecordFields = createStoryRecordFieldSet(chapterRecords);

  validateConfigSection(report, config.defaults || {}, "config.defaults", storyRecordFields);

  (chapterRecords || []).forEach((record) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      return;
    }

    const type = getRecordScopeType(record);

    if (type === "chapter") {
      [record.chapter_slug, record.chapter_name].forEach((value) => {
        const slug = slugify(value);

        if (slug) {
          chapterSlugs.add(slug);
        }
      });
    }

    [record.region_slug, record.region_name].forEach((value) => {
      const slug = slugify(value);

      if (slug) {
        regionSlugs.add(slug);
      }
    });

    [record.program_slug, record.program_name, record.campaign_slug, record.campaign_name, record.top_program_type].forEach((value) => {
      const slug = slugify(value);

      if (slug) {
        programSlugs.add(slug);
      }
    });

    if (type === "region") {
      [record.scope_slug, record.scope_name].forEach((value) => {
        const slug = slugify(value);

        if (slug) {
          regionSlugs.add(slug);
        }
      });
    }

    if (type === "program") {
      [record.scope_slug, record.scope_name].forEach((value) => {
        const slug = slugify(value);

        if (slug) {
          programSlugs.add(slug);
        }
      });
    }
  });

  Object.keys(config.chapters || {}).forEach((slug) => {
    if (!chapterSlugs.has(slugify(slug))) {
      addError(report, `config chapter "${slug}" does not match a chapter_slug in data`);
    }

    validateConfigSection(report, config.chapters[slug], `config chapter "${slug}"`, storyRecordFields);
  });

  Object.keys(config.regions || {}).forEach((slug) => {
    if (!regionSlugs.has(slugify(slug))) {
      addError(report, `config region "${slug}" does not match a region_name in data`);
    }

    validateConfigSection(report, config.regions[slug], `config region "${slug}"`, storyRecordFields);
  });

  Object.keys(config.programs || {}).forEach((slug) => {
    if (!programSlugs.has(slugify(slug))) {
      addError(report, `config program "${slug}" does not match a program_slug, program_name, or top_program_type in data`);
    }

    validateConfigSection(report, config.programs[slug], `config program "${slug}"`, storyRecordFields);
  });

  Object.keys(config.campaigns || {}).forEach((slug) => {
    if (!programSlugs.has(slugify(slug))) {
      addError(report, `config campaign "${slug}" does not match a program_slug, program_name, campaign_slug, campaign_name, or top_program_type in data`);
    }

    validateConfigSection(report, config.campaigns[slug], `config campaign "${slug}"`, storyRecordFields);
  });

  return report;
}

function validateWrappedPackage(input) {
  const report = createReport();
  const chapterRecords = input && (input.storyRecords || input.chapterRecords);
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
