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
  assert(html.includes('name="twitter:title" content="' + expectedTitle + '"'), "Baltimore static share page Twitter title mismatch");
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
  assert(teenShareUrl === "https://example.org/wrapped/?mode=teen&teen=maya-test", `teen share URL should fall back to current URL: ${teenShareUrl}`);
  assert(shareGenerator.sharePagePath({ chapter_slug: "la--city", chapter_name: "LA - City" }) === "la--city/", "share page path should preserve existing chapter slug");
  assert(regionHtml.includes("<title>JSU/NCSY Wrapped - Atlantic Seaboard</title>"), "region share page title mismatch");
  assert(regionHtml.includes("/share/region/atlantic-seaboard/"), "region share page URL path mismatch");
  assert(regionHtml.includes("?scope=region&amp;region=atlantic-seaboard"), "region share page story redirect mismatch");
  assert(programHtml.includes("<title>JSU/NCSY Wrapped - Shabbat Across JSU</title>"), "program share page title mismatch");
  assert(programHtml.includes("/share/program/shabbat/"), "program share page URL path mismatch");
  assert(programHtml.includes("?scope=program&amp;program=shabbat"), "program share page story redirect mismatch");
}

function runShareGeneratorCleanupSmoke() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jsuw-share-"));

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
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
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

  assert(builderHtml.includes('data-builder-action="download-submission"'), "builder should expose a staff submission download button");
  assert(builderHtml.includes('data-builder-action="copy-submission"'), "builder should expose a staff submission copy button");
  assert(builderHtml.includes("data-builder-submitter-name"), "builder should collect submitter name for staff submissions");
  assert(builderHtml.includes("data-builder-submitter-email"), "builder should collect submitter email for staff submissions");
  assert(builderHtml.includes("data-builder-submitter-note"), "builder should collect reviewer notes for staff submissions");
  assert(builderJs.includes("function buildSubmissionPayload"), "builder should build a scoped staff submission payload");
  assert(builderJs.includes("function submissionMeta"), "builder should read submitter metadata into submissions");
  assert(builderJs.includes("merge_path"), "submission payload should include where the patch belongs in wrapped-config");
  assert(builderJs.includes("change_summary"), "submission payload should include a human-readable change summary");
  assert(builderJs.includes("config_patch"), "submission payload should include only the active scope/variant config patch");
  assert(builderJs.includes("submitter_name"), "submission payload should include submitter name");
  assert(builderJs.includes("submitter_email"), "submission payload should include submitter email");
  assert(builderJs.includes("submitter_note"), "submission payload should include reviewer note");
  assert(builderJs.includes("jsu-wrapped-builder-submission"), "submission payload should identify its schema");
  assert(builderJs.includes("downloadSubmission"), "builder should download staff submissions as files");
  assert(builderJs.includes("copySubmission"), "builder should copy staff submissions for paste-based review");
  assert(builderJs.includes("copyTextToClipboard"), "builder should have a clipboard fallback for submission JSON");
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
  const releaseToken = "jsuw-prod-20260601f";
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

  assert(workflow.includes("node check-production.js"), "GitHub Actions should run the single production QA command");
  assert(docs.includes("node check-production.js"), "production docs should point to the single production QA command");
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
    "Download submission",
    "merge-builder-submission.js",
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
    "Download submission",
    "Copy submission",
    "merge-builder-submission.js",
    "Do not commit downloaded staff submission JSON"
  ];

  requiredPhrases.forEach((phrase) => {
    assert(playbook.includes(phrase), `staff playbook missing ${phrase}`);
  });
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

  assert(report.ok, `sample data validation failed: ${report.errors.join("; ")}`);
  assert(!duplicateReport.ok && duplicateReport.errors.some((error) => error.includes("Duplicate chapter_slug")), "duplicate chapter slugs should fail validation");
  assert(!badMetricReport.ok && badMetricReport.errors.some((error) => error.includes("events_hosted")), "invalid numeric metrics should fail validation");
  assert(!teenPrivacyReport.ok && teenPrivacyReport.errors.some((error) => error.includes("teen_id")), "teen ids should fail validation");
  assert(!teenPrivacyReport.ok && teenPrivacyReport.errors.some((error) => error.includes("email")), "teen emails should fail validation");
  assert(!teenPrivacyReport.ok && teenPrivacyReport.errors.some((error) => error.includes("emergency_phone")), "teen phone fields should fail validation");
  assert(!typoConfigReport.ok && typoConfigReport.errors.some((error) => error.includes("config.chaptrers")), "unknown top-level config keys should fail validation");
  assert(!typoConfigReport.ok && typoConfigReport.errors.some((error) => error.includes("config.defaults.ctaa_label")), "unknown config section keys should fail validation");
  assert(!typoRecordOverrideReport.ok && typoRecordOverrideReport.errors.some((error) => error.includes("record_overrides.unique_teeens")), "unknown record override keys should fail validation");
  assert(!typoCardOverrideReport.ok && typoCardOverrideReport.errors.some((error) => error.includes("card_overrides.events.headlne")), "unknown card override keys should fail validation");
  assert(!typoCustomCardReport.ok && typoCustomCardReport.errors.some((error) => error.includes("custom_cards[0].image_urll")), "unknown custom card keys should fail validation");
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
  runFallbackSvgSmoke(records, config);
  runInlineEmbedSmoke();
  runAssetVersionSmoke();
  runCssIsolationSmoke();
  runCssPolishSmoke();
  runBiggestCardMobileLayoutSmoke();
  runCiWorkflowSmoke();
  runProductionCheckSmoke();
  runReadmeSmoke();
  runStaffPlaybookSmoke();
  runStaffSubmissionPrivacySmoke();

  console.log("qa smoke ok");
}

main();
