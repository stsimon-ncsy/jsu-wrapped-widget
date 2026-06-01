const fs = require("fs");
const os = require("os");
const path = require("path");
const childProcess = require("child_process");
const api = require("./jsu-wrapped.js");
const dataValidator = require("./validate-wrapped-data.js");
const shareGenerator = require("./generate-share-pages.js");

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
    records: [
      baltimore,
      {
        scope_type: "region",
        scope_slug: "atlantic-seaboard",
        scope_name: "Atlantic Seaboard",
        region_name: "Atlantic Seaboard",
        year_label: "2025-2026"
      },
      {
        scope_type: "program",
        scope_slug: "shabbat",
        scope_name: "Shabbat Across JSU",
        program_slug: "shabbat",
        program_name: "Shabbat Across JSU",
        year_label: "2025-2026"
      }
    ],
    config,
    url: "https://example.org/wrapped/"
  });

  assert(html.includes("variant=donor-recap"), "sample picker variant link missing");
  assert(html.includes("Donor recap"), "sample picker variant label missing");
  assert((html.match(/jsuw-picker-item /g) || []).length === 1, "picker duplicated chapter rows");
  assert(html.includes("jsuw-picker-scope-stories"), "picker should include scoped story discovery when region/program records exist");
  assert(html.includes("Atlantic Seaboard"), "picker should surface region story records");
  assert(html.includes("?scope=region&amp;region=atlantic-seaboard"), "picker region story link mismatch");
  assert(html.includes("Shabbat Across JSU"), "picker should surface program story records");
  assert(html.includes("?scope=program&amp;program=shabbat"), "picker program story link mismatch");
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

function runSampleConfigConsistencySmoke(records, config) {
  const record = records.find((item) => item.chapter_slug === "baltimore");
  const storyConfig = api.resolveStoryConfig(config, record);
  const effective = api.createEffectiveRecord(record, storyConfig);
  const cards = api.createCards(effective, { storyConfig });
  const persona = cards.find((card) => card.id === "persona");
  const final = cards.find((card) => card.id === "final");

  assert(persona && final, "sample config should render persona and final cards for Baltimore");
  assert(effective.chapter_persona === persona.persona, `Baltimore effective persona mismatch: ${effective.chapter_persona} vs ${persona.persona}`);
  assert(final.persona === persona.persona, `Baltimore final persona mismatch: ${final.persona} vs ${persona.persona}`);
  assert(final.subtext.includes(persona.persona), `Baltimore final summary should use the configured persona: ${final.subtext}`);
}

function runPageMetadataSmoke() {
  const previousDocument = global.document;
  const fakeDocument = {
    title: "",
    elements: [],
    head: {
      appendChild(element) {
        fakeDocument.elements.push(element);
      }
    },
    createElement(tagName) {
      return {
        tagName,
        attrs: {},
        setAttribute(name, value) {
          this.attrs[name] = value;
        }
      };
    },
    querySelector(selector) {
      const match = selector.match(/^meta\[(name|property)="([^"]+)"\]$/);

      if (!match) {
        return null;
      }

      return fakeDocument.elements.find((element) => element.attrs && element.attrs[match[1]] === match[2]) || null;
    }
  };
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
  const teenMetadata = api.createPageMetadata({
    experienceMode: "teen",
    record: {
      teen_slug: "maya-test",
      teen_name: "Maya",
      chapter_name: "Northwood JSU",
      year_label: "2025-2026"
    }
  });

  assert(ncsyMetadata.title === "JSU/NCSY Wrapped - Baltimore", `NCSY metadata title mismatch: ${ncsyMetadata.title}`);
  assert(jsuMetadata.title === "JSU/NCSY Wrapped - Greater Washington", `JSU metadata title mismatch: ${jsuMetadata.title}`);
  assert(ncsyMetadata.description.includes("Baltimore Wrapped"), "metadata description missing chapter name");
  assert(ncsyMetadata.image && ncsyMetadata.image.includes("wrapped-social-preview.png"), "metadata image missing social preview");
  assert(teenMetadata.title === "JSU/NCSY Wrapped - Teen Test Version", `teen metadata title mismatch: ${teenMetadata.title}`);
  assert(teenMetadata.description.includes("proof of concept"), "teen metadata description should label proof of concept");
  assert(teenMetadata.robots === "noindex,nofollow", "teen metadata should be noindex");

  try {
    global.document = fakeDocument;
    api.applyPageMetadata({
      experienceMode: "teen",
      record: {
        teen_slug: "maya-test",
        teen_name: "Maya",
        chapter_name: "Northwood JSU",
        year_label: "2025-2026"
      }
    });
  } finally {
    global.document = previousDocument;
  }

  assert(fakeDocument.elements.some((element) => element.attrs.name === "robots" && element.attrs.content === "noindex,nofollow"), "teen metadata should write robots noindex tag");
}

function runStaticShareSmoke() {
  const records = loadJson("sample-wrapped-2026.json");
  const chapterRecords = records.filter((record) => record && record.chapter_slug && record.chapter_name && (!record.scope_type || String(record.scope_type).toLowerCase() === "chapter"));
  const html = loadText("share/baltimore/index.html");
  const indexHtml = loadText("index.html");
  const inlineHtml = loadText("wordpress-inline-embed.html");
  const expectedTitle = "JSU/NCSY Wrapped - Baltimore";
  const shareUrl = api.createShareUrl({
    record: {
      chapter_slug: "baltimore",
      chapter_name: "Baltimore"
    },
    experienceMode: "chapter",
    variantSlug: "donor-recap",
    shareBase: "https://example.org/wrapped/share/"
  }, "https://example.org/wrapped/?chapter=baltimore&variant=donor-recap");
  const programContextShareUrl = api.createShareUrl({
    record: {
      chapter_slug: "baltimore",
      chapter_name: "Baltimore"
    },
    experienceMode: "chapter",
    variantSlug: "donor-recap",
    programSlug: "shabbat",
    shareBase: "https://example.org/wrapped/share/"
  }, "https://example.org/wrapped/?chapter=baltimore&program=shabbat&variant=donor-recap&autoplay=1&duration=1500");
  const campaignContextShareUrl = api.createShareUrl({
    record: {
      chapter_slug: "baltimore",
      chapter_name: "Baltimore"
    },
    experienceMode: "chapter",
    variantSlug: "spring-board",
    shareBase: "https://example.org/wrapped/share/"
  }, "https://example.org/wrapped/?chapter=baltimore&campaign=spring-board&variant=spring-board");
  const doubleHyphenChapterShareUrl = api.createShareUrl({
    record: {
      chapter_slug: "la--city",
      chapter_name: "LA - City"
    },
    experienceMode: "chapter",
    shareBase: "https://example.org/wrapped/share/"
  }, "https://example.org/wrapped/?chapter=la--city");
  const teenShareUrl = api.createShareUrl({
    record: {
      teen_slug: "maya-test",
      teen_name: "Maya"
    },
    experienceMode: "teen",
    shareBase: "https://example.org/wrapped/share/"
  }, "https://example.org/wrapped/?mode=teen&teen=maya-test");
  const regionShareUrl = api.createShareUrl({
    record: {
      scope_type: "region",
      scope_slug: "atlantic-seaboard",
      scope_name: "Atlantic Seaboard",
      region_slug: "atlantic-seaboard",
      region_name: "Atlantic Seaboard"
    },
    experienceMode: "region",
    variantSlug: "donor-recap",
    shareBase: "https://example.org/wrapped/share/"
  }, "https://example.org/wrapped/?scope=region&region=atlantic-seaboard&variant=donor-recap");
  const programShareUrl = api.createShareUrl({
    record: {
      scope_type: "program",
      scope_slug: "shabbat",
      scope_name: "Shabbat Across JSU",
      program_slug: "shabbat",
      program_name: "Shabbat Across JSU"
    },
    experienceMode: "program",
    shareBase: "https://example.org/wrapped/share/"
  }, "https://example.org/wrapped/?scope=program&program=shabbat");
  const spacedProgramRecord = {
    scope_type: "program",
    scope_slug: "Shabbat Across JSU",
    scope_name: "Shabbat Across JSU",
    program_name: "Shabbat Across JSU"
  };
  const spacedProgramShareUrl = api.createShareUrl({
    record: spacedProgramRecord,
    experienceMode: "program",
    shareBase: "https://example.org/wrapped/share/"
  }, "https://example.org/wrapped/?scope=program&program=Shabbat%20Across%20JSU");
  const regionHtml = shareGenerator.sharePageHtml({
    scope_type: "region",
    scope_slug: "atlantic-seaboard",
    scope_name: "Atlantic Seaboard",
    region_slug: "atlantic-seaboard",
    region_name: "Atlantic Seaboard",
    year_label: "2025-2026",
    events_hosted: 420,
    unique_teens: 2850,
    engagement_moments: 9200
  });
  const programHtml = shareGenerator.sharePageHtml({
    scope_type: "program",
    scope_slug: "shabbat",
    scope_name: "Shabbat Across JSU",
    program_slug: "shabbat",
    program_name: "Shabbat Across JSU",
    year_label: "2025-2026",
    events_hosted: 88,
    unique_teens: 760
  });

  assert(fs.existsSync("generate-share-pages.js"), "static share page generator is missing");
  assert(html.includes("<title>" + expectedTitle + "</title>"), "Baltimore static share page title mismatch");
  assert(html.includes('property="og:title" content="' + expectedTitle + '"'), "Baltimore static share page OG title mismatch");
  assert(html.includes('property="og:site_name" content="JSU/NCSY Wrapped"'), "Baltimore static share page missing OG site name");
  assert(html.includes('name="twitter:title" content="' + expectedTitle + '"'), "Baltimore static share page Twitter title mismatch");
  assert(html.includes('property="og:image:alt" content="JSU/NCSY Wrapped social preview for Baltimore"'), "Baltimore static share page missing OG image alt text");
  assert(html.includes('name="twitter:image:alt" content="JSU/NCSY Wrapped social preview for Baltimore"'), "Baltimore static share page missing Twitter image alt text");
  assert(html.includes('http-equiv="refresh"'), "Baltimore static share page missing human redirect");
  assert(html.includes("?chapter=baltimore"), "Baltimore static share page missing chapter redirect link");
  assert(html.includes("window.location.search"), "Baltimore static share page should preserve supported query params in JS redirect");
  assert(html.includes("variant"), "Baltimore static share page should preserve variant query params");
  assert(indexHtml.includes('data-share-base="./share/"'), "hosted preview missing static share base");
  assert(inlineHtml.includes('data-share-base="https://stsimon-ncsy.github.io/jsu-wrapped-widget/share/"'), "WordPress inline embed missing static share base");
  chapterRecords.forEach((record) => {
    const path = `share/${record.chapter_slug}/index.html`;
    assert(fs.existsSync(path), `static share page missing for ${record.chapter_slug}`);
  });
  assert(shareUrl === "https://example.org/wrapped/share/baltimore/?variant=donor-recap", `static share URL mismatch: ${shareUrl}`);
  assert(programContextShareUrl === "https://example.org/wrapped/share/baltimore/?variant=donor-recap&program=shabbat&autoplay=1&duration=1500", `program context static share URL mismatch: ${programContextShareUrl}`);
  assert(campaignContextShareUrl === "https://example.org/wrapped/share/baltimore/?variant=spring-board&campaign=spring-board", `campaign context static share URL mismatch: ${campaignContextShareUrl}`);
  assert(doubleHyphenChapterShareUrl === "https://example.org/wrapped/share/la--city/", `chapter share URL should preserve existing slug: ${doubleHyphenChapterShareUrl}`);
  assert(regionShareUrl === "https://example.org/wrapped/share/region/atlantic-seaboard/?variant=donor-recap", `region static share URL mismatch: ${regionShareUrl}`);
  assert(programShareUrl === "https://example.org/wrapped/share/program/shabbat/", `program static share URL mismatch: ${programShareUrl}`);
  assert(shareGenerator.sharePagePath(spacedProgramRecord) === "program/Shabbat-Across-JSU/", "share generator should sanitize scoped story paths with spaces");
  assert(spacedProgramShareUrl === "https://example.org/wrapped/share/program/Shabbat-Across-JSU/", `runtime share URL should match generated scoped story path: ${spacedProgramShareUrl}`);
  assert(teenShareUrl === "https://example.org/wrapped/?mode=teen&teen=maya-test", `teen share URL should fall back to current URL: ${teenShareUrl}`);
  assert(shareGenerator.sharePagePath({ chapter_slug: "la--city", chapter_name: "LA - City" }) === "la--city/", "share page path should preserve existing chapter slug");
  assert(regionHtml.includes("<title>JSU/NCSY Wrapped - Atlantic Seaboard</title>"), "region share page title mismatch");
  assert(regionHtml.includes("/share/region/atlantic-seaboard/"), "region share page URL path mismatch");
  assert(regionHtml.includes("?scope=region&amp;region=atlantic-seaboard"), "region share page story redirect mismatch");
  assert(programHtml.includes("<title>JSU/NCSY Wrapped - Shabbat Across JSU</title>"), "program share page title mismatch");
  assert(programHtml.includes("/share/program/shabbat/"), "program share page URL path mismatch");
  assert(programHtml.includes("?scope=program&amp;program=shabbat"), "program share page story redirect mismatch");
}

function runEntryPageSocialMetadataSmoke() {
  ["index.html", "embed-example.html"].forEach((file) => {
    const html = loadText(file);

    assert(html.includes('property="og:site_name" content="JSU/NCSY Wrapped"'), `${file} missing OG site name`);
    assert(html.includes('property="og:image:alt" content="JSU/NCSY Wrapped social preview"'), `${file} missing OG image alt text`);
    assert(html.includes('name="twitter:image:alt" content="JSU/NCSY Wrapped social preview"'), `${file} missing Twitter image alt text`);
  });
}

function runShareGeneratorCleanupSmoke() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jsuw-share-"));
  const unsafeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jsuw-share-unsafe-"));

  try {
    fs.mkdirSync(path.join(root, "stale-chapter"), { recursive: true });
    fs.writeFileSync(path.join(root, "stale-chapter", "index.html"), "<!doctype html><title>JSU/NCSY Wrapped - Stale</title>");

    const count = shareGenerator.generateSharePages([
      {
        chapter_slug: "active-chapter",
        chapter_name: "Active Chapter",
        region_name: "Atlantic Seaboard",
        year_label: "2025-2026"
      },
      {
        scope_type: "region",
        scope_slug: "atlantic-seaboard",
        scope_name: "Atlantic Seaboard",
        region_name: "Atlantic Seaboard",
        year_label: "2025-2026"
      }
    ], { outputRoot: root });

    assert(count === 2, `share generator count mismatch: ${count}`);
    assert(fs.existsSync(path.join(root, "active-chapter", "index.html")), "active chapter share page missing in custom output root");
    assert(fs.existsSync(path.join(root, "region", "atlantic-seaboard", "index.html")), "region share page missing in custom output root");
    assert(!fs.existsSync(path.join(root, "stale-chapter")), "stale generated share directory should be removed");

    shareGenerator.generateSharePages([
      {
        chapter_slug: "..",
        chapter_name: "Unsafe Chapter",
        region_name: "Atlantic Seaboard",
        year_label: "2025-2026"
      }
    ], { outputRoot: path.join(unsafeRoot, "share") });

    assert(!fs.existsSync(path.join(unsafeRoot, "index.html")), "share generator should not write outside the output root for unsafe slugs");
    assert(fs.existsSync(path.join(unsafeRoot, "share", "story", "index.html")), "share generator should fall back to a safe slug for unsafe story paths");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(unsafeRoot, { recursive: true, force: true });
  }
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

  const teenPayload = api.createAnalyticsPayload({
    record: {
      teen_slug: "maya-test",
      teen_name: "Maya",
      student_name: "Maya Student",
      chapter_slug: "northwood-jsu",
      chapter_name: "Northwood JSU",
      region_name: "Atlantic Seaboard",
      year_label: "2025-2026"
    },
    cards: [{ theme: "cover", type: "cover" }],
    index: 0,
    experienceMode: "teen"
  }, "teen_privacy_test", {
    teen_slug: "maya-test",
    teen_name: "Maya",
    teen_id: "real-teen-123",
    student_name: "Maya Student",
    student_id: "student-123",
    email: "maya@example.org",
    phone: "410-555-1212",
    cta_label: "Get involved"
  });

  ["teen_slug", "teen_name", "teen_id", "student_name", "student_id", "email", "phone"].forEach((key) => {
    assert(!Object.prototype.hasOwnProperty.call(teenPayload, key), `teen analytics payload leaked ${key}`);
  });
  assert(teenPayload.chapter_slug === "northwood-jsu", "teen analytics should keep chapter context");
  assert(teenPayload.cta_label === "Get involved", "teen analytics should keep non-identifying event context");
}

function runFormPrefillSmoke() {
  const context = api.createFormPrefillContext({
    scope_type: "program",
    scope_slug: "shabbat",
    scope_name: "Shabbat Across JSU",
    program_slug: "shabbat",
    program_name: "Shabbat Across JSU",
    region_name: "Atlantic Seaboard",
    year_label: "2025-2026"
  }, "https://example.org/wrapped/?scope=program&program=shabbat&variant=donor-recap");

  assert(context.scope_type === "program", "form prefill scope type missing");
  assert(context.scope_slug === "shabbat", "form prefill scope slug missing");
  assert(context.scope_name === "Shabbat Across JSU", "form prefill scope name missing");
  assert(context.program_slug === "shabbat", "form prefill program slug missing");
  assert(context.program_name === "Shabbat Across JSU", "form prefill program name missing");
  assert(context.variant_slug === "donor-recap", "form prefill variant slug missing");
  assert(context.wrapped_url.includes("variant=donor-recap"), "form prefill wrapped URL missing variant context");
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
  const badCardConfigReport = dataValidator.validateConfig({
    chapters: {
      baltimore: {
        hidden_cards: ["evnts"],
        card_overrides: {
          perssona: { headline: "Typo should fail" }
        },
        custom_cards: [
          {
            id: "bad-custom",
            type: "metrik",
            placement: "after_perssona",
            headline: "Typo should fail"
          }
        ]
      }
    }
  }, storyRecords);
  const badProtectedHiddenReport = dataValidator.validateConfig({
    chapters: {
      baltimore: {
        hidden_cards: ["cover", "final"]
      }
    }
  }, storyRecords);
  const protectedHiddenConfig = {
    chapters: {
      baltimore: {
        hidden_cards: ["cover", "final", "events"]
      }
    }
  };
  const protectedHiddenStoryConfig = api.resolveStoryConfig(protectedHiddenConfig, storyRecords[0]);
  const protectedHiddenCards = api.createCards(api.createEffectiveRecord(storyRecords[0], protectedHiddenStoryConfig), { storyConfig: protectedHiddenStoryConfig });

  assert(report.ok, `mixed story scope validation failed: ${report.errors.join("; ")}`);
  assert(!duplicateScopeReport.ok && duplicateScopeReport.errors.some((error) => error.includes("Duplicate")), "duplicate region scope slugs should fail validation");
  assert(!badProgramConfigReport.ok && badProgramConfigReport.errors.some((error) => error.includes("config program")), "unknown program config should fail validation");
  assert(!badCampaignConfigReport.ok && badCampaignConfigReport.errors.some((error) => error.includes("config campaign")), "unknown campaign config should fail validation");
  assert(!badCardConfigReport.ok && badCardConfigReport.errors.some((error) => error.includes("hidden_cards")), "unknown hidden card ids should fail validation");
  assert(!badCardConfigReport.ok && badCardConfigReport.errors.some((error) => error.includes("card_overrides")), "unknown card override ids should fail validation");
  assert(!badCardConfigReport.ok && badCardConfigReport.errors.some((error) => error.includes("custom_cards[0].type")), "unknown custom card types should fail validation");
  assert(!badCardConfigReport.ok && badCardConfigReport.errors.some((error) => error.includes("custom_cards[0].placement")), "unknown custom card placements should fail validation");
  assert(!badProtectedHiddenReport.ok && badProtectedHiddenReport.errors.some((error) => error.includes("cannot hide protected card")), "hiding cover/final should fail validation");
  assert(protectedHiddenCards.some((card) => card.id === "cover"), "runtime should preserve protected cover card");
  assert(protectedHiddenCards.some((card) => card.id === "final"), "runtime should preserve protected final card");
  assert(!protectedHiddenCards.some((card) => card.id === "events"), "runtime should still hide non-protected cards");
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

function runBuilderProtectedCardsSmoke() {
  const builderJs = loadText("wrapped-builder.js");

  assert(builderJs.includes("function isProtectedCard"), "builder should identify protected generated cards");
  assert(builderJs.includes("data-builder-card-protected"), "builder should mark protected cards in the editor");
  assert(builderJs.includes("Required"), "builder should label protected cover/final cards as required");
  assert(builderJs.includes("Cannot hide required cover or final share screens"), "builder should warn staff that cover/final cannot be hidden");
}

function runBuilderSubmissionSmoke() {
  const builderHtml = loadText("builder.html");
  const builderJs = loadText("wrapped-builder.js");
  const builderCss = loadText("wrapped-builder.css");

  assert(builderHtml.includes('data-builder-action="download-submission"'), "builder should expose a staff submission download button");
  assert(builderHtml.includes('data-builder-action="copy-submission"'), "builder should expose a staff submission copy button");
  assert(builderHtml.includes('data-builder-action="email-submission"'), "builder should expose a staff submission email draft button");
  assert(builderHtml.includes('data-builder-action="form-submission"'), "builder should expose an optional review form button");
  assert(builderHtml.includes("data-builder-review-actions"), "builder should group staff submission actions near submission info");
  assert(builderHtml.includes("data-builder-review-email-status"), "builder should show whether submission emails are pre-addressed");
  assert(builderHtml.includes('data-builder-field="cta_href"'), "builder should expose a direct CTA URL field");
  assert(builderHtml.includes("Send for review"), "builder should label the staff submission action group");
  assert(builderHtml.includes("Recommended: Open email draft"), "builder should make the recommended staff review path explicit");
  assert(builderHtml.includes("paste the copied JSON into the email"), "builder should tell staff exactly how to return the submission JSON");
  assert(builderHtml.includes("Download submission if email paste is awkward"), "builder should give staff a clear file-attachment fallback");
  assert(builderHtml.includes("data-review-email"), "builder should allow a configurable submission review email address");
  assert(builderJs.includes("review_email"), "builder should allow review email to be set from a staff distribution URL");
  assert(builderJs.includes("reviewEmail"), "builder should allow camelCase review email links");
  assert(builderHtml.includes("data-builder-submitter-name"), "builder should collect submitter name for staff submissions");
  assert(builderHtml.includes("data-builder-submitter-email"), "builder should collect submitter email for staff submissions");
  assert(builderHtml.includes("data-builder-submitter-note"), "builder should collect reviewer notes for staff submissions");
  assert(builderJs.includes("function buildSubmissionPayload"), "builder should build a scoped staff submission payload");
  assert(builderJs.includes("function submissionMeta"), "builder should read submitter metadata into submissions");
  assert(builderJs.includes("merge_path"), "submission payload should include where the patch belongs in wrapped-config");
  assert(builderJs.includes("change_summary"), "submission payload should include a human-readable change summary");
  assert(builderJs.includes("config_patch"), "submission payload should include only the active scope/variant config patch");
  assert(builderJs.includes('"cta_href"'), "builder change summary should include direct CTA URL changes");
  assert(builderJs.includes("effective.cta_href || effective.ctaHref"), "builder warnings should account for direct CTA URL destinations");
  assert(builderJs.includes("submitter_name"), "submission payload should include submitter name");
  assert(builderJs.includes("submitter_email"), "submission payload should include submitter email");
  assert(builderJs.includes("submitter_note"), "submission payload should include reviewer note");
  assert(builderJs.includes("jsu-wrapped-builder-submission"), "submission payload should identify its schema");
  assert(builderJs.includes("downloadSubmission"), "builder should download staff submissions as files");
  assert(builderJs.includes("copySubmission"), "builder should copy staff submissions for paste-based review");
  assert(builderJs.includes("function emailSubmission"), "builder should open a review email draft for staff submissions");
  assert(builderJs.includes("function buildSubmissionEmail"), "builder should build a staff submission email note");
  assert(builderJs.includes("MAX_MAILTO_URL_LENGTH"), "builder should avoid overlong mailto links for submission JSON");
  assert(builderJs.includes("Email draft opened with the submission JSON included"), "builder should include small submission JSON packets in email drafts");
  assert(builderJs.includes("submission JSON included"), "builder should report when the email handoff already includes the JSON");
  assert(builderJs.includes("function reviewFormUrl"), "builder should read an optional staff review form URL");
  assert(builderJs.includes("function formSubmission"), "builder should copy JSON and open an optional review form");
  assert(builderJs.includes("review_url"), "builder should support a review_url query parameter for form-based submissions");
  assert(builderJs.includes("data-review-url"), "builder should support a data-review-url fallback for form-based submissions");
  assert(builderJs.includes("function renderReviewEmailStatus"), "builder should render the configured review email status");
  assert(builderJs.includes("mailto:"), "builder email handoff should not require a backend");
  assert(builderJs.includes("copyTextToClipboard"), "builder should have a clipboard fallback for submission JSON");
  assert(builderJs.includes("function submissionHasChanges"), "builder should detect no-change staff submissions before sending");
  assert(builderJs.includes("Add at least one change before sending this for review."), "builder should tell staff when a submission has no changes");
  assert(builderJs.includes("function isSafeStaticUrl"), "builder should validate staff-entered static URLs before review submission");
  assert(builderJs.includes("function customMediaImageValue"), "builder should read media image URLs from every supported config field");
  assert(builderJs.includes("Custom media screen \" + (index + 1) + \" has an unsafe image URL"), "builder should warn about unsafe custom media image URLs");
  assert(builderJs.includes("Direct CTA URL is unsafe"), "builder should warn about unsafe direct CTA URLs");
  assert(builderJs.includes("Fix unsafe URLs before sending this for review."), "builder should block staff submissions with unsafe URLs");
  assert(builderCss.includes(".builder-actions--review button"), "builder review action buttons should have mobile-specific sizing");
  assert(builderCss.includes(".builder-actions button:disabled"), "builder should visually distinguish disabled review actions");

  const readme = loadText("README.md");
  const playbook = loadText("docs/staff-playbook.md");

  assert(readme.includes("review_email"), "README should document pre-addressed staff review links");
  assert(readme.includes("review_url"), "README should document optional staff review form links");
  assert(readme.includes("usually includes the submission JSON automatically"), "README should document the low-friction email handoff");
  assert(playbook.includes("review_email"), "staff playbook should document pre-addressed staff review links");
  assert(playbook.includes("review_url"), "staff playbook should document optional staff review form links");
  assert(playbook.includes("usually includes the submission JSON automatically"), "staff playbook should document the low-friction email handoff");
}

function runBuilderIndexingSmoke() {
  const builderHtml = loadText("builder.html");
  const docs = loadText("docs/production-readiness.md");
  const readme = loadText("README.md");

  assert(builderHtml.includes('<meta name="robots" content="noindex,nofollow">'), "builder should be marked noindex,nofollow");
  assert(docs.includes("builder.html is an internal staff tool"), "production docs should explain builder indexing guard");
  assert(readme.includes("Builder is an internal staff tool"), "README should explain builder indexing guard");
}

function runBuilderSubmissionMergeSmoke() {
  const script = loadText("merge-builder-submission.js");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jsuw-merge-"));
  const configPath = path.join(tempDir, "wrapped-config-2026.json");
  const submissionPath = path.join(tempDir, "baltimore-submission.json");

  fs.writeFileSync(configPath, JSON.stringify({
    version: 1,
    year: "2026",
    defaults: {},
    regions: {},
    programs: {},
    chapters: {
      baltimore: {
        cta_label: "Old CTA",
        variants: {
          donor: {
            palette: "electric"
          }
        }
      }
    }
  }, null, 2));
  fs.writeFileSync(submissionPath, JSON.stringify({
    schema: "jsu-wrapped-builder-submission",
    version: 1,
    scope_type: "chapter",
    scope_slug: "baltimore",
    scope_label: "Baltimore",
    variant_slug: "donor",
    variant_label: "Donor recap",
    submitter_name: "Leah Rosen",
    submitter_email: "leah@example.org",
    submitter_note: "Please use this for the donor preview first.",
    preview_url: "https://example.org/wrapped/?chapter=baltimore&variant=donor",
    change_summary: [
      {
        type: "setting",
        label: "cta label",
        value: "Support next year's story"
      },
      {
        type: "screen_rewrite",
        label: "Final share card",
        fields: ["headline"]
      }
    ],
    merge_path: ["chapters", "baltimore", "variants", "donor"],
    config_patch: {
      cta_label: "Support next year's story",
      card_overrides: {
        final: {
          headline: "Baltimore donor recap"
        }
      }
    }
  }, null, 2));

  assert(script.includes("jsu-wrapped-builder-submission"), "merge script should validate the submission schema");
  assert(script.includes("merge_path"), "merge script should apply patches at the submitted merge path");

  const dryRunOutput = childProcess.execFileSync(process.execPath, ["merge-builder-submission.js", submissionPath, configPath, "--dry-run"], {
    cwd: __dirname,
    encoding: "utf8",
    stdio: "pipe"
  });

  assert(dryRunOutput.includes("Submission is valid for chapter / baltimore / donor"), "dry run should identify the submitted scope and variant");
  assert(dryRunOutput.includes("Submitter: Leah Rosen <leah@example.org>"), "dry run should show who sent the staff submission");
  assert(dryRunOutput.includes("Reviewer note: Please use this for the donor preview first."), "dry run should show the staff reviewer note");
  assert(dryRunOutput.includes("Preview URL: https://example.org/wrapped/?chapter=baltimore&variant=donor"), "dry run should show the preview URL");
  assert(dryRunOutput.includes("- cta label: Support next year's story"), "dry run should summarize setting changes");
  assert(dryRunOutput.includes("- Final share card: updated headline"), "dry run should summarize screen rewrites");

  childProcess.execFileSync(process.execPath, ["merge-builder-submission.js", submissionPath, configPath], {
    cwd: __dirname,
    stdio: "pipe"
  });

  const merged = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert(merged.chapters.baltimore.cta_label === "Old CTA", "variant submission should not overwrite base chapter config");
  assert(merged.chapters.baltimore.variants.donor.palette === "electric", "merge should preserve existing variant fields");
  assert(merged.chapters.baltimore.variants.donor.cta_label === "Support next year's story", "merge should apply submitted variant fields");
  assert(merged.chapters.baltimore.variants.donor.card_overrides.final.headline === "Baltimore donor recap", "merge should apply nested submitted fields");

  const invalidConfigPath = path.join(tempDir, "invalid-config.json");
  const invalidSubmissionPath = path.join(tempDir, "invalid-submission.json");

  fs.writeFileSync(invalidConfigPath, JSON.stringify({
    version: 1,
    year: "2026",
    defaults: {},
    regions: {},
    programs: {},
    chapters: {
      baltimore: {}
    }
  }, null, 2));
  fs.writeFileSync(invalidSubmissionPath, JSON.stringify({
    schema: "jsu-wrapped-builder-submission",
    version: 1,
    merge_path: ["chapters", "baltimore"],
    config_patch: {
      hidden_cards: ["evnts"]
    }
  }, null, 2));

  let invalidOutput = "";
  try {
    childProcess.execFileSync(process.execPath, ["merge-builder-submission.js", invalidSubmissionPath, invalidConfigPath], {
      cwd: __dirname,
      encoding: "utf8",
      stdio: "pipe"
    });
  } catch (error) {
    invalidOutput = String(error.stderr || error.stdout || error.message || "");
  }

  const invalidConfig = JSON.parse(fs.readFileSync(invalidConfigPath, "utf8"));
  assert(script.includes("validateMergedConfig"), "merge script should validate merged config before writing");
  assert(invalidOutput.includes("Merged config validation failed"), "invalid staff submission should fail package validation");
  assert(!invalidConfig.chapters.baltimore.hidden_cards, "invalid staff submission should not be written");

  const deepPathConfigPath = path.join(tempDir, "deep-path-config.json");
  const deepPathSubmissionPath = path.join(tempDir, "deep-path-submission.json");

  fs.writeFileSync(deepPathConfigPath, JSON.stringify({
    version: 1,
    year: "2026",
    defaults: {},
    regions: {},
    programs: {},
    chapters: {
      baltimore: {}
    }
  }, null, 2));
  fs.writeFileSync(deepPathSubmissionPath, JSON.stringify({
    schema: "jsu-wrapped-builder-submission",
    version: 1,
    merge_path: ["chapters", "baltimore", "card_overrides", "events"],
    config_patch: {
      headline: "Deep path should not merge"
    }
  }, null, 2));

  let deepPathOutput = "";
  try {
    childProcess.execFileSync(process.execPath, ["merge-builder-submission.js", deepPathSubmissionPath, deepPathConfigPath], {
      cwd: __dirname,
      encoding: "utf8",
      stdio: "pipe"
    });
  } catch (error) {
    deepPathOutput = String(error.stderr || error.stdout || error.message || "");
  }

  const deepPathConfig = JSON.parse(fs.readFileSync(deepPathConfigPath, "utf8"));
  assert(deepPathOutput.includes("builder-generated scope or variant path"), "deep staff submission merge paths should fail clearly");
  assert(!deepPathConfig.chapters.baltimore.card_overrides, "deep staff submission path should not be written");

  const emptyPatchConfigPath = path.join(tempDir, "empty-patch-config.json");
  const emptyPatchSubmissionPath = path.join(tempDir, "empty-patch-submission.json");

  fs.writeFileSync(emptyPatchConfigPath, JSON.stringify({
    version: 1,
    year: "2026",
    defaults: {},
    regions: {},
    programs: {},
    chapters: {
      baltimore: {}
    }
  }, null, 2));
  fs.writeFileSync(emptyPatchSubmissionPath, JSON.stringify({
    schema: "jsu-wrapped-builder-submission",
    version: 1,
    merge_path: ["chapters", "baltimore"],
    config_patch: {}
  }, null, 2));

  let emptyPatchOutput = "";
  try {
    childProcess.execFileSync(process.execPath, ["merge-builder-submission.js", emptyPatchSubmissionPath, emptyPatchConfigPath], {
      cwd: __dirname,
      encoding: "utf8",
      stdio: "pipe"
    });
  } catch (error) {
    emptyPatchOutput = String(error.stderr || error.stdout || error.message || "");
  }

  assert(emptyPatchOutput.includes("no changes"), "empty staff submissions should fail clearly");
}

function runBuilderSubmissionBatchReviewSmoke() {
  const scriptPath = "review-builder-submissions.js";
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jsuw-review-"));
  const submissionsDir = path.join(tempDir, "staff-submissions");
  const configPath = path.join(tempDir, "wrapped-config-2026.json");
  const validSubmissionPath = path.join(submissionsDir, "valid-builder-submission.json");
  const invalidSubmissionPath = path.join(submissionsDir, "invalid-builder-submission.json");

  fs.mkdirSync(submissionsDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({
    version: 1,
    year: "2026",
    defaults: {},
    regions: {},
    programs: {},
    chapters: {
      baltimore: {}
    }
  }, null, 2));
  fs.writeFileSync(validSubmissionPath, JSON.stringify({
    schema: "jsu-wrapped-builder-submission",
    version: 1,
    scope_type: "chapter",
    scope_slug: "baltimore",
    scope_label: "Baltimore",
    submitter_name: "Leah Rosen",
    submitter_email: "leah@example.org",
    preview_url: "https://example.org/wrapped/?chapter=baltimore",
    change_summary: [
      {
        type: "setting",
        label: "palette",
        value: "electric"
      }
    ],
    merge_path: ["chapters", "baltimore"],
    config_patch: {
      palette: "electric"
    }
  }, null, 2));
  fs.writeFileSync(invalidSubmissionPath, JSON.stringify({
    schema: "jsu-wrapped-builder-submission",
    version: 1,
    scope_type: "chapter",
    scope_slug: "baltimore",
    merge_path: ["chapters", "baltimore"],
    config_patch: {}
  }, null, 2));

  let batchOutput = "";
  try {
    childProcess.execFileSync(process.execPath, [scriptPath, submissionsDir, configPath], {
      cwd: __dirname,
      encoding: "utf8",
      stdio: "pipe"
    });
  } catch (error) {
    batchOutput = String(error.stdout || error.stderr || error.message || "");
  }

  assert(fs.existsSync(scriptPath), "staff submission batch review script is missing");
  assert(batchOutput.includes("Reviewing 2 staff submission JSON files"), "batch review should report how many files it checked");
  assert(batchOutput.includes("[OK] valid-builder-submission.json"), "batch review should mark valid staff submissions");
  assert(batchOutput.includes("Submitter: Leah Rosen <leah@example.org>"), "batch review should show submitter details");
  assert(batchOutput.includes("- palette: electric"), "batch review should summarize submitted changes");
  assert(batchOutput.includes("[INVALID] invalid-builder-submission.json"), "batch review should mark invalid staff submissions");
  assert(batchOutput.includes("Submission config_patch has no changes"), "batch review should show validation errors");
  assert(batchOutput.includes("Summary: 1 valid, 1 invalid"), "batch review should summarize valid and invalid counts");

  const noFilesOutput = childProcess.execFileSync(process.execPath, [scriptPath, path.join(tempDir, "empty-submissions"), configPath], {
    cwd: __dirname,
    encoding: "utf8",
    stdio: "pipe"
  });

  assert(noFilesOutput.includes("No staff submission JSON files found"), "batch review should handle missing submission folders cleanly");
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
    assert(!/letter-spacing\s*:\s*-\s*[^;}]+/.test(svg), `${slug} fallback SVG should not use negative letter spacing`);
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
  const cards = api.createCards(effective, {
    storyConfig,
    ctaLabel: "Build next year's story",
    ctaTarget: "#jsuw-wrapped-interest"
  });
  const svg = api.createFallbackSvg({ record: effective, cards, storyConfig, experienceMode: "chapter" }, "data:image/png;base64,logo-test");

  assert(!/\b(undefined|null|NaN)\b/i.test(svg), "long fallback SVG has broken text");
  assert(!/letter-spacing\s*:\s*-\s*[^;}]+/.test(svg), "long fallback SVG should not use negative letter spacing");
  assert((svg.match(/poster-persona/g) || []).length >= 1, "long fallback SVG did not render persona text");
  assert((svg.match(/poster-stat-label/g) || []).length >= 3, "long fallback SVG did not render stat labels");
  assert(svg.includes('class="poster-logo-image"'), "long fallback SVG should include the brand logo image when available");
  assert(svg.includes("Build next year&apos;s story"), "long fallback SVG should include the final CTA label");
  assert(svg.includes("poster-cta"), "long fallback SVG should render the CTA as a distinct poster element");
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

function runAssetVersionSmoke() {
  const files = ["index.html", "embed-example.html", "builder.html"];
  const releaseToken = "jsuw-prod-20260601h";
  const assetPattern = /(?:href|src|data-source|data-config-source|data-teen-source)="\.\/(?:jsu-wrapped|wrapped-builder|sample-wrapped|sample-teen-wrapped|wrapped-config)[^"]+"/g;
  const inline = loadText("wordpress-inline-embed.html");
  const builderJs = loadText("wrapped-builder.js");
  const inlinePattern = /data-(?:source|config-source|teen-source)="https:\/\/stsimon-ncsy\.github\.io\/jsu-wrapped-widget\/(?:sample-wrapped|sample-teen-wrapped|wrapped-config)[^"]+"/g;
  const readme = loadText("README.md");
  const docs = loadText("docs/production-readiness.md");
  const readmePattern = /https:\/\/stsimon-ncsy\.github\.io\/jsu-wrapped-widget\/(?:jsu-wrapped|sample-wrapped|sample-teen-wrapped|wrapped-config)[^"`<\s]+/g;

  files.forEach((file) => {
    const html = loadText(file);
    const references = html.match(assetPattern) || [];

    assert(references.length, `${file} has no versioned local asset references`);
    references.forEach((reference) => {
      assert(reference.includes(`?v=${releaseToken}`), `${file} has stale or missing asset version: ${reference}`);
    });
    assert(!/[?&]v=(?:builder|palette)\d+/i.test(html), `${file} still uses builder/palette cache tokens`);
  });

  assert(builderJs.includes(`sample-wrapped-2026.json?v=${releaseToken}`), "builder data fetch should use the shared production cache token");
  assert(builderJs.includes(`wrapped-config-2026.json?v=${releaseToken}`), "builder config fetch should use the shared production cache token");
  assert(!/[?&]v=(?:builder|palette)\d+/i.test(builderJs), "wrapped-builder.js still uses builder/palette cache tokens");

  const inlineReferences = inline.match(inlinePattern) || [];

  assert(inlineReferences.length === 3, "WordPress embed should version chapter, config, and teen data URLs");
  inlineReferences.forEach((reference) => {
    assert(reference.includes(`?v=${releaseToken}`), `WordPress embed has stale or missing remote data version: ${reference}`);
  });

  const readmeReferences = readme.match(readmePattern) || [];

  assert(readmeReferences.length === 5, "README WordPress snippet should version CSS, JS, chapter data, config, and teen data URLs");
  readmeReferences.forEach((reference) => {
    assert(reference.includes(`?v=${releaseToken}`), `README WordPress snippet has stale or missing asset version: ${reference}`);
  });
  assert(readme.includes("Bump the shared cache token"), "README should remind maintainers to update the pasteable snippet cache token");
  assert(docs.includes("README.md"), "production docs should include README in the shared cache token bump list");
}

function runCacheTokenBumpSmoke() {
  const scriptPath = "bump-cache-token.js";
  const readme = loadText("README.md");
  const docs = loadText("docs/production-readiness.md");
  const listed = childProcess.execFileSync(process.execPath, ["check-production.js", "--list"], { encoding: "utf8" });

  assert(fs.existsSync(scriptPath), "cache-token bump helper is missing");

  const bump = require("./bump-cache-token.js");
  const sample = "one?v=jsuw-prod-20250101a two?v=jsuw-prod-20250101a placeholder=jsuw-prod-YYYYMMDDx";
  const result = bump.replaceCacheTokenInText(sample, "jsuw-prod-20260602a");

  assert(result.count === 2, `cache-token helper replaced ${result.count} tokens instead of 2`);
  assert(result.text === "one?v=jsuw-prod-20260602a two?v=jsuw-prod-20260602a placeholder=jsuw-prod-YYYYMMDDx", "cache-token helper did not replace every real token");
  assert(bump.validateToken("jsuw-prod-20260601h") === "jsuw-prod-20260601h", "cache-token helper should accept production token format");

  let invalidMessage = "";
  try {
    bump.validateToken("bad token");
  } catch (error) {
    invalidMessage = String(error.message || "");
  }

  assert(invalidMessage.includes("jsuw-prod-"), "cache-token helper should reject invalid token formats clearly");
  assert(listed.includes("node --check bump-cache-token.js"), "production QA should syntax-check the cache-token bump helper");
  assert(readme.includes("node bump-cache-token.js"), "README should document the cache-token bump helper");
  assert(docs.includes("node bump-cache-token.js"), "production docs should document the cache-token bump helper");
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

function runCssPolishSmoke() {
  const css = loadText("jsu-wrapped.css");
  const negativeLetterSpacing = css.match(/letter-spacing\s*:\s*-\s*[^;]+/g) || [];

  assert(!negativeLetterSpacing.length, `Negative letter-spacing declarations: ${negativeLetterSpacing.join(", ")}`);
}

function cssRuleBody(css, selector) {
  const start = css.indexOf(`${selector} {`);

  if (start === -1) {
    return "";
  }

  const open = css.indexOf("{", start);
  const close = findMatchingBrace(css, open);

  return close === -1 ? "" : css.slice(open + 1, close);
}

function cssNumericDeclaration(body, property) {
  const match = body.match(new RegExp(`${property}\\s*:\\s*([0-9.]+)`));

  return match ? Number(match[1]) : NaN;
}

function runBigStatGlyphSafetySmoke() {
  const css = loadText("jsu-wrapped.css");
  const docs = loadText("docs/production-readiness.md");
  const statBody = cssRuleBody(css, "#jsu-wrapped .jsuw-reference-stat");
  const lineHeight = cssNumericDeclaration(statBody, "line-height");

  assert(statBody, "big stat CSS rule is missing");
  assert(lineHeight >= 0.9, `big stat line-height is too tight and can clip digits: ${lineHeight}`);
  assert(docs.includes("Big Stat Glyph Safety"), "production docs missing big stat glyph safety note");
}

function runMobileFullscreenLayoutSmoke() {
  const css = loadText("jsu-wrapped.css");
  const docs = loadText("docs/production-readiness.md");

  assert(/#jsu-wrapped\s*\{/.test(css), "widget root CSS block is missing");
  assert(css.includes("overflow-x: hidden;"), "widget root should clip horizontal overflow inside the scoped container");
  assert(css.includes("@media (max-width: 600px)"), "mobile fullscreen media query is missing");
  assert(/#jsu-wrapped \.jsuw-shell\s*\{[^}]*max-width:\s*100%;/.test(css), "mobile shell should fill the available embed width");
  assert(/#jsu-wrapped \.jsuw-story\s*\{[^}]*aspect-ratio:\s*auto;/.test(css), "mobile story should not be constrained to desktop aspect sizing");
  assert(css.includes("height: calc(100svh - 16px);"), "mobile story should use small-viewport height for fullscreen feel");
  assert(docs.includes("Mobile Fullscreen Contract"), "production docs missing mobile fullscreen contract");
}

function runBiggestCardMobileLayoutSmoke() {
  const css = loadText("jsu-wrapped.css");

  assert(css.includes("#jsu-wrapped .jsuw-reference-biggest .jsuw-ticket"), "biggest-event card needs a card-specific ticket position");
  assert(css.includes("#jsu-wrapped .jsuw-reference-biggest .jsuw-headline"), "biggest-event card needs a card-specific mobile headline scale");
}

function runCiWorkflowSmoke() {
  const workflowPath = ".github/workflows/qa.yml";
  const docs = loadText("docs/production-readiness.md");

  assert(fs.existsSync(workflowPath), "GitHub Actions QA workflow is missing");

  const workflow = loadText(workflowPath);
  const requiredCommands = [
    "node check-production.js"
  ];

  requiredCommands.forEach((command) => {
    assert(workflow.includes(command), `GitHub Actions QA workflow missing ${command}`);
  });

  assert(workflow.includes("pull_request"), "GitHub Actions QA workflow should run on pull requests");
  assert(workflow.includes("push"), "GitHub Actions QA workflow should run on push");
  assert(docs.includes("GitHub Actions"), "production docs missing GitHub Actions QA note");
}

function runProductionCheckSmoke() {
  const scriptPath = "check-production.js";
  const workflow = loadText(".github/workflows/qa.yml");
  const docs = loadText("docs/production-readiness.md");

  assert(fs.existsSync(scriptPath), "single production QA command is missing");
  const listed = childProcess.execFileSync(process.execPath, [scriptPath, "--list"], { encoding: "utf8" });
  const requiredCommands = [
    "node sync-wordpress-inline.js",
    "node generate-share-pages.js",
    "node --check jsu-wrapped.js",
    "node --check wrapped-builder.js",
    "node --check validate-wrapped-data.js",
    "node --check sync-wordpress-inline.js",
    "node --check generate-share-pages.js",
    "node --check merge-builder-submission.js",
    "node --check review-builder-submissions.js",
    "node --check bump-cache-token.js",
    "node --check qa-smoke.js",
    "node validate-wrapped-data.js",
    "node qa-smoke.js",
    "git diff --exit-code wordpress-inline-embed.html",
    "git diff --exit-code share",
    "git status --porcelain -- share",
    "git diff --check"
  ];

  requiredCommands.forEach((command) => {
    assert(listed.includes(command), `production QA command missing ${command}`);
  });

  assert(listed.indexOf("node validate-wrapped-data.js") < listed.indexOf("node generate-share-pages.js"), "production QA should validate data before generating share pages");
  assert(workflow.includes("node check-production.js"), "GitHub Actions should run the single production QA command");
  assert(docs.includes("node check-production.js"), "production docs should point to the single production QA command");
}

function runHostedSmokeScriptSmoke() {
  const scriptPath = "hosted-smoke.js";

  assert(fs.existsSync(scriptPath), "hosted GitHub Pages smoke script is missing");

  const hostedSmoke = require("./hosted-smoke.js");
  const goodAssets = {
    "": {
      status: 200,
      text: '<div id="jsu-wrapped" data-share-base="./share/"></div><script src="./jsu-wrapped.js?v=jsuw-prod-20260601h"></script>'
    },
    "builder.html": {
      status: 200,
      text: '<meta name="robots" content="noindex,nofollow"><div id="wrapped-builder"></div>'
    },
    "jsu-wrapped.css": {
      status: 200,
      text: "#jsu-wrapped { color: #fff; }"
    },
    "jsu-wrapped.js": {
      status: 200,
      text: "window.JSUWrapped = {};"
    },
    "sample-wrapped-2026.json": {
      status: 200,
      text: JSON.stringify([{ chapter_slug: "baltimore", chapter_name: "Baltimore" }])
    },
    "wrapped-config-2026.json": {
      status: 200,
      text: JSON.stringify({ version: 1, year: "2026" })
    },
    "share/baltimore/": {
      status: 200,
      text: [
        "<title>JSU/NCSY Wrapped - Baltimore</title>",
        'property="og:title" content="JSU/NCSY Wrapped - Baltimore"',
        'property="og:image:alt" content="JSU/NCSY Wrapped social preview for Baltimore"',
        'http-equiv="refresh"',
        "?chapter=baltimore"
      ].join("")
    }
  };
  const goodReport = hostedSmoke.validateHostedAssets(goodAssets);
  const badAssets = Object.assign({}, goodAssets, {
    "share/baltimore/": {
      status: 200,
      text: "<title>Broken</title>"
    }
  });
  const badReport = hostedSmoke.validateHostedAssets(badAssets);
  const dryRunOutput = childProcess.execFileSync(process.execPath, [scriptPath, "--base", "https://example.org/wrapped", "--dry-run"], {
    cwd: __dirname,
    encoding: "utf8",
    stdio: "pipe"
  });
  const listed = childProcess.execFileSync(process.execPath, ["check-production.js", "--list"], { encoding: "utf8" });
  const readme = loadText("README.md");
  const docs = loadText("docs/production-readiness.md");

  assert(goodReport.ok, `hosted smoke validator rejected good assets: ${goodReport.errors.join("; ")}`);
  assert(!badReport.ok && badReport.errors.some((error) => error.includes("Baltimore share page")), "hosted smoke validator should reject broken share metadata");
  assert(dryRunOutput.includes("https://example.org/wrapped/"), "hosted smoke dry run should list normalized base URL");
  assert(dryRunOutput.includes("https://example.org/wrapped/share/baltimore/"), "hosted smoke dry run should list Baltimore share page");
  assert(listed.includes("node --check hosted-smoke.js"), "production QA should syntax-check the hosted smoke helper");
  assert(readme.includes("node hosted-smoke.js"), "README should document hosted smoke checks");
  assert(docs.includes("node hosted-smoke.js"), "production docs should document hosted smoke checks");
}

function runReadmeSmoke() {
  const path = "README.md";

  assert(fs.existsSync(path), "top-level production handoff README is missing");
  const readme = loadText(path);
  const requiredPhrases = [
    "JSU/NCSY Wrapped",
    "GitHub Pages",
    "WordPress",
    "node check-production.js",
    "jsu-wrapped.js",
    "jsu-wrapped.css",
    "sample-wrapped-2026.json",
    "wrapped-config-2026.json",
    "Open email draft",
    "Open review form",
    "Download submission",
    "merge-builder-submission.js",
    "review-builder-submissions.js",
    "docs/production-readiness.md",
    "docs/staff-playbook.md"
  ];

  requiredPhrases.forEach((phrase) => {
    assert(readme.includes(phrase), `README missing ${phrase}`);
  });
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
    "Variants",
    "Open email draft",
    "Open review form",
    "Download submission",
    "Copy submission",
    "merge-builder-submission.js",
    "review-builder-submissions.js",
    "Do not commit downloaded staff submission JSON"
  ];

  requiredPhrases.forEach((phrase) => {
    assert(playbook.includes(phrase), `staff playbook missing ${phrase}`);
  });
}

function runDataContractDocSmoke() {
  const path = "docs/data-contract.md";

  assert(fs.existsSync(path), "data contract doc is missing");

  const doc = loadText(path);
  const readme = loadText("README.md");
  const productionDocs = loadText("docs/production-readiness.md");
  const requiredPhrases = [
    "JSU/NCSY Wrapped Data Contract",
    "sample-wrapped-2026.json",
    "wrapped-config-2026.json",
    "chapter_slug",
    "scope_type",
    "chapter",
    "region",
    "program",
    "record_overrides",
    "card_overrides",
    "custom_cards",
    "Unsafe protocols",
    "Media cards need an image URL",
    "brand_logo",
    "palette",
    "repeat_attendee_rate_label",
    "largest_event_name",
    "Do not include teen IDs",
    "node validate-wrapped-data.js"
  ];

  requiredPhrases.forEach((phrase) => {
    assert(doc.includes(phrase), `data contract doc missing ${phrase}`);
  });

  assert(readme.includes("docs/data-contract.md"), "README should link the data contract doc");
  assert(productionDocs.includes("docs/data-contract.md"), "production docs should link the data contract doc");
}

function runPilotStaffGuideSmoke() {
  const path = "docs/pilot-staff-builder-guide.md";

  assert(fs.existsSync(path), "pilot staff builder guide is missing");

  const guide = loadText(path);
  const readme = loadText("README.md");
  const playbook = loadText("docs/staff-playbook.md");
  const requiredPhrases = [
    "Pilot Staff Builder Guide",
    "review_email",
    "review_url",
    "Pick your region and chapter",
    "Make only the changes you want reviewed",
    "Fill in Submission info",
    "Open email draft",
    "Open review form",
    "Copy submission",
    "Download submission",
    "Unsafe URLs",
    "Do not use Copy JSON",
    "Do not edit the submission JSON by hand",
    "If you are unsure, download the submission file"
  ];

  requiredPhrases.forEach((phrase) => {
    assert(guide.includes(phrase), `pilot staff guide missing ${phrase}`);
  });

  assert(readme.includes("docs/pilot-staff-builder-guide.md"), "README should link the pilot staff guide");
  assert(playbook.includes("docs/pilot-staff-builder-guide.md"), "staff playbook should link the pilot staff guide");
}

function runStaffSubmissionPrivacySmoke() {
  const gitignore = loadText(".gitignore");
  const readme = loadText("README.md");
  const playbook = loadText("docs/staff-playbook.md");
  const requiredIgnorePatterns = [
    "staff-submissions/",
    "submissions/",
    "*-builder-submission.json",
    "jsu-wrapped-builder-submission*.json"
  ];

  requiredIgnorePatterns.forEach((pattern) => {
    assert(gitignore.includes(pattern), `.gitignore missing staff submission pattern ${pattern}`);
  });

  assert(readme.includes("Do not commit downloaded staff submission JSON"), "README should warn against committing staff submission JSON");
  assert(playbook.includes("Do not commit downloaded staff submission JSON"), "staff playbook should warn against committing staff submission JSON");
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
  const placeholderPublicStoryReport = dataValidator.validateChapterRecords([
    {
      chapter_slug: "test",
      chapter_name: "Test",
      region_name: "National",
      year_label: "2025-2026",
      events_hosted: 1,
      largest_event_name: "Test event"
    }
  ]);
  const teenPrivacyReport = dataValidator.validateTeenRecords([
    {
      teen_slug: "maya-test",
      teen_name: "Maya",
      chapter_name: "Northwood JSU",
      year_label: "2025-2026",
      teen_id: "real-teen-123",
      email: "maya@example.org",
      emergency_phone: "410-555-1212",
      events_attended: 5
    }
  ]);
  const typoConfigReport = dataValidator.validateConfig({
    version: 1,
    year: "2026",
    defaults: {
      ctaa_label: "Typo should not be ignored"
    },
    chaptrers: {
      baltimore: {
        cta_label: "Wrong root should not be ignored"
      }
    }
  }, records);
  const typoRecordOverrideReport = dataValidator.validateConfig({
    version: 1,
    year: "2026",
    chapters: {
      baltimore: {
        record_overrides: {
          unique_teeens: 999
        }
      }
    }
  }, records);
  const typoCardOverrideReport = dataValidator.validateConfig({
    version: 1,
    year: "2026",
    chapters: {
      baltimore: {
        card_overrides: {
          events: {
            headlne: "Typo should not be ignored"
          }
        }
      }
    }
  }, records);
  const typoCustomCardReport = dataValidator.validateConfig({
    version: 1,
    year: "2026",
    chapters: {
      baltimore: {
        custom_cards: [
          {
            type: "media",
            placement: "before_final",
            headline: "Typo should not be ignored",
            image_urll: "https://example.org/photo.jpg"
          }
        ]
      }
    }
  }, records);
  const missingMediaImageReport = dataValidator.validateConfig({
    version: 1,
    year: "2026",
    chapters: {
      baltimore: {
        custom_cards: [
          {
            type: "media",
            placement: "before_final",
            headline: "Media cards need images"
          }
        ]
      }
    }
  }, records);
  const safeMediaImageReport = dataValidator.validateConfig({
    version: 1,
    year: "2026",
    chapters: {
      baltimore: {
        custom_cards: [
          {
            type: "media",
            placement: "before_final",
            headline: "Photo moment",
            image_url: "https://res.cloudinary.com/demo/image/upload/sample.jpg"
          }
        ]
      }
    }
  }, records);
  const unsafeMediaImageReport = dataValidator.validateConfig({
    version: 1,
    year: "2026",
    chapters: {
      baltimore: {
        custom_cards: [
          {
            type: "media",
            placement: "before_final",
            headline: "Unsafe photo",
            image_url: "javascript:alert(1)"
          },
          {
            type: "image",
            placement: "before_final",
            headline: "Unsafe alternate photo",
            src: "data:text/html,<script>alert(1)</script>"
          }
        ]
      }
    }
  }, records);
  const invalidBrandPaletteReport = dataValidator.validateConfig({
    version: 1,
    year: "2026",
    defaults: {
      brand_logo: "ncsyy",
      palette: "midnight"
    },
    chapters: {
      baltimore: {
        accent_palette: "purplegold"
      }
    }
  }, records);
  const validCtaHrefReport = dataValidator.validateConfig({
    version: 1,
    year: "2026",
    defaults: {
      cta_href: "https://ncsy.org/ncsy-wrapped/#interest"
    },
    chapters: {
      baltimore: {
        ctaHref: "/ncsy-wrapped/#interest"
      }
    }
  }, records);
  const unsafeCtaHrefReport = dataValidator.validateConfig({
    version: 1,
    year: "2026",
    defaults: {
      cta_href: "javascript:alert(1)"
    },
    chapters: {
      baltimore: {
        variants: {
          unsafe: {
            ctaHref: "data:text/html,<script>alert(1)</script>"
          }
        }
      }
    }
  }, records);

  assert(report.ok, `sample data validation failed: ${report.errors.join("; ")}`);
  assert(!duplicateReport.ok && duplicateReport.errors.some((error) => error.includes("Duplicate chapter_slug")), "duplicate chapter slugs should fail validation");
  assert(!badMetricReport.ok && badMetricReport.errors.some((error) => error.includes("events_hosted")), "invalid numeric metrics should fail validation");
  assert(!placeholderPublicStoryReport.ok && placeholderPublicStoryReport.errors.some((error) => error.includes("placeholder public story text")), "placeholder public story data should fail validation");
  assert(!teenPrivacyReport.ok && teenPrivacyReport.errors.some((error) => error.includes("teen_id")), "teen ids should fail validation");
  assert(!teenPrivacyReport.ok && teenPrivacyReport.errors.some((error) => error.includes("email")), "teen emails should fail validation");
  assert(!teenPrivacyReport.ok && teenPrivacyReport.errors.some((error) => error.includes("emergency_phone")), "teen phone fields should fail validation");
  assert(!typoConfigReport.ok && typoConfigReport.errors.some((error) => error.includes("config.chaptrers")), "unknown top-level config keys should fail validation");
  assert(!typoConfigReport.ok && typoConfigReport.errors.some((error) => error.includes("config.defaults.ctaa_label")), "unknown config section keys should fail validation");
  assert(!typoRecordOverrideReport.ok && typoRecordOverrideReport.errors.some((error) => error.includes("record_overrides.unique_teeens")), "unknown record override keys should fail validation");
  assert(!typoCardOverrideReport.ok && typoCardOverrideReport.errors.some((error) => error.includes("card_overrides.events.headlne")), "unknown card override keys should fail validation");
  assert(!typoCustomCardReport.ok && typoCustomCardReport.errors.some((error) => error.includes("custom_cards[0].image_urll")), "unknown custom card keys should fail validation");
  assert(!missingMediaImageReport.ok && missingMediaImageReport.errors.some((error) => error.includes("custom_cards[0].image_url")), "media custom cards without an image URL should fail validation");
  assert(safeMediaImageReport.ok, `safe media image URL config should pass validation: ${safeMediaImageReport.errors.join("; ")}`);
  assert(!unsafeMediaImageReport.ok && unsafeMediaImageReport.errors.some((error) => error.includes("custom_cards[0].image_url")), "unsafe media image_url should fail validation");
  assert(!unsafeMediaImageReport.ok && unsafeMediaImageReport.errors.some((error) => error.includes("custom_cards[1].src")), "unsafe media src should fail validation");
  assert(!invalidBrandPaletteReport.ok && invalidBrandPaletteReport.errors.some((error) => error.includes("config.defaults.brand_logo")), "invalid config brand logos should fail validation");
  assert(!invalidBrandPaletteReport.ok && invalidBrandPaletteReport.errors.some((error) => error.includes("config.defaults.palette")), "invalid config palettes should fail validation");
  assert(!invalidBrandPaletteReport.ok && invalidBrandPaletteReport.errors.some((error) => error.includes("config chapter \"baltimore\".accent_palette")), "invalid config accent palettes should fail validation");
  assert(validCtaHrefReport.ok, `safe CTA href config should pass validation: ${validCtaHrefReport.errors.join("; ")}`);
  assert(!unsafeCtaHrefReport.ok && unsafeCtaHrefReport.errors.some((error) => error.includes("config.defaults.cta_href")), "unsafe default CTA href should fail validation");
  assert(!unsafeCtaHrefReport.ok && unsafeCtaHrefReport.errors.some((error) => error.includes("variants.unsafe.ctaHref")), "unsafe variant CTA href should fail validation");
}

function main() {
  const records = loadJson("sample-wrapped-2026.json");
  const config = loadJson("wrapped-config-2026.json");

  runDataValidationSmoke(records, config);
  runLayeredVariantSmoke();
  runPickerSmoke(records, config);
  runHiddenVariantSmoke();
  runSampleVariantSmoke(records, config);
  runSampleConfigConsistencySmoke(records, config);
  runPageMetadataSmoke();
  runStaticShareSmoke();
  runEntryPageSocialMetadataSmoke();
  runShareGeneratorCleanupSmoke();
  runAnalyticsSmoke();
  runFormPrefillSmoke();
  runAnalyticsDocsSmoke();
  runStoryScopeSmoke();
  runScopedStoryValidationSmoke();
  runBuilderFutureScopeSmoke();
  runBuilderProtectedCardsSmoke();
  runBuilderSubmissionSmoke();
  runBuilderIndexingSmoke();
  runBuilderSubmissionMergeSmoke();
  runBuilderSubmissionBatchReviewSmoke();
  runFallbackSvgSmoke(records, config);
  runInlineEmbedSmoke();
  runAssetVersionSmoke();
  runCacheTokenBumpSmoke();
  runCssIsolationSmoke();
  runCssPolishSmoke();
  runBigStatGlyphSafetySmoke();
  runMobileFullscreenLayoutSmoke();
  runBiggestCardMobileLayoutSmoke();
  runCiWorkflowSmoke();
  runProductionCheckSmoke();
  runHostedSmokeScriptSmoke();
  runReadmeSmoke();
  runStaffPlaybookSmoke();
  runDataContractDocSmoke();
  runPilotStaffGuideSmoke();
  runStaffSubmissionPrivacySmoke();

  console.log("qa smoke ok");
}

main();
