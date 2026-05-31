const fs = require("fs");
const api = require("./jsu-wrapped.js");
const dataValidator = require("./validate-wrapped-data.js");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function loadText(path) {
  return fs.readFileSync(path, "utf8");
}

function assertNoBrokenText(cards) {
  const bad = /\b(undefined|null|NaN)\b/i;

  cards.forEach((card) => {
    ["eyebrow", "headline", "displayHeadline", "subtext", "stat", "badge", "persona"].forEach((key) => {
      if (card[key] !== undefined && card[key] !== null) {
        assert(!bad.test(String(card[key])), `Broken ${key} text on ${card.id}: ${card[key]}`);
      }
    });
  });
}

function runLayeredVariantSmoke() {
  const record = {
    chapter_slug: "baltimore",
    chapter_name: "Baltimore",
    region_name: "Atlantic Seaboard",
    top_program_type: "Shabbat",
    events_hosted: 10,
    unique_teens: 20,
    engagement_moments: 30
  };
  const config = {
    defaults: {
      variants: {
        donor: { palette: "sunset", cta_label: "Support the movement" }
      }
    },
    regions: {
      "atlantic-seaboard": {
        variants: {
          donor: { record_overrides: { events_hosted: 40 } }
        }
      }
    },
    programs: {
      shabbat: {
        variants: {
          donor: {
            card_overrides: {
              events: { subtext: "Program donor text for {events_hosted} events" }
            }
          }
        }
      }
    },
    chapters: {
      baltimore: {
        variants: {
          donor: {
            card_overrides: {
              events: { headline: "Donors powered {events_hosted} events" }
            }
          }
        }
      }
    }
  };
  const storyConfig = api.resolveStoryConfig(config, record, { program: "shabbat", variant: "donor" });
  const effective = api.createEffectiveRecord(record, storyConfig);
  const cards = api.createCards(effective, { storyConfig });
  const events = cards.find((card) => card.id === "events");

  assert(storyConfig.palette === "sunset", "default variant did not apply");
  assert(effective.events_hosted === 40, "region variant metric did not apply");
  assert(events.headline === "Donors powered 40 events", `chapter variant copy mismatch: ${events.headline}`);
  assert(events.subtext === "Program donor text for 40 events", `program variant copy mismatch: ${events.subtext}`);
}

function runPickerSmoke(records, config) {
  const baltimore = records.find((record) => record.chapter_slug === "baltimore");
  const html = api.renderChapterPickerMarkup({
    records: [baltimore],
    config,
    url: "https://example.org/wrapped/"
  });

  assert(html.includes("variant=donor-recap"), "sample picker variant link missing");
  assert(html.includes("Donor recap"), "sample picker variant label missing");
  assert((html.match(/jsuw-picker-item /g) || []).length === 1, "picker duplicated chapter rows");
}

function runHiddenVariantSmoke() {
  const records = [{
    chapter_slug: "baltimore",
    chapter_name: "Baltimore",
    region_name: "Atlantic Seaboard",
    events_hosted: 1,
    unique_teens: 2,
    engagement_moments: 3
  }];
  const config = {
    chapters: {
      baltimore: {
        variants: {
          hidden: {
            label: "Hidden test",
            hidden_from_picker: true,
            card_overrides: {
              events: { headline: "Hidden variant works" }
            }
          }
        }
      }
    }
  };
  const html = api.renderChapterPickerMarkup({ records, config, url: "https://example.org/wrapped/" });
  const storyConfig = api.resolveStoryConfig(config, records[0], { variant: "hidden" });
  const cards = api.createCards(api.createEffectiveRecord(records[0], storyConfig), { storyConfig });

  assert(!html.includes("Hidden test"), "hidden variant appeared in picker");
  assert(cards.find((card) => card.id === "events").headline === "Hidden variant works", "hidden variant URL resolution failed");
}

function runSampleVariantSmoke(records, config) {
  const record = records.find((item) => item.chapter_slug === "baltimore");
  const storyConfig = api.resolveStoryConfig(config, record, { variant: "donor-recap" });
  const effective = api.createEffectiveRecord(record, storyConfig);
  const cards = api.createCards(effective, { storyConfig });
  const events = cards.find((card) => card.id === "events");
  const final = cards.find((card) => card.id === "final");

  assert(events.headline.includes("Supporters helped power 338 events"), `sample variant event mismatch: ${events.headline}`);
  assert(final.subtext.includes("338 events"), `sample variant final copy mismatch: ${final.subtext}`);
  assertNoBrokenText(cards);
}

function runPageMetadataSmoke() {
  const ncsyMetadata = api.createPageMetadata({
    record: {
      chapter_slug: "baltimore",
      chapter_name: "Baltimore",
      region_name: "Atlantic Seaboard",
      year_label: "2025-2026",
      brand_logo: "ncsy"
    }
  });
  const jsuMetadata = api.createPageMetadata({
    record: {
      chapter_slug: "greater-washington",
      chapter_name: "Greater Washington",
      region_name: "Atlantic Seaboard",
      year_label: "2025-2026",
      brand_logo: "jsu"
    }
  });

  assert(ncsyMetadata.title === "JSU/NCSY Wrapped - Baltimore", `NCSY metadata title mismatch: ${ncsyMetadata.title}`);
  assert(jsuMetadata.title === "JSU/NCSY Wrapped - Greater Washington", `JSU metadata title mismatch: ${jsuMetadata.title}`);
  assert(ncsyMetadata.description.includes("Baltimore Wrapped"), "metadata description missing chapter name");
  assert(ncsyMetadata.image && ncsyMetadata.image.includes("wrapped-social-preview.png"), "metadata image missing social preview");
}

function runAnalyticsSmoke() {
  const payload = api.createAnalyticsPayload({
    record: { chapter_slug: "baltimore", chapter_name: "Baltimore" },
    cards: [{ theme: "events", type: "stat" }],
    index: 0,
    experienceMode: "chapter",
    storyConfig: {
      active_variant: "donor-recap",
      active_variant_label: "Donor recap"
    }
  }, "test_event");

  assert(payload.variant_slug === "donor-recap", "variant analytics slug missing");
  assert(payload.variant_label === "Donor recap", "variant analytics label missing");
}

function runAnalyticsDocsSmoke() {
  const docs = loadText("analytics-gtm-setup.md");
  const payload = api.createAnalyticsPayload({
    record: {
      scope_type: "region",
      scope_slug: "atlantic-seaboard",
      scope_name: "Atlantic Seaboard",
      region_name: "Atlantic Seaboard"
    },
    cards: [{ theme: "movement", type: "movement" }],
    index: 0,
    experienceMode: "region",
    storyConfig: {
      active_variant: "donor-recap",
      active_variant_label: "Donor recap"
    }
  }, "docs_test");
  const requiredKeys = [
    "scope_type",
    "scope_slug",
    "scope_name",
    "variant_slug",
    "variant_label"
  ];

  requiredKeys.forEach((key) => {
    assert(Object.prototype.hasOwnProperty.call(payload, key), `analytics payload missing ${key}`);
    assert(docs.includes(key), `analytics GTM docs missing ${key}`);
  });
}

function runStoryScopeSmoke() {
  const records = [
    {
      scope_type: "region",
      scope_slug: "atlantic-seaboard",
      scope_name: "Atlantic Seaboard",
      region_slug: "atlantic-seaboard",
      region_name: "Atlantic Seaboard",
      year_label: "2025-2026",
      events_hosted: 420,
      unique_teens: 2850,
      engagement_moments: 9200,
      region_unique_teens: 2850,
      national_engagement_moments: 92000,
      chapter_persona: "The Regional Spark"
    },
    {
      scope_type: "program",
      scope_slug: "shabbat",
      program_slug: "shabbat",
      program_name: "Shabbat Across JSU",
      year_label: "2025-2026",
      events_hosted: 88,
      unique_teens: 760,
      engagement_moments: 2800,
      chapter_persona: "The Shabbat Powerhouse"
    },
    {
      chapter_slug: "baltimore",
      chapter_name: "Baltimore",
      region_name: "Atlantic Seaboard",
      events_hosted: 338,
      unique_teens: 533,
      engagement_moments: 2232
    }
  ];
  const regionRequest = api.getStoryRequest("https://example.org/wrapped/?scope=region&region=atlantic-seaboard");
  const programRequest = api.getStoryRequest("https://example.org/wrapped/?scope=program&program=shabbat");
  const pickerRequest = api.getStoryRequest("https://example.org/wrapped/?region=atlantic-seaboard");
  const region = api.findStoryRecord(records, regionRequest);
  const program = api.findStoryRecord(records, programRequest);
  const chapter = api.findStoryRecord(records, { type: "chapter", slug: "baltimore" });
  const regionCards = api.createCards(region);
  const final = regionCards.find((card) => card.id === "final");
  const movement = regionCards.find((card) => card.id === "movement");
  const payload = api.createAnalyticsPayload({
    record: region,
    cards: regionCards,
    index: 0,
    experienceMode: "region"
  }, "scope_test");
  const namedChapterScope = api.getStoryScope({
    chapter_name: "Northwood JSU",
    region_name: "Atlantic Seaboard"
  });

  assert(regionRequest.type === "region", "region story request type missing");
  assert(regionRequest.slug === "atlantic-seaboard", "region story request slug missing");
  assert(programRequest.type === "program", "program story request type missing");
  assert(program && program.program_name === "Shabbat Across JSU", "program story record not found");
  assert(!pickerRequest, "plain region picker URL should not become a region story");
  assert(region && region.scope_name === "Atlantic Seaboard", "region story record not found");
  assert(chapter && chapter.chapter_name === "Baltimore", "chapter story record not found");
  assert(final.headline === "Atlantic Seaboard Wrapped", `region final headline mismatch: ${final.headline}`);
  assert(final.summaryStats.some((stat) => stat.label === "of us, one region"), "region final stat label still uses chapter language");
  assert(movement.subtext === "One region. One national movement.", `region movement copy mismatch: ${movement.subtext}`);
  assert(payload.scope_type === "region", "scope analytics type missing");
  assert(payload.scope_slug === "atlantic-seaboard", "scope analytics slug missing");
  assert(namedChapterScope.type === "chapter", "chapter name with region name should not infer region scope");
}

function runScopedStoryValidationSmoke() {
  const storyRecords = [
    {
      chapter_slug: "baltimore",
      chapter_name: "Baltimore",
      region_name: "Atlantic Seaboard",
      year_label: "2025-2026",
      events_hosted: 338
    },
    {
      scope_type: "region",
      scope_slug: "atlantic-seaboard",
      scope_name: "Atlantic Seaboard",
      region_name: "Atlantic Seaboard",
      year_label: "2025-2026",
      events_hosted: 1112,
      unique_teens: 3364
    },
    {
      scope_type: "program",
      scope_slug: "shabbat",
      scope_name: "Shabbat Across JSU",
      program_slug: "shabbat",
      program_name: "Shabbat Across JSU",
      year_label: "2025-2026",
      events_hosted: 88,
      unique_teens: 760
    }
  ];
  const teenRecords = [{
    teen_slug: "maya-test",
    teen_name: "Maya",
    chapter_name: "Northwood JSU",
    year_label: "2025-2026"
  }];
  const config = {
    regions: {
      "atlantic-seaboard": { palette: "purple-gold" }
    },
    programs: {
      shabbat: { palette: "sunset" }
    },
    chapters: {
      baltimore: { palette: "electric" }
    }
  };
  const report = dataValidator.validateWrappedPackage({
    storyRecords,
    teenRecords,
    config
  });
  const duplicateScopeReport = dataValidator.validateChapterRecords([
    storyRecords[1],
    Object.assign({}, storyRecords[1], { scope_name: "Duplicate Atlantic Seaboard" })
  ]);
  const badProgramConfigReport = dataValidator.validateConfig({
    programs: {
      "missing-program": {}
    }
  }, storyRecords);
  const badCampaignConfigReport = dataValidator.validateConfig({
    programs: {
      shabbat: {}
    },
    campaigns: {
      "missing-campaign": {}
    }
  }, storyRecords);

  assert(report.ok, `mixed story scope validation failed: ${report.errors.join("; ")}`);
  assert(!duplicateScopeReport.ok && duplicateScopeReport.errors.some((error) => error.includes("Duplicate")), "duplicate region scope slugs should fail validation");
  assert(!badProgramConfigReport.ok && badProgramConfigReport.errors.some((error) => error.includes("config program")), "unknown program config should fail validation");
  assert(!badCampaignConfigReport.ok && badCampaignConfigReport.errors.some((error) => error.includes("config campaign")), "unknown campaign config should fail validation");
}

function runBuilderFutureScopeSmoke() {
  const builderHtml = loadText("builder.html");
  const builderJs = loadText("wrapped-builder.js");

  assert(builderHtml.includes('<option value="program">Program default</option>'), "builder scope selector is missing program default option");
  assert(builderJs.includes("function ensureProgramSection"), "builder is missing a program config section helper");
  assert(builderJs.includes("state.config.programs[slug]"), "builder does not write program scoped config");
  assert(builderJs.includes("function isChapterRecord"), "builder is missing a chapter-record filter");
  assert(builderJs.includes("rawRecords.filter(isChapterRecord)"), "builder should filter non-chapter story rows out of chapter selectors");
}

function runFallbackSvgSmoke(records, config) {
  const slugs = ["philadelphia", "baltimore", "greater-washington"];

  slugs.forEach((slug) => {
    const record = records.find((item) => item.chapter_slug === slug);

    if (!record) {
      return;
    }

    const storyConfig = api.resolveStoryConfig(config, record);
    const effective = api.createEffectiveRecord(record, storyConfig);
    const cards = api.createCards(effective, { storyConfig, assetBase: "./assets/" });
    const svg = api.createFallbackSvg({ record: effective, cards, storyConfig, experienceMode: "chapter" }, "");

    assert(svg.includes("<svg"), `${slug} fallback SVG missing root`);
    assert(!/\b(undefined|null|NaN)\b/i.test(svg), `${slug} fallback SVG has broken text`);
    assert((svg.match(/poster-stat-value/g) || []).length <= 5, `${slug} fallback SVG rendered too many stat rows`);
    assert(svg.includes("poster-footer"), `${slug} fallback SVG missing footer`);
  });

  const longRecord = {
    chapter_slug: "long-test",
    chapter_name: "Northwest Suburban Philadelphia Leadership Chapter",
    region_name: "Atlantic Seaboard",
    year_label: "2025-2026",
    events_hosted: 1234,
    unique_teens: 9876,
    engagement_moments: 54321,
    new_teens: 432,
    repeat_attendee_rate_label: "67%",
    chapter_persona: "The Extraordinarily Dedicated Community Builders"
  };
  const storyConfig = api.resolveStoryConfig({}, longRecord);
  const effective = api.createEffectiveRecord(longRecord, storyConfig);
  const cards = api.createCards(effective, { storyConfig });
  const svg = api.createFallbackSvg({ record: effective, cards, storyConfig, experienceMode: "chapter" }, "");

  assert(!/\b(undefined|null|NaN)\b/i.test(svg), "long fallback SVG has broken text");
  assert((svg.match(/poster-persona/g) || []).length >= 1, "long fallback SVG did not render persona text");
  assert((svg.match(/poster-stat-label/g) || []).length >= 3, "long fallback SVG did not render stat labels");
}

function runInlineEmbedSmoke() {
  const inline = loadText("wordpress-inline-embed.html");
  const css = loadText("jsu-wrapped.css").trim();
  const renderer = loadText("jsu-wrapped.js").trim();
  const marker = "(function (root, factory) {";
  const styleStart = inline.indexOf("<style>");
  const styleEnd = inline.indexOf("</style>", styleStart);
  const scriptStart = inline.indexOf("<script>", styleEnd);
  const rendererStart = inline.indexOf(marker);
  const rendererEnd = inline.lastIndexOf("</script>");
  const embeddedCss = styleStart >= 0 && styleEnd > styleStart ? inline.slice(styleStart + "<style>".length, styleEnd).trim() : "";
  const embeddedRenderer = rendererStart >= 0 && rendererEnd > rendererStart ? inline.slice(rendererStart, rendererEnd).trim() : "";

  assert(styleStart >= 0 && styleEnd > styleStart, "WordPress embed missing top-level style block");
  assert(scriptStart > styleEnd, "WordPress embed missing inline script after styles");
  assert(embeddedCss === css, "WordPress inline CSS is not synced with jsu-wrapped.css");
  assert(rendererStart >= 0, "WordPress embed missing inline renderer");
  assert(embeddedRenderer === renderer, "WordPress inline renderer is not synced with jsu-wrapped.js");
  assert((inline.match(/<script>/g) || []).length === 1, "WordPress embed should have one inline script block");
}

function findMatchingBrace(css, openIndex) {
  let depth = 0;

  for (let index = openIndex; index < css.length; index += 1) {
    if (css[index] === "{") {
      depth += 1;
    } else if (css[index] === "}") {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function collectCssSelectors(css) {
  const selectors = [];
  let cursor = 0;

  while (cursor < css.length) {
    const open = css.indexOf("{", cursor);

    if (open === -1) {
      break;
    }

    const prelude = css.slice(cursor, open).replace(/\/\*[\s\S]*?\*\//g, "").trim();
    const close = findMatchingBrace(css, open);

    if (close === -1) {
      break;
    }

    if (prelude.startsWith("@keyframes")) {
      cursor = close + 1;
      continue;
    }

    if (prelude.startsWith("@media") || prelude.startsWith("@supports")) {
      selectors.push(...collectCssSelectors(css.slice(open + 1, close)));
      cursor = close + 1;
      continue;
    }

    if (prelude && !prelude.startsWith("@")) {
      selectors.push(...prelude.split(",").map((selector) => selector.trim()).filter(Boolean));
    }

    cursor = close + 1;
  }

  return selectors;
}

function runCssIsolationSmoke() {
  const css = loadText("jsu-wrapped.css");
  const docs = loadText("docs/production-readiness.md");
  const allowedTopLevel = [
    "#jsu-wrapped",
    ":root #jsu-wrapped"
  ];
  const violations = [];

  collectCssSelectors(css).forEach((selector) => {
    const normalized = selector.replace(/\s+/g, " ");

    if (!allowedTopLevel.some((prefix) => normalized === prefix || normalized.indexOf(prefix + " ") === 0 || normalized.indexOf(prefix + ".") === 0 || normalized.indexOf(prefix + ":") === 0 || normalized.indexOf(prefix + "[") === 0)) {
      violations.push(normalized);
    }
  });

  assert(!violations.length, `Unscoped CSS selectors: ${violations.slice(0, 8).join(", ")}`);
  assert(docs.includes("CSS Isolation"), "production docs missing CSS Isolation section");
  assert(docs.includes("#jsu-wrapped"), "production docs missing #jsu-wrapped CSS scope contract");
}

function runCiWorkflowSmoke() {
  const workflowPath = ".github/workflows/qa.yml";
  const docs = loadText("docs/production-readiness.md");

  assert(fs.existsSync(workflowPath), "GitHub Actions QA workflow is missing");

  const workflow = loadText(workflowPath);
  const requiredCommands = [
    "node sync-wordpress-inline.js",
    "git diff --exit-code wordpress-inline-embed.html",
    "node validate-wrapped-data.js",
    "node --check jsu-wrapped.js",
    "node --check wrapped-builder.js",
    "node --check validate-wrapped-data.js",
    "node --check sync-wordpress-inline.js",
    "node --check qa-smoke.js",
    "node qa-smoke.js",
    "git diff --check"
  ];

  requiredCommands.forEach((command) => {
    assert(workflow.includes(command), `GitHub Actions QA workflow missing ${command}`);
  });

  assert(workflow.includes("pull_request"), "GitHub Actions QA workflow should run on pull requests");
  assert(workflow.includes("push"), "GitHub Actions QA workflow should run on push");
  assert(docs.includes("GitHub Actions"), "production docs missing GitHub Actions QA note");
}

function runStaffPlaybookSmoke() {
  const path = "docs/staff-playbook.md";

  assert(fs.existsSync(path), "staff playbook doc is missing");

  const playbook = loadText(path);
  const requiredPhrases = [
    "Launch Goals",
    "Audience Paths",
    "Chapter Staff",
    "Regional Staff",
    "CTA",
    "Outreach",
    "Measurement",
    "Gravity Form",
    "Variants"
  ];

  requiredPhrases.forEach((phrase) => {
    assert(playbook.includes(phrase), `staff playbook missing ${phrase}`);
  });
}

function runDataValidationSmoke(records, config) {
  const report = dataValidator.validateWrappedPackage({
    chapterRecords: records,
    teenRecords: loadJson("sample-teen-wrapped-2026.json"),
    config
  });
  const duplicateReport = dataValidator.validateChapterRecords([
    {
      chapter_slug: "northwood-jsu",
      chapter_name: "Northwood JSU",
      region_name: "Atlantic Seaboard",
      year_label: "2025-2026",
      events_hosted: 1
    },
    {
      chapter_slug: "northwood-jsu",
      chapter_name: "Northwood Duplicate",
      region_name: "Atlantic Seaboard",
      year_label: "2025-2026",
      events_hosted: 2
    }
  ]);
  const badMetricReport = dataValidator.validateChapterRecords([
    {
      chapter_slug: "bad-metric",
      chapter_name: "Bad Metric",
      region_name: "Atlantic Seaboard",
      year_label: "2025-2026",
      events_hosted: "many"
    }
  ]);

  assert(report.ok, `sample data validation failed: ${report.errors.join("; ")}`);
  assert(!duplicateReport.ok && duplicateReport.errors.some((error) => error.includes("Duplicate chapter_slug")), "duplicate chapter slugs should fail validation");
  assert(!badMetricReport.ok && badMetricReport.errors.some((error) => error.includes("events_hosted")), "invalid numeric metrics should fail validation");
}

function main() {
  const records = loadJson("sample-wrapped-2026.json");
  const config = loadJson("wrapped-config-2026.json");

  runDataValidationSmoke(records, config);
  runLayeredVariantSmoke();
  runPickerSmoke(records, config);
  runHiddenVariantSmoke();
  runSampleVariantSmoke(records, config);
  runPageMetadataSmoke();
  runAnalyticsSmoke();
  runAnalyticsDocsSmoke();
  runStoryScopeSmoke();
  runScopedStoryValidationSmoke();
  runBuilderFutureScopeSmoke();
  runFallbackSvgSmoke(records, config);
  runInlineEmbedSmoke();
  runCssIsolationSmoke();
  runCiWorkflowSmoke();
  runStaffPlaybookSmoke();

  console.log("qa smoke ok");
}

main();
