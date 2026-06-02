const fs = require("fs");
const os = require("os");
const path = require("path");
const childProcess = require("child_process");
const vm = require("vm");
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

function loadBuilderTools(currentHref) {
  const sandbox = {
    Blob: function Blob() {},
    console,
    document: {
      addEventListener() {},
      createElement() {
        return {
          click() {},
          focus() {},
          remove() {},
          select() {},
          setAttribute() {},
          style: {}
        };
      },
      body: {
        appendChild() {}
      },
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
      readyState: "loading"
    },
    fetch() {
      throw new Error("fetch should not run in builder tools smoke");
    },
    navigator: {},
    setTimeout() {},
    URL,
    window: {
      addEventListener() {},
      clearTimeout() {},
      location: {
        href: currentHref
      },
      setTimeout() {}
    }
  };

  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);
  vm.runInContext(loadText("wrapped-builder.js"), sandbox);
  return sandbox.window.JSUWrappedBuilderTools;
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

  const ctaUrl = api.createCtaPrefillUrl(
    "https://ncsy.org/ncsy-wrapped-interest/?utm_source=wrapped",
    {
      chapter_slug: "baltimore",
      chapter_name: "Baltimore",
      region_name: "Atlantic Seaboard",
      year_label: "2025-2026"
    },
    "https://stsimon-ncsy.github.io/jsu-wrapped-widget/?chapter=baltimore&variant=donor-recap"
  );
  const parsedCtaUrl = new URL(ctaUrl);

  assert(parsedCtaUrl.origin === "https://ncsy.org", "CTA prefill should preserve the form origin");
  assert(parsedCtaUrl.searchParams.get("utm_source") === "wrapped", "CTA prefill should preserve existing form params");
  assert(parsedCtaUrl.searchParams.get("wrapped_scope") === "chapter", "CTA prefill scope missing");
  assert(parsedCtaUrl.searchParams.get("wrapped_slug") === "baltimore", "CTA prefill slug missing");
  assert(parsedCtaUrl.searchParams.get("wrapped_name") === "Baltimore", "CTA prefill name missing");
  assert(parsedCtaUrl.searchParams.get("wrapped_chapter_slug") === "baltimore", "CTA prefill chapter slug missing");
  assert(parsedCtaUrl.searchParams.get("wrapped_chapter") === "Baltimore", "CTA prefill chapter name missing");
  assert(parsedCtaUrl.searchParams.get("wrapped_region") === "Atlantic Seaboard", "CTA prefill region missing");
  assert(parsedCtaUrl.searchParams.get("wrapped_variant") === "donor-recap", "CTA prefill variant missing");
  assert(parsedCtaUrl.searchParams.get("wrapped_year") === "2025-2026", "CTA prefill year missing");
  assert(parsedCtaUrl.searchParams.get("wrapped_url") === "https://stsimon-ncsy.github.io/jsu-wrapped-widget/?chapter=baltimore&variant=donor-recap", "CTA prefill wrapped URL missing");
  assert(!ctaUrl.includes("events_hosted"), "CTA prefill should not include full story JSON or metrics");
  assert(api.createCtaPrefillUrl("#interest", { chapter_slug: "baltimore" }, "https://example.org/wrapped/?chapter=baltimore") === "#interest", "CTA prefill should leave local fragments alone");
  assert(api.createCtaPrefillUrl("javascript:alert(1)", { chapter_slug: "baltimore" }, "https://example.org/wrapped/?chapter=baltimore") === "", "CTA prefill should reject unsafe URLs");
  assert(api.createCtaPrefillUrl("https://ncsy.org/wrapped-interest/?wrapped_submission=%7B%22cards%22%3A%5B%5D%7D", { chapter_slug: "baltimore" }, "https://example.org/wrapped/?chapter=baltimore") === "", "CTA prefill should reject URLs that already carry JSON submission payloads");
}

function runRuntimeUrlSafetySmoke() {
  const source = loadText("jsu-wrapped.js");
  const record = {
    chapter_slug: "baltimore",
    chapter_name: "Baltimore",
    region_name: "Atlantic Seaboard",
    year_label: "2025-2026",
    events_hosted: 10,
    unique_teens: 100,
    engagement_moments: 200,
    chapter_persona: "The Connector"
  };
  const safeMediaConfig = {
    custom_cards: [
      {
        id: "safe-photo",
        type: "media",
        placement: "before_final",
        headline: "Photo moment",
        image_url: "https://res.cloudinary.com/demo/image/upload/sample.jpg"
      }
    ]
  };
  const unsafeMediaConfig = {
    custom_cards: [
      {
        id: "unsafe-photo",
        type: "media",
        placement: "before_final",
        headline: "Unsafe photo",
        image_url: "javascript:alert(1)"
      }
    ]
  };
  const collidingCustomIdConfig = {
    custom_cards: [
      {
        id: "final",
        type: "text",
        placement: "before_final",
        headline: "Custom final"
      },
      {
        id: "final",
        type: "text",
        placement: "before_final",
        headline: "Another custom final"
      }
    ]
  };
  const safeMediaCard = api.createCards(record, { storyConfig: safeMediaConfig }).find((card) => card.id === "safe-photo");
  const unsafeMediaCard = api.createCards(record, { storyConfig: unsafeMediaConfig }).find((card) => card.id === "unsafe-photo");
  const collidingCards = api.createCards(record, { storyConfig: collidingCustomIdConfig });
  const collidingIds = collidingCards.map((card) => card.id);

  assert(typeof api.isSafeStaticUrl === "function", "runtime should expose the shared static URL safety helper for smoke tests");
  assert(api.isSafeStaticUrl("https://ncsy.org/ncsy-wrapped/"), "runtime should allow https CTA URLs");
  assert(api.isSafeStaticUrl("/ncsy-wrapped/#interest"), "runtime should allow root-relative CTA URLs");
  assert(api.isSafeStaticUrl("./share/baltimore/"), "runtime should allow dot-relative CTA URLs");
  assert(!api.isSafeStaticUrl("javascript:alert(1)"), "runtime should reject javascript CTA URLs");
  assert(!api.isSafeStaticUrl("data:text/html,<script>alert(1)</script>"), "runtime should reject data CTA URLs");
  assert(!api.isSafeStaticUrl("//evil.example/wrapped"), "runtime should reject protocol-relative CTA URLs");
  assert(source.includes("isUsableCtaHref(rawHref)"), "runtime should sanitize configured CTA href values before rendering");
  assert(source.includes("isUsableCtaHref(href) ? href : \"\""), "runtime should guard CTA navigation at click time");
  assert(source.includes("CTA link is not available."), "runtime should report blocked unsafe CTA navigation without leaving the page");
  assert(safeMediaCard && safeMediaCard.imageUrl === "https://res.cloudinary.com/demo/image/upload/sample.jpg", "runtime should keep safe custom media image URLs");
  assert(unsafeMediaCard && unsafeMediaCard.imageUrl === "", "runtime should strip unsafe custom media image URLs before rendering");
  assert(source.includes("isSafeStaticUrl(rawImageUrl)"), "runtime should sanitize configured custom media image URLs");
  assert(collidingIds.filter((id) => id === "final").length === 1, "runtime should not let custom cards duplicate the generated final card id");
  assert(new Set(collidingIds).size === collidingIds.length, "runtime should dedupe custom card ids before rendering");
}

function runAnalyticsDocsSmoke() {
  const docs = loadText("analytics-gtm-setup.md");
  const dataLayerVariablesSection = docs.match(/4\. Create Data Layer Variables:[\s\S]*?5\. Create one GA4 Event tag:/);
  const customDimensionsSection = docs.match(/Register these as event-scoped custom dimensions:\s*```text\n([\s\S]*?)\n```/);
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

  assert(dataLayerVariablesSection && dataLayerVariablesSection[0].includes("cta_href"), "analytics GTM docs should include cta_href as a Data Layer Variable");
  assert(customDimensionsSection && !customDimensionsSection[1].includes("cta_href"), "analytics GTM docs should not register cta_href as a default custom dimension");
  assert(/Do not register `cta_href` as a GA4 custom\s+dimension by default/.test(docs), "analytics GTM docs should explain why cta_href is excluded from custom dimensions");
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
  assert(builderHtml.includes('data-builder-action="copy-pilot-link"'), "builder should let reviewers copy a pre-addressed staff pilot link");
  assert(builderHtml.includes("data-builder-review-email-input"), "builder should expose a review email field for pilot link generation");
  assert(builderHtml.includes("data-builder-review-url-input"), "builder should expose a review form field for pilot link generation");
  assert(builderHtml.includes("data-builder-pilot-link-status"), "builder should show pilot link copy feedback");
  assert(builderHtml.includes("data-builder-review-actions"), "builder should group staff submission actions near submission info");
  assert(builderHtml.includes("data-builder-review-email-status"), "builder should show whether submission emails are pre-addressed");
  assert(builderHtml.includes("data-builder-submission-status"), "builder should show submission validation feedback near review actions");
  assert(builderHtml.includes('data-builder-field="cta_href"'), "builder should expose a direct CTA URL field");
  assert(builderHtml.includes("Send for review"), "builder should label the staff submission action group");
  assert(builderHtml.includes("Preferred: Open review form"), "builder should make the form-based staff review path explicit");
  assert(builderHtml.includes("If no form is set, open an email draft"), "builder should tell staff how to fall back when no form is configured");
  assert(builderHtml.includes("passes only short chapter context in the form link"), "builder should explain that review form links use short context only");
  assert(builderHtml.includes("Download submission if browser copy or paste is awkward"), "builder should give staff a clear file-attachment fallback");
  assert(builderHtml.includes("For pilot staff, use Open review form when a review form is configured"), "builder export help should align with the form-first staff handoff");
  assert(builderHtml.includes("data-review-email"), "builder should allow a configurable submission review email address");
  assert(builderJs.includes("review_email"), "builder should allow review email to be set from a staff distribution URL");
  assert(builderJs.includes("reviewEmail"), "builder should allow camelCase review email links");
  assert(builderHtml.includes("data-builder-submitter-name"), "builder should collect submitter name for staff submissions");
  assert(builderHtml.includes("data-builder-submitter-email"), "builder should collect submitter email for staff submissions");
  assert(builderHtml.includes("data-builder-submitter-note"), "builder should collect reviewer notes for staff submissions");
  assert(builderHtml.includes("data-builder-submitter-name required"), "builder should require submitter name before staff submission actions");
  assert(builderHtml.includes('data-builder-submitter-email type="email" required'), "builder should require a valid submitter email before staff submission actions");
  assert(builderJs.includes("function buildSubmissionPayload"), "builder should build a scoped staff submission payload");
  assert(builderJs.includes("function submissionMeta"), "builder should read submitter metadata into submissions");
  assert(builderJs.includes("function setSubmissionStatus"), "builder should keep submission feedback near the review actions");
  assert(builderJs.includes("function submitterContactError"), "builder should validate submitter contact info before handoff");
  assert(builderJs.includes("Add your name and email before sending this for review."), "builder should explain missing submitter contact info");
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
  assert(builderJs.includes("function buildPilotBuilderUrl"), "builder should build a shareable pilot staff builder link");
  assert(builderJs.includes("function copyPilotBuilderLink"), "builder should copy the shareable pilot staff builder link");
  assert(builderJs.includes("copy-pilot-link"), "builder should wire the pilot staff link copy action");
  assert(builderJs.includes("searchParamValue([\"chapter\", \"chapter_slug\", \"chapterSlug\"])"), "builder should preserve the selected chapter in pilot staff links");
  assert(builderJs.includes("MAX_MAILTO_URL_LENGTH"), "builder should avoid overlong mailto links for submission JSON");
  assert(builderJs.includes("Email draft opened with the submission JSON included"), "builder should include small submission JSON packets in email drafts");
  assert(builderJs.includes("submission JSON included"), "builder should report when the email handoff already includes the JSON");
  assert(builderJs.includes("function reviewFormUrl"), "builder should read an optional staff review form URL");
  assert(builderJs.includes("function safeReviewFormUrl"), "builder should validate optional review form URLs before opening them");
  assert(builderJs.includes("Unsafe review form URL"), "builder should clearly warn about unsafe review form URLs");
  assert(builderJs.includes("function formSubmission"), "builder should copy JSON and open an optional review form");
  assert(builderJs.includes("review_url"), "builder should support a review_url query parameter for form-based submissions");
  assert(builderJs.includes("data-review-url"), "builder should support a data-review-url fallback for form-based submissions");
  assert(!builderJs.includes("MAX_REVIEW_FORM_URL_LENGTH"), "builder should not rely on URL length checks for full JSON review form prefill");
  assert(!builderJs.includes("REVIEW_FORM_SUBMISSION_PARAM"), "builder should not append full submission JSON to review form URLs");
  assert(!builderJs.includes("searchParams.set(\"wrapped_submission\""), "builder should keep full submission JSON out of review form query strings");
  assert(builderJs.includes("Review form opened with chapter context. Submission JSON copied"), "builder should tell staff to paste copied JSON into the review form");
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
  assert(readme.includes("Review form URLs must use"), "README should document safe review form URL requirements");
  assert(readme.includes("passes only short context fields"), "README should document that review form URLs carry only short context");
  assert(readme.includes("Click **Open review form** when a review form link is provided"), "README should document the form-first staff handoff");
  assert(readme.includes("Use **Open email draft** as the fallback"), "README should document the email fallback after the form path");
  assert(readme.includes("Copy staff link"), "README should document the pilot staff link helper");
  assert(playbook.includes("review_email"), "staff playbook should document pre-addressed staff review links");
  assert(playbook.includes("review_url"), "staff playbook should document optional staff review form links");
  assert(playbook.includes("Do not rely on the builder to put the full submission JSON in the URL"), "staff playbook should document the long JSON URL limit");
  assert(playbook.includes("Use **Open review form** as the primary return path when `review_url` is configured"), "staff playbook should document the form-first staff handoff");
  assert(playbook.includes("Use **Open email draft** as the fallback"), "staff playbook should document the email fallback after the form path");
  assert(playbook.includes("Copy staff link"), "staff playbook should document the pilot staff link helper");
}

function runBuilderPilotLinkUrlSmoke() {
  const tools = loadBuilderTools("https://example.org/wrapped/builder.html?reviewEmail=old@example.org&review_form=javascript%3Aalert(1)&chapter=old&deploy=old&retry=1&qa=debug");

  assert(tools && typeof tools.buildPilotBuilderUrlFromContext === "function", "builder should expose a pure pilot-link URL helper for smoke tests");

  const url = new URL(tools.buildPilotBuilderUrlFromContext(
    "https://example.org/wrapped/builder.html?reviewEmail=old@example.org&reviewUrl=https%3A%2F%2Fold.example%2Fform&review_form=javascript%3Aalert(1)&chapter=old&deploy=old&retry=1&qa=debug",
    {
      chapterSlug: "baltimore",
      regionSlug: "atlantic-seaboard",
      reviewEmail: "wrapped-review@example.org",
      reviewUrl: "https://ncsy.org/wrapped-review/",
      scope: "region",
      variantSlug: "donor-recap"
    }
  ));

  assert(url.searchParams.get("chapter") === "baltimore", "pilot staff link should preserve selected chapter");
  assert(url.searchParams.get("region") === "atlantic-seaboard", "pilot staff link should preserve selected region");
  assert(url.searchParams.get("scope") === "region", "pilot staff link should preserve non-default edit scope");
  assert(url.searchParams.get("variant") === "donor-recap", "pilot staff link should preserve selected variant");
  assert(url.searchParams.get("review_email") === "wrapped-review@example.org", "pilot staff link should use canonical review_email");
  assert(url.searchParams.get("review_url") === "https://ncsy.org/wrapped-review/", "pilot staff link should use canonical review_url");
  ["reviewEmail", "reviewUrl", "review_form", "reviewForm", "deploy", "retry", "qa"].forEach((key) => {
    assert(!url.searchParams.has(key), `pilot staff link should remove stale ${key} params`);
  });

  const defaultScopeUrl = new URL(tools.buildPilotBuilderUrlFromContext(
    "https://example.org/wrapped/builder.html?scope=region&variant=donor-recap&review_url=https%3A%2F%2Fold.example%2F",
    {
      chapterSlug: "baltimore",
      regionSlug: "atlantic-seaboard",
      reviewEmail: "",
      reviewUrl: "javascript:alert(1)",
      scope: "chapter",
      variantSlug: ""
    }
  ));

  assert(!defaultScopeUrl.searchParams.has("scope"), "pilot staff link should omit default chapter scope");
  assert(!defaultScopeUrl.searchParams.has("variant"), "pilot staff link should remove stale variants when no variant is selected");
  assert(!defaultScopeUrl.searchParams.has("review_email"), "pilot staff link should remove review email when none is set");
  assert(!defaultScopeUrl.searchParams.has("review_url"), "pilot staff link should remove unsafe review form URLs");
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
  const formWrappedSubmissionPath = path.join(tempDir, "gravity-form-entry.json");
  const formExportPath = path.join(tempDir, "gravity-export.json");

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
  fs.writeFileSync(formWrappedSubmissionPath, JSON.stringify({
    id: "entry-42",
    form_id: "wrapped-review",
    wrapped_scope: "chapter",
    wrapped_slug: "baltimore",
    wrapped_submission: fs.readFileSync(submissionPath, "utf8")
  }, null, 2));
  fs.writeFileSync(formExportPath, JSON.stringify([
    {
      entry_id: "41",
      wrapped_submission: fs.readFileSync(submissionPath, "utf8")
    },
    {
      entry_id: "42",
      wrapped_submission: JSON.stringify({
        schema: "jsu-wrapped-builder-submission",
        version: 1,
        scope_type: "chapter",
        scope_slug: "baltimore",
        scope_label: "Baltimore",
        submitter_name: "Miriam Katz",
        submitter_email: "miriam@example.org",
        change_summary: [
          {
            type: "setting",
            label: "palette",
            value: "sunset"
          }
        ],
        merge_path: ["chapters", "baltimore"],
        config_patch: {
          palette: "sunset"
        }
      }, null, 2)
    }
  ], null, 2));

  assert(script.includes("jsu-wrapped-builder-submission"), "merge script should validate the submission schema");
  assert(script.includes("merge_path"), "merge script should apply patches at the submitted merge path");
  assert(script.includes("function normalizeSubmission"), "merge script should normalize direct and form-wrapped staff submissions");
  assert(script.includes("wrapped_submission"), "merge script should accept Gravity Forms entries with wrapped_submission JSON");
  assert(script.includes("--entry"), "merge script should let operators select one entry from a JSON array export");

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

  const formWrappedDryRunOutput = childProcess.execFileSync(process.execPath, ["merge-builder-submission.js", formWrappedSubmissionPath, configPath, "--dry-run"], {
    cwd: __dirname,
    encoding: "utf8",
    stdio: "pipe"
  });

  assert(formWrappedDryRunOutput.includes("Submission is valid for chapter / baltimore / donor"), "merge dry run should accept Gravity Forms entries with wrapped_submission JSON");

  const formExportDryRunOutput = childProcess.execFileSync(process.execPath, ["merge-builder-submission.js", formExportPath, configPath, "--entry", "2", "--dry-run"], {
    cwd: __dirname,
    encoding: "utf8",
    stdio: "pipe"
  });

  assert(formExportDryRunOutput.includes("Submission is valid for chapter / baltimore."), "merge dry run should accept a selected JSON array export entry");
  assert(formExportDryRunOutput.includes("Submitter: Miriam Katz <miriam@example.org>"), "selected JSON array entry should drive the dry-run review output");

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
    submitter_name: "Leah Rosen",
    submitter_email: "leah@example.org",
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
    submitter_name: "Leah Rosen",
    submitter_email: "leah@example.org",
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
    submitter_name: "Leah Rosen",
    submitter_email: "leah@example.org",
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

  const missingContactConfigPath = path.join(tempDir, "missing-contact-config.json");
  const missingContactSubmissionPath = path.join(tempDir, "missing-contact-submission.json");

  fs.writeFileSync(missingContactConfigPath, JSON.stringify({
    version: 1,
    year: "2026",
    defaults: {},
    regions: {},
    programs: {},
    chapters: {
      baltimore: {}
    }
  }, null, 2));
  fs.writeFileSync(missingContactSubmissionPath, JSON.stringify({
    schema: "jsu-wrapped-builder-submission",
    version: 1,
    merge_path: ["chapters", "baltimore"],
    config_patch: {
      palette: "sunset"
    }
  }, null, 2));

  let missingContactOutput = "";
  try {
    childProcess.execFileSync(process.execPath, ["merge-builder-submission.js", missingContactSubmissionPath, missingContactConfigPath, "--dry-run"], {
      cwd: __dirname,
      encoding: "utf8",
      stdio: "pipe"
    });
  } catch (error) {
    missingContactOutput = String(error.stderr || error.stdout || error.message || "");
  }

  assert(missingContactOutput.includes("submitter name and email"), "staff submissions without contact info should fail clearly");
}

function runBuilderSubmissionBatchReviewSmoke() {
  const scriptPath = "review-builder-submissions.js";
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jsuw-review-"));
  const submissionsDir = path.join(tempDir, "staff-submissions");
  const configPath = path.join(tempDir, "wrapped-config-2026.json");
  const validSubmissionPath = path.join(submissionsDir, "valid-builder-submission.json");
  const formWrappedSubmissionPath = path.join(submissionsDir, "gravity-form-entry.json");
  const formExportPath = path.join(submissionsDir, "gravity-export.json");
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
  fs.writeFileSync(formWrappedSubmissionPath, JSON.stringify({
    entry_id: "43",
    wrapped_submission: fs.readFileSync(validSubmissionPath, "utf8")
  }, null, 2));
  fs.writeFileSync(formExportPath, JSON.stringify([
    {
      entry_id: "44",
      wrapped_submission: fs.readFileSync(validSubmissionPath, "utf8")
    },
    {
      entry_id: "45",
      wrapped_submission: JSON.stringify({
        schema: "jsu-wrapped-builder-submission",
        version: 1,
        scope_type: "chapter",
        scope_slug: "baltimore",
        submitter_name: "Leah Rosen",
        submitter_email: "leah@example.org",
        merge_path: ["chapters", "baltimore"],
        config_patch: {}
      }, null, 2)
    }
  ], null, 2));
  fs.writeFileSync(invalidSubmissionPath, JSON.stringify({
    schema: "jsu-wrapped-builder-submission",
    version: 1,
    scope_type: "chapter",
    scope_slug: "baltimore",
    submitter_name: "Leah Rosen",
    submitter_email: "leah@example.org",
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
  assert(batchOutput.includes("Reviewing 5 staff submission JSON entries"), "batch review should report how many submission entries it checked");
  assert(batchOutput.includes("[OK] valid-builder-submission.json"), "batch review should mark valid staff submissions");
  assert(batchOutput.includes("Dry run: node merge-builder-submission.js"), "batch review should print a ready-to-run dry-run merge command");
  assert(batchOutput.includes("valid-builder-submission.json\" \""), "batch review dry-run command should include direct submission file names");
  assert(batchOutput.includes("[OK] gravity-form-entry.json"), "batch review should accept Gravity Forms entries with wrapped_submission JSON");
  assert(batchOutput.includes("[OK] gravity-export.json[1]"), "batch review should accept valid submissions inside JSON array exports");
  assert(batchOutput.includes("gravity-export.json\" \"") && batchOutput.includes("--entry 1 --dry-run"), "batch review dry-run command should include --entry for JSON array exports");
  assert(batchOutput.includes("[INVALID] gravity-export.json[2]"), "batch review should mark invalid submissions inside JSON array exports");
  assert(batchOutput.includes("Submitter: Leah Rosen <leah@example.org>"), "batch review should show submitter details");
  assert(batchOutput.includes("- palette: electric"), "batch review should summarize submitted changes");
  assert(batchOutput.includes("[INVALID] invalid-builder-submission.json"), "batch review should mark invalid staff submissions");
  assert(batchOutput.includes("Submission config_patch has no changes"), "batch review should show validation errors");
  assert(batchOutput.includes("Summary: 3 valid, 2 invalid"), "batch review should summarize valid and invalid counts");

  const noFilesOutput = childProcess.execFileSync(process.execPath, [scriptPath, path.join(tempDir, "empty-submissions"), configPath], {
    cwd: __dirname,
    encoding: "utf8",
    stdio: "pipe"
  });

  assert(noFilesOutput.includes("No staff submission JSON files found"), "batch review should handle missing submission folders cleanly");

  const readme = loadText("README.md");
  const playbook = loadText("docs/staff-playbook.md");
  const productionDocs = loadText("docs/production-readiness.md");

  assert(readme.includes("Gravity Forms-style entry JSON object containing the builder packet in `wrapped_submission`"), "README should document Gravity Forms entry review support");
  assert(readme.includes("--entry 2"), "README should document merging a specific JSON array export entry");
  assert(readme.includes("Dry run:"), "README should document printed dry-run command hints");
  assert(playbook.includes("Gravity Forms entry JSON with the builder packet stored in `wrapped_submission`"), "staff playbook should document Gravity Forms entry review support");
  assert(playbook.includes("--entry 2"), "staff playbook should document merging a specific JSON array export entry");
  assert(playbook.includes("Dry run:"), "staff playbook should document printed dry-run command hints");
  assert(productionDocs.includes("Gravity Forms entry JSON with the builder packet stored in `wrapped_submission`"), "production docs should document Gravity Forms entry review support");
  assert(productionDocs.includes("single exported JSON array of entries"), "production docs should document array export review support");
  assert(productionDocs.includes("--entry 2"), "production docs should document merging a specific JSON array export entry");
  assert(productionDocs.includes("Dry run:"), "production docs should document printed dry-run command hints");
}

function runFallbackSvgSmoke(records, config) {
  const slugs = ["philadelphia", "baltimore", "greater-washington"];

  function svgYPositions(svg, pattern) {
    return Array.from(svg.matchAll(pattern)).map((match) => Number(match[1]));
  }

  function assertFallbackPosterSpacing(svg, label) {
    const copyYs = svgYPositions(svg, /class="poster-copy" x="92" y="([0-9.]+)"/g);
    const statYs = svgYPositions(svg, /<g transform="translate\(92 ([0-9.]+)\)">/g);
    const ctaYs = svgYPositions(svg, /class="poster-cta" transform="translate\(92 ([0-9.]+)\)"/g);
    const footerYs = svgYPositions(svg, /<rect x="92" y="([0-9.]+)" width="896" height="72"/g);
    const lastCopyBottom = copyYs.length ? Math.max(...copyYs) + 48 : 0;
    const lastStatBottom = statYs.length ? Math.max(...statYs) + 88 : 0;
    const firstStatTop = statYs.length ? Math.min(...statYs) : Infinity;
    const firstCtaTop = ctaYs.length ? Math.min(...ctaYs) : Infinity;
    const firstFooterTop = footerYs.length ? Math.min(...footerYs) : Infinity;

    assert(firstStatTop >= lastCopyBottom + 24, `${label} fallback SVG stats overlap summary copy`);
    assert(firstCtaTop === Infinity || firstCtaTop >= lastStatBottom + 24, `${label} fallback SVG CTA overlaps stat rows`);
    assert(firstFooterTop >= (firstCtaTop === Infinity ? lastStatBottom + 24 : firstCtaTop + 98), `${label} fallback SVG footer overlaps prior content`);
  }

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
    assertFallbackPosterSpacing(svg, slug);
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
  assertFallbackPosterSpacing(svg, "long");
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
  const files = ["index.html", "embed-example.html", "builder.html", "cta-prefill-smoke.html", "cta-link-smoke.html", "analytics-smoke.html", "layout-smoke.html"];
  const releaseToken = "jsuw-prod-20260602a";
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
  assert(docs.includes("cta-prefill-smoke.html"), "production docs should include CTA smoke page in the shared cache token bump list");
  assert(docs.includes("cta-link-smoke.html"), "production docs should include CTA link smoke page in the shared cache token bump list");
  assert(docs.includes("analytics-smoke.html"), "production docs should include analytics smoke page in the shared cache token bump list");
  assert(docs.includes("layout-smoke.html"), "production docs should include layout smoke page in the shared cache token bump list");
  assert(docs.includes("wordpress-smoke.js"), "production docs should include the WordPress smoke validator in the shared cache token bump list");
}

function runCacheTokenBumpSmoke() {
  const scriptPath = "bump-cache-token.js";
  const readme = loadText("README.md");
  const docs = loadText("docs/production-readiness.md");
  const listed = childProcess.execFileSync(process.execPath, ["check-production.js", "--list"], { encoding: "utf8" });

  assert(fs.existsSync(scriptPath), "cache-token bump helper is missing");

  const bump = require("./bump-cache-token.js");
  const sample = "one?v=jsuw-prod-20260602a two?v=jsuw-prod-20260602a placeholder=jsuw-prod-YYYYMMDDx";
  const result = bump.replaceCacheTokenInText(sample, "jsuw-prod-20260602a");

  assert(result.count === 2, `cache-token helper replaced ${result.count} tokens instead of 2`);
  assert(result.text === "one?v=jsuw-prod-20260602a two?v=jsuw-prod-20260602a placeholder=jsuw-prod-YYYYMMDDx", "cache-token helper did not replace every real token");
  assert(bump.validateToken("jsuw-prod-20260602a") === "jsuw-prod-20260602a", "cache-token helper should accept production token format");
  assert(bump.FILES.includes("cta-prefill-smoke.html"), "cache-token helper should update the CTA prefill smoke page");
  assert(bump.FILES.includes("cta-link-smoke.html"), "cache-token helper should update the CTA link smoke page");
  assert(bump.FILES.includes("analytics-smoke.html"), "cache-token helper should update the analytics smoke page");
  assert(bump.FILES.includes("layout-smoke.html"), "cache-token helper should update the layout smoke page");
  assert(bump.FILES.includes("wordpress-smoke.js"), "cache-token helper should update the WordPress smoke validator");
  assert(bump.FILES.includes("docs/wordpress-launch-packet.md"), "cache-token helper should update the checked-in WordPress launch packet");

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

function cssAtRuleBody(css, atRule) {
  const start = css.indexOf(atRule);

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
  const mobileBody = cssAtRuleBody(css, "@media (max-width: 600px)");

  assert(/#jsu-wrapped\s*\{/.test(css), "widget root CSS block is missing");
  assert(css.includes("overflow-x: hidden;"), "widget root should clip horizontal overflow inside the scoped container");
  assert(css.includes("@media (max-width: 600px)"), "mobile fullscreen media query is missing");
  assert(/#jsu-wrapped \.jsuw-shell\s*\{[^}]*max-width:\s*100%;/.test(css), "mobile shell should fill the available embed width");
  assert(/#jsu-wrapped \.jsuw-story\s*\{[^}]*aspect-ratio:\s*auto;/.test(css), "mobile story should not be constrained to desktop aspect sizing");
  assert(css.includes("height: calc(100svh - 16px);"), "mobile story should use small-viewport height for fullscreen feel");
  assert(/#jsu-wrapped \.jsuw-card-count\s*\{[^}]*display:\s*none;/.test(mobileBody), "mobile story chrome should hide the count to avoid clipped sound/autoplay controls");
  assert(/#jsu-wrapped \.jsuw-nav-button--next\s*\{[^}]*min-width:\s*88px;/.test(mobileBody), "mobile story chrome should shrink the Next button to avoid clipped controls");
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
    "node check-production.js",
    "node render-smoke.js --browser"
  ];

  requiredCommands.forEach((command) => {
    assert(workflow.includes(command), `GitHub Actions QA workflow missing ${command}`);
  });

  assert(workflow.includes("pull_request"), "GitHub Actions QA workflow should run on pull requests");
  assert(workflow.includes("push"), "GitHub Actions QA workflow should run on push");
  assert(workflow.includes("Resolve Chrome for render smoke"), "GitHub Actions QA workflow should resolve runner Chrome for enforced render smoke");
  assert(workflow.includes("google-chrome google-chrome-stable chromium chromium-browser"), "GitHub Actions render smoke should prefer runner system browser candidates instead of Chrome for Testing");
  assert(workflow.includes('command -v "$candidate"'), "GitHub Actions render smoke should resolve the selected runner browser path");
  assert(workflow.includes("steps.chrome.outputs.chrome-path"), "GitHub Actions QA workflow should pass the resolved Chrome path to render smoke");
  assert(!workflow.includes("browser-actions/setup-chrome"), "GitHub Actions render smoke should not use setup-chrome Chrome for Testing");
  assert(workflow.includes("--timeout-ms 60000"), "GitHub Actions render smoke should allow enough time for DOM rendering");
  assert(workflow.includes("JSUW_SKIP_OPTIONAL_RENDER_SMOKE"), "GitHub Actions should skip the optional pre-Chrome render smoke inside check-production");
  assert(!workflow.includes("node render-smoke.js --skip-if-missing"), "GitHub Actions render smoke should fail instead of skipping when Chrome cannot render");
  assert(docs.includes("GitHub Actions"), "production docs missing GitHub Actions QA note");
  assert(docs.includes("non-skipping headless render smoke"), "production docs should document the enforced CI render smoke");
}

function runProductionCheckSmoke() {
  const scriptPath = "check-production.js";
  const workflow = loadText(".github/workflows/qa.yml");
  const docs = loadText("docs/production-readiness.md");
  const defaultListEnv = Object.assign({}, process.env);

  delete defaultListEnv.JSUW_SKIP_OPTIONAL_RENDER_SMOKE;

  assert(fs.existsSync(scriptPath), "single production QA command is missing");
  const listed = childProcess.execFileSync(process.execPath, [scriptPath, "--list"], {
    encoding: "utf8",
    env: defaultListEnv
  });
  const ciListed = childProcess.execFileSync(process.execPath, [scriptPath, "--list"], {
    encoding: "utf8",
    env: Object.assign({}, process.env, { JSUW_SKIP_OPTIONAL_RENDER_SMOKE: "1" })
  });
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
    "node --check render-smoke.js",
    "node --check bump-cache-token.js",
    "node --check qa-smoke.js",
    "node validate-wrapped-data.js",
    "node qa-smoke.js",
    "node render-smoke.js --skip-if-missing",
    "git diff --exit-code wordpress-inline-embed.html",
    "git diff --exit-code share",
    "git status --porcelain -- share",
    "git diff --check"
  ];

  requiredCommands.forEach((command) => {
    assert(listed.includes(command), `production QA command missing ${command}`);
  });

  assert(listed.indexOf("node validate-wrapped-data.js") < listed.indexOf("node generate-share-pages.js"), "production QA should validate data before generating share pages");
  assert(!ciListed.includes("node render-smoke.js --skip-if-missing"), "CI production QA should skip the optional render smoke before the enforced Chrome step");
  assert(workflow.includes("node check-production.js"), "GitHub Actions should run the single production QA command");
  assert(docs.includes("node check-production.js"), "production docs should point to the single production QA command");
}

function runHostedSmokeScriptSmoke() {
  const scriptPath = "hosted-smoke.js";

  assert(fs.existsSync(scriptPath), "hosted GitHub Pages smoke script is missing");

  const hostedSmoke = require("./hosted-smoke.js");
  const socialPreviewPng = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(socialPreviewPng, 0);
  socialPreviewPng.write("IHDR", 12, "ascii");
  socialPreviewPng.writeUInt32BE(1200, 16);
  socialPreviewPng.writeUInt32BE(630, 20);
  const socialImageUrl = "https://stsimon-ncsy.github.io/jsu-wrapped-widget/assets/wrapped-social-preview.png";
  const baltimoreShareDescription = "Baltimore Wrapped for 2025-2026 - Atlantic Seaboard. 338 events. 533 teens. 2,232 engagement moments.";
  const baltimoreStoryUrl = "https://stsimon-ncsy.github.io/jsu-wrapped-widget/?chapter=baltimore";
  const goodAssets = {
    "": {
      status: 200,
      text: '<div id="jsu-wrapped" data-share-base="./share/"></div><script src="./jsu-wrapped.js?v=jsuw-prod-20260602a"></script>'
    },
    "builder.html": {
      status: 200,
      text: '<meta name="robots" content="noindex,nofollow"><div id="wrapped-builder"></div>'
    },
    "cta-prefill-smoke.html": {
      status: 200,
      text: '<meta name="robots" content="noindex,nofollow"><title>CTA prefill smoke</title><p>Gravity Forms style fields</p>'
    },
    "cta-link-smoke.html": {
      status: 200,
      text: '<meta name="robots" content="noindex,nofollow"><title>CTA link smoke</title><a href="./cta-link-target-smoke.html">target</a>'
    },
    "cta-link-target-smoke.html": {
      status: 200,
      text: '<meta name="robots" content="noindex,nofollow"><title>CTA link target smoke</title><p>Gravity Forms link params</p>'
    },
    "analytics-smoke.html": {
      status: 200,
      text: '<meta name="robots" content="noindex,nofollow"><title>Analytics smoke</title><p>dataLayer events</p><script>window.__jsuwAnalyticsSmokeEvents = [];</script>'
    },
    "layout-smoke.html": {
      status: 200,
      text: '<meta name="robots" content="noindex,nofollow"><title>Layout smoke</title><p>mobile story layout</p><script>window.__jsuwLayoutSmoke = true;</script>'
    },
    "jsu-wrapped.css": {
      status: 200,
      text: "#jsu-wrapped { color: #fff; }"
    },
    "jsu-wrapped.js": {
      status: 200,
      text: "window.JSUWrapped = {};"
    },
    "wrapped-builder.js": {
      status: 200,
      text: "Review form opened with chapter context. Submission JSON copied; paste it into the form before sending."
    },
    "wordpress-inline-embed.html": {
      status: 200,
      text: '<div id="jsu-wrapped" data-source="https://stsimon-ncsy.github.io/jsu-wrapped-widget/sample-wrapped-2026.json?v=jsuw-prod-20260602a"></div><style>#jsu-wrapped { color: #fff; }</style><script>(function (root, factory) { window.JSUWrapped = {}; })();</script>'
    },
    "sample-wrapped-2026.json": {
      headers: {
        "access-control-allow-origin": "*"
      },
      status: 200,
      text: JSON.stringify([{ chapter_slug: "baltimore", chapter_name: "Baltimore" }])
    },
    "sample-teen-wrapped-2026.json": {
      headers: {
        "access-control-allow-origin": "*"
      },
      status: 200,
      text: JSON.stringify([{ teen_slug: "maya-test", teen_name: "Maya" }])
    },
    "wrapped-config-2026.json": {
      headers: {
        "access-control-allow-origin": "*"
      },
      status: 200,
      text: JSON.stringify({ version: 1, year: "2026" })
    },
    "assets/wrapped-social-preview.png": {
      buffer: socialPreviewPng,
      headers: {
        "content-type": "image/png"
      },
      status: 200
    },
    "share/baltimore/": {
      status: 200,
      text: [
        "<title>JSU/NCSY Wrapped - Baltimore</title>",
        'property="og:title" content="JSU/NCSY Wrapped - Baltimore"',
        'property="og:description" content="' + baltimoreShareDescription + '"',
        'name="twitter:description" content="' + baltimoreShareDescription + '"',
        'property="og:url" content="https://stsimon-ncsy.github.io/jsu-wrapped-widget/share/baltimore/"',
        'property="og:image" content="' + socialImageUrl + '"',
        'property="og:image:alt" content="JSU/NCSY Wrapped social preview for Baltimore"',
        'property="og:image:width" content="1200"',
        'property="og:image:height" content="630"',
        'name="twitter:card" content="summary_large_image"',
        'name="twitter:image" content="' + socialImageUrl + '"',
        'name="twitter:image:alt" content="JSU/NCSY Wrapped social preview for Baltimore"',
        'rel="canonical" href="' + baltimoreStoryUrl + '"',
        'http-equiv="refresh"',
        "?chapter=baltimore"
      ].join("")
    }
  };
  const goodReport = hostedSmoke.validateHostedAssets(goodAssets, { requireCors: true, corsOrigin: "https://ncsy.org" });
  const badAssets = Object.assign({}, goodAssets, {
    "share/baltimore/": {
      status: 200,
      text: "<title>Broken</title>"
    }
  });
  const thinShareMetadataAssets = Object.assign({}, goodAssets, {
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
  });
  const missingSocialPreviewAssets = Object.assign({}, goodAssets);
  delete missingSocialPreviewAssets["assets/wrapped-social-preview.png"];
  const wrongSocialPreviewTypeAssets = Object.assign({}, goodAssets, {
    "assets/wrapped-social-preview.png": {
      buffer: socialPreviewPng,
      headers: {
        "content-type": "text/plain"
      },
      status: 200
    }
  });
  const publicCtaPrefillSmokeAssets = Object.assign({}, goodAssets, {
    "cta-prefill-smoke.html": {
      status: 200,
      text: "<title>CTA prefill smoke</title><p>Gravity Forms style fields</p>"
    }
  });
  const publicCtaLinkSmokeAssets = Object.assign({}, goodAssets, {
    "cta-link-smoke.html": {
      status: 200,
      text: '<title>CTA link smoke</title><a href="./cta-link-target-smoke.html">target</a>'
    }
  });
  const publicAnalyticsSmokeAssets = Object.assign({}, goodAssets, {
    "analytics-smoke.html": {
      status: 200,
      text: '<title>Analytics smoke</title><p>dataLayer events</p><script>window.__jsuwAnalyticsSmokeEvents = [];</script>'
    }
  });
  const publicLayoutSmokeAssets = Object.assign({}, goodAssets, {
    "layout-smoke.html": {
      status: 200,
      text: '<title>Layout smoke</title><p>mobile story layout</p><script>window.__jsuwLayoutSmoke = true;</script>'
    }
  });
  const privateTeenJsonAssets = Object.assign({}, goodAssets, {
    "sample-teen-wrapped-2026.json": {
      status: 200,
      text: JSON.stringify([{ teen_slug: "maya-test", teen_name: "Maya", teen_id: "123", email: "maya@example.org" }])
    }
  });
  const externalWordPressInlineAssets = Object.assign({}, goodAssets, {
    "wordpress-inline-embed.html": {
      status: 200,
      text: '<div id="jsu-wrapped"></div><link rel="stylesheet" href="./jsu-wrapped.css"><script src="./jsu-wrapped.js"></script>'
    }
  });
  const staleBuilderScriptAssets = Object.assign({}, goodAssets, {
    "wrapped-builder.js": {
      status: 200,
      text: "MAX_REVIEW_FORM_URL_LENGTH Submission JSON is prefilled in the review form"
    }
  });
  const missingCorsAssets = Object.assign({}, goodAssets, {
    "sample-wrapped-2026.json": {
      status: 200,
      text: JSON.stringify([{ chapter_slug: "baltimore", chapter_name: "Baltimore" }])
    }
  });
  const badReport = hostedSmoke.validateHostedAssets(badAssets);
  const thinShareMetadataReport = hostedSmoke.validateHostedAssets(thinShareMetadataAssets);
  const missingSocialPreviewReport = hostedSmoke.validateHostedAssets(missingSocialPreviewAssets);
  const wrongSocialPreviewTypeReport = hostedSmoke.validateHostedAssets(wrongSocialPreviewTypeAssets);
  const publicCtaPrefillSmokeReport = hostedSmoke.validateHostedAssets(publicCtaPrefillSmokeAssets);
  const publicCtaLinkSmokeReport = hostedSmoke.validateHostedAssets(publicCtaLinkSmokeAssets);
  const publicAnalyticsSmokeReport = hostedSmoke.validateHostedAssets(publicAnalyticsSmokeAssets);
  const publicLayoutSmokeReport = hostedSmoke.validateHostedAssets(publicLayoutSmokeAssets);
  const privateTeenJsonReport = hostedSmoke.validateHostedAssets(privateTeenJsonAssets);
  const externalWordPressInlineReport = hostedSmoke.validateHostedAssets(externalWordPressInlineAssets);
  const staleBuilderScriptReport = hostedSmoke.validateHostedAssets(staleBuilderScriptAssets);
  const missingCorsReport = hostedSmoke.validateHostedAssets(missingCorsAssets, { requireCors: true, corsOrigin: "https://ncsy.org" });
  const dryRunOutput = childProcess.execFileSync(process.execPath, [scriptPath, "--base", "https://example.org/wrapped", "--dry-run"], {
    cwd: __dirname,
    encoding: "utf8",
    stdio: "pipe"
  });
  const helpOutput = childProcess.execFileSync(process.execPath, [scriptPath, "--help"], {
    cwd: __dirname,
    encoding: "utf8",
    stdio: "pipe"
  });
  const listed = childProcess.execFileSync(process.execPath, ["check-production.js", "--list"], { encoding: "utf8" });
  const readme = loadText("README.md");
  const docs = loadText("docs/production-readiness.md");

  assert(goodReport.ok, `hosted smoke validator rejected good assets: ${goodReport.errors.join("; ")}`);
  assert(!badReport.ok && badReport.errors.some((error) => error.includes("Baltimore share page")), "hosted smoke validator should reject broken share metadata");
  assert(!thinShareMetadataReport.ok && thinShareMetadataReport.errors.some((error) => error.includes("Baltimore share page") && error.includes("description")), "hosted smoke validator should reject share pages without social descriptions");
  assert(!thinShareMetadataReport.ok && thinShareMetadataReport.errors.some((error) => error.includes("Baltimore share page") && error.includes("Twitter image alt")), "hosted smoke validator should reject share pages without Twitter image alt text");
  assert(!thinShareMetadataReport.ok && thinShareMetadataReport.errors.some((error) => error.includes("Baltimore share page") && error.includes("canonical")), "hosted smoke validator should reject share pages without canonical story URLs");
  assert(!missingSocialPreviewReport.ok && missingSocialPreviewReport.errors.some((error) => error.includes("social preview image")), "hosted smoke validator should reject a missing social preview image");
  assert(!wrongSocialPreviewTypeReport.ok && wrongSocialPreviewTypeReport.errors.some((error) => error.includes("content type")), "hosted smoke validator should reject the wrong social preview image content type");
  assert(!publicCtaPrefillSmokeReport.ok && publicCtaPrefillSmokeReport.errors.some((error) => error.includes("CTA form prefill page")), "hosted smoke validator should reject a CTA form prefill smoke page without noindex");
  assert(!publicCtaLinkSmokeReport.ok && publicCtaLinkSmokeReport.errors.some((error) => error.includes("CTA link prefill page")), "hosted smoke validator should reject a CTA link smoke page without noindex");
  assert(!publicAnalyticsSmokeReport.ok && publicAnalyticsSmokeReport.errors.some((error) => error.includes("analytics smoke page")), "hosted smoke validator should reject an analytics smoke page without noindex");
  assert(!publicLayoutSmokeReport.ok && publicLayoutSmokeReport.errors.some((error) => error.includes("layout smoke page")), "hosted smoke validator should reject a layout smoke page without noindex");
  assert(!privateTeenJsonReport.ok && privateTeenJsonReport.errors.some((error) => error.includes("teen data JSON")), "hosted smoke validator should reject teen JSON with private contact fields");
  assert(!externalWordPressInlineReport.ok && externalWordPressInlineReport.errors.some((error) => error.includes("WordPress inline embed")), "hosted smoke validator should reject WordPress inline handoff with external widget scripts");
  assert(!staleBuilderScriptReport.ok && staleBuilderScriptReport.errors.some((error) => error.includes("builder script")), "hosted smoke validator should reject stale builder script handoff behavior");
  assert(!missingCorsReport.ok && missingCorsReport.errors.some((error) => error.includes("Access-Control-Allow-Origin")), "hosted smoke validator should reject cross-origin JSON without CORS headers");
  assert(dryRunOutput.includes("https://example.org/wrapped/"), "hosted smoke dry run should list normalized base URL");
  assert(dryRunOutput.includes("https://example.org/wrapped/cta-prefill-smoke.html"), "hosted smoke dry run should list CTA form prefill smoke page");
  assert(dryRunOutput.includes("https://example.org/wrapped/cta-link-smoke.html"), "hosted smoke dry run should list CTA link smoke page");
  assert(dryRunOutput.includes("https://example.org/wrapped/cta-link-target-smoke.html"), "hosted smoke dry run should list CTA link target page");
  assert(dryRunOutput.includes("https://example.org/wrapped/analytics-smoke.html"), "hosted smoke dry run should list analytics smoke page");
  assert(dryRunOutput.includes("https://example.org/wrapped/layout-smoke.html"), "hosted smoke dry run should list layout smoke page");
  assert(dryRunOutput.includes("https://example.org/wrapped/sample-teen-wrapped-2026.json"), "hosted smoke dry run should list teen data JSON");
  assert(dryRunOutput.includes("https://example.org/wrapped/wordpress-inline-embed.html"), "hosted smoke dry run should list WordPress inline handoff");
  assert(dryRunOutput.includes("https://example.org/wrapped/wrapped-builder.js"), "hosted smoke dry run should list builder script");
  assert(dryRunOutput.includes("https://example.org/wrapped/assets/wrapped-social-preview.png"), "hosted smoke dry run should list the social preview image");
  assert(dryRunOutput.includes("https://example.org/wrapped/share/baltimore/"), "hosted smoke dry run should list Baltimore share page");
  assert(helpOutput.includes("crawler metadata"), "hosted smoke help should describe crawler metadata checks");
  assert(helpOutput.includes("social preview image"), "hosted smoke help should describe social preview image checks");
  assert(listed.includes("node --check hosted-smoke.js"), "production QA should syntax-check the hosted smoke helper");
  assert(readme.includes("node hosted-smoke.js"), "README should document hosted smoke checks");
  assert(docs.includes("node hosted-smoke.js"), "production docs should document hosted smoke checks");
  assert(readme.includes("Access-Control-Allow-Origin"), "README should document hosted JSON CORS checks");
  assert(docs.includes("Access-Control-Allow-Origin"), "production docs should document hosted JSON CORS checks");
  assert(docs.includes("builder script"), "production docs should mention hosted builder script checks");
  assert(docs.includes("WordPress inline embed"), "production docs should mention hosted WordPress inline embed checks");
  assert(docs.includes("CTA link prefill"), "production docs should mention hosted CTA link prefill checks");
  assert(docs.includes("analytics smoke"), "production docs should mention hosted analytics smoke checks");
  assert(docs.includes("layout smoke"), "production docs should mention hosted layout smoke checks");
  assert(docs.includes("social preview image"), "production docs should mention hosted social preview image checks");
}

function runWordPressSmokeScriptSmoke() {
  const scriptPath = "wordpress-smoke.js";

  assert(fs.existsSync(scriptPath), "WordPress smoke script is missing");

  const wordpressSmoke = require("./wordpress-smoke.js");
  const hostedCssTag = '<link rel="stylesheet" href="https://stsimon-ncsy.github.io/jsu-wrapped-widget/jsu-wrapped.css?v=jsuw-prod-20260602a">';
  const hostedJsTag = '<script src="https://stsimon-ncsy.github.io/jsu-wrapped-widget/jsu-wrapped.js?v=jsuw-prod-20260602a"></script>';
  const socialImageUrl = "https://stsimon-ncsy.github.io/jsu-wrapped-widget/assets/wrapped-social-preview.png";
  const ogTypeTag = '<meta property="og:type" content="website">';
  const ogSiteNameTag = '<meta property="og:site_name" content="JSU/NCSY Wrapped">';
  const ogImageTag = '<meta property="og:image" content="' + socialImageUrl + '">';
  const ogImageSecureTag = '<meta property="og:image:secure_url" content="' + socialImageUrl + '">';
  const twitterImageTag = '<meta name="twitter:image" content="' + socialImageUrl + '">';
  const twitterTitleTag = '<meta name="twitter:title" content="JSU/NCSY Wrapped - Baltimore">';
  const twitterCardTag = '<meta name="twitter:card" content="summary_large_image">';
  const ogImageWidthTag = '<meta property="og:image:width" content="1200">';
  const ogImageHeightTag = '<meta property="og:image:height" content="630">';
  const ogImageAltTag = '<meta property="og:image:alt" content="JSU/NCSY Wrapped social preview for Baltimore">';
  const twitterImageAltTag = '<meta name="twitter:image:alt" content="JSU/NCSY Wrapped social preview for Baltimore">';
  const socialDescription = "See the JSU/NCSY Wrapped recap for Baltimore: events, teens, engagement moments, and community story.";
  const metaDescriptionTag = '<meta name="description" content="' + socialDescription + '">';
  const ogDescriptionTag = '<meta property="og:description" content="' + socialDescription + '">';
  const twitterDescriptionTag = '<meta name="twitter:description" content="' + socialDescription + '">';
  const socialUrl = "https://ncsy.org/ncsy-wrapped/?chapter=baltimore";
  const canonicalUrlTag = '<link rel="canonical" href="' + socialUrl + '">';
  const ogUrlTag = '<meta property="og:url" content="' + socialUrl + '">';
  const twitterUrlTag = '<meta name="twitter:url" content="' + socialUrl + '">';
  const minimalCtaPanelHtml = '<section id="jsuw-wrapped-interest"><form class="gform_wrapper"><input name="wrapped_chapter"><input name="wrapped_region"><input name="wrapped_url"></form></section>';
  const ctaPanelHtml = '<section id="jsuw-wrapped-interest"><form class="gform_wrapper"><input name="wrapped_chapter"><input name="wrapped_chapter_slug"><input name="wrapped_region"><input name="wrapped_scope"><input name="wrapped_slug"><input name="wrapped_name"><input name="wrapped_variant"><input name="wrapped_year"><input name="wrapped_url"></form></section>';
  const shortcodeCtaPanelHtml = '<section id="jsuw-wrapped-interest"><div class="jsuw-form-card">[gravityform id="255" title="false" description="false" ajax="true"]</div></section>';
  const destinationFormHtml = [
    "<html><head><title>Wrapped interest</title></head><body>",
    '<div class="gform_wrapper">',
    '<form id="gform_42">',
    '<input type="hidden" name="wrapped_chapter">',
    '<input type="hidden" name="wrapped_chapter_slug">',
    '<input type="hidden" name="wrapped_region">',
    '<input type="hidden" name="wrapped_scope">',
    '<input type="hidden" name="wrapped_slug">',
    '<input type="hidden" name="wrapped_name">',
    '<input type="hidden" name="wrapped_variant">',
    '<input type="hidden" name="wrapped_year">',
    '<input type="hidden" name="wrapped_url">',
    "</form>",
    "</div>",
    "</body></html>"
  ].join("");
  const goodHtml = [
    "<html><head>",
    "<title>JSU/NCSY Wrapped - Baltimore</title>",
    ogTypeTag,
    ogSiteNameTag,
    '<meta property="og:title" content="JSU/NCSY Wrapped - Baltimore">',
    twitterTitleTag,
    metaDescriptionTag,
    ogDescriptionTag,
    twitterDescriptionTag,
    ogImageTag,
    ogImageSecureTag,
    twitterImageTag,
    twitterCardTag,
    ogImageWidthTag,
    ogImageHeightTag,
    ogImageAltTag,
    twitterImageAltTag,
    canonicalUrlTag,
    ogUrlTag,
    twitterUrlTag,
    hostedCssTag,
    hostedJsTag,
    "</head><body>",
    '<div id="jsu-wrapped"',
    ' data-source="https://stsimon-ncsy.github.io/jsu-wrapped-widget/sample-wrapped-2026.json?v=jsuw-prod-20260602a"',
    ' data-config-source="https://stsimon-ncsy.github.io/jsu-wrapped-widget/wrapped-config-2026.json?v=jsuw-prod-20260602a"',
    ' data-share-base="https://stsimon-ncsy.github.io/jsu-wrapped-widget/share/"',
    ' data-cta-label="Get involved next year"',
    ' data-cta-target="#jsuw-wrapped-interest"></div>',
    ctaPanelHtml,
    '<a href="/privacy-policy/">Privacy Policy</a>',
    '<button onclick="window.Osano && window.Osano.cm.showDrawer()">Cookie Policy</button>',
    "</body></html>"
  ].join("");
  const goodReport = wordpressSmoke.validateWordPressPage({
    status: 200,
    text: goodHtml,
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  });
  const missingWidgetReport = wordpressSmoke.validateWordPressPage({
    status: 200,
    text: "<html><title>NCSY Wrapped</title><body></body></html>",
    url: "https://ncsy.org/ncsy-wrapped/"
  });
  const missingWidgetAssetsReport = wordpressSmoke.validateWordPressPage({
    status: 200,
    text: goodHtml
      .replace(hostedCssTag, "")
      .replace(hostedJsTag, ""),
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  });
  const staleWidgetAssetsReport = wordpressSmoke.validateWordPressPage({
    status: 200,
    text: goodHtml
      .replace("jsu-wrapped.css?v=jsuw-prod-20260602a", "jsu-wrapped.css")
      .replace("jsu-wrapped.js?v=jsuw-prod-20260602a", "jsu-wrapped.js"),
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  });
  const missingPanelReport = wordpressSmoke.validateWordPressPage({
    status: 200,
    text: goodHtml.replace(ctaPanelHtml, ""),
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  });
  const missingCtaContextReport = wordpressSmoke.validateWordPressPage({
    status: 200,
    text: goodHtml.replace('<input name="wrapped_url">', '<input name="input_3">'),
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  });
  const minimalCtaContextReport = wordpressSmoke.validateWordPressPage({
    status: 200,
    text: goodHtml.replace(ctaPanelHtml, minimalCtaPanelHtml),
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  });
  const unrenderedShortcodeReport = wordpressSmoke.validateWordPressPage({
    status: 200,
    text: goodHtml.replace(ctaPanelHtml, shortcodeCtaPanelHtml),
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  });
  const missingHostedAttrsReport = wordpressSmoke.validateWordPressPage({
    status: 200,
    text: goodHtml
      .replace(' data-config-source="https://stsimon-ncsy.github.io/jsu-wrapped-widget/wrapped-config-2026.json?v=jsuw-prod-20260602a"', "")
      .replace(' data-share-base="https://stsimon-ncsy.github.io/jsu-wrapped-widget/share/"', ""),
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  });
  const directCtaHrefHtml = goodHtml
    .replace(' data-cta-target="#jsuw-wrapped-interest"', ' data-cta-href="https://ncsy.org/wrapped-interest/"')
    .replace(ctaPanelHtml, "");
  const directCtaHrefAttrsReport = wordpressSmoke.validateWordPressPage({
    status: 200,
    text: directCtaHrefHtml
      .replace(' data-config-source="https://stsimon-ncsy.github.io/jsu-wrapped-widget/wrapped-config-2026.json?v=jsuw-prod-20260602a"', "")
      .replace(' data-share-base="https://stsimon-ncsy.github.io/jsu-wrapped-widget/share/"', ""),
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  });
  const unsafeCtaHrefReport = wordpressSmoke.validateWordPressPage({
    status: 200,
    text: goodHtml
      .replace(' data-cta-target="#jsuw-wrapped-interest"', ' data-cta-href="javascript:alert(1)"')
      .replace(ctaPanelHtml, ""),
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  });
  const oversizedCtaHrefReport = wordpressSmoke.validateWordPressPage({
    status: 200,
    text: goodHtml
      .replace(' data-cta-target="#jsuw-wrapped-interest"', ' data-cta-href="https://ncsy.org/wrapped-interest/?wrapped_submission=%7B%22cards%22%3A%5B%7B%22headline%22%3A%22Too%20much%20JSON%22%7D%5D%7D"')
      .replace(ctaPanelHtml, ""),
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  });
  const unsafeCtaHrefStaleAttrsReport = wordpressSmoke.validateWordPressPage({
    status: 200,
    text: goodHtml
      .replace(' data-config-source="https://stsimon-ncsy.github.io/jsu-wrapped-widget/wrapped-config-2026.json?v=jsuw-prod-20260602a"', "")
      .replace(' data-share-base="https://stsimon-ncsy.github.io/jsu-wrapped-widget/share/"', "")
      .replace(' data-cta-target="#jsuw-wrapped-interest"', ' data-cta-href="javascript:alert(1)"')
      .replace(ctaPanelHtml, ""),
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  });
  const wrongSocialTitleReport = wordpressSmoke.validateWordPressPage({
    status: 200,
    text: goodHtml.replace(/JSU\/NCSY Wrapped - Baltimore/g, "NCSY Wrapped - Baltimore"),
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  });
  const missingSocialImageReport = wordpressSmoke.validateWordPressPage({
    status: 200,
    text: goodHtml
      .replace(ogImageTag, "")
      .replace(ogImageSecureTag, "")
      .replace(twitterImageTag, ""),
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  });
  const missingTwitterPairedMetadataReport = wordpressSmoke.validateWordPressPage({
    status: 200,
    text: goodHtml
      .replace(twitterTitleTag, "")
      .replace(twitterUrlTag, "")
      .replace(twitterImageTag, ""),
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  });
  const missingOpenGraphIdentityReport = wordpressSmoke.validateWordPressPage({
    status: 200,
    text: goodHtml
      .replace(ogTypeTag, "")
      .replace(ogSiteNameTag, "")
      .replace(ogImageSecureTag, ""),
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  });
  const wrongSocialImageReport = wordpressSmoke.validateWordPressPage({
    status: 200,
    text: goodHtml.replaceAll(socialImageUrl, "https://ncsy.org/wp-content/uploads/logo.png"),
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  });
  const missingSocialUrlReport = wordpressSmoke.validateWordPressPage({
    status: 200,
    text: goodHtml
      .replace(canonicalUrlTag, "")
      .replace(ogUrlTag, "")
      .replace(twitterUrlTag, ""),
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  });
  const missingSocialDescriptionReport = wordpressSmoke.validateWordPressPage({
    status: 200,
    text: goodHtml
      .replace(metaDescriptionTag, "")
      .replace(ogDescriptionTag, "")
      .replace(twitterDescriptionTag, ""),
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  });
  const missingMetaDescriptionReport = wordpressSmoke.validateWordPressPage({
    status: 200,
    text: goodHtml.replace(metaDescriptionTag, ""),
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  });
  const wrongSocialDescriptionReport = wordpressSmoke.validateWordPressPage({
    status: 200,
    text: goodHtml.replaceAll(socialDescription, "Privacy Policy | Behavioral Standards | Cookie Policy"),
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  });
  const wrongSocialUrlReport = wordpressSmoke.validateWordPressPage({
    status: 200,
    text: goodHtml.replaceAll(socialUrl, "https://ncsy.org/ncsy-wrapped/"),
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  });
  const missingSocialCardDetailsReport = wordpressSmoke.validateWordPressPage({
    status: 200,
    text: goodHtml
      .replace(twitterCardTag, "")
      .replace(ogImageWidthTag, "")
      .replace(ogImageHeightTag, "")
      .replace(ogImageAltTag, "")
      .replace(twitterImageAltTag, ""),
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  });
  const missingTwitterImageAltReport = wordpressSmoke.validateWordPressPage({
    status: 200,
    text: goodHtml.replace(twitterImageAltTag, ""),
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  });
  const goodDestinationReport = wordpressSmoke.validateCtaDestinationPage({
    status: 200,
    headers: { "content-type": "text/html; charset=UTF-8" },
    text: destinationFormHtml,
    url: "https://ncsy.org/wrapped-interest/"
  });
  const missingDestinationContextReport = wordpressSmoke.validateCtaDestinationPage({
    status: 200,
    headers: { "content-type": "text/html" },
    text: destinationFormHtml.replace('<input type="hidden" name="wrapped_url">', '<input type="hidden" name="input_9">'),
    url: "https://ncsy.org/wrapped-interest/"
  });
  const nonHtmlDestinationReport = wordpressSmoke.validateCtaDestinationPage({
    status: 200,
    headers: { "content-type": "application/json" },
    text: "{}",
    url: "https://ncsy.org/wrapped-interest/"
  });
  assert(typeof wordpressSmoke.formatFixPacket === "function", "WordPress smoke should expose a fix-packet formatter");
  const fixPacket = wordpressSmoke.formatFixPacket({
    status: 200,
    text: goodHtml
      .replace(/JSU\/NCSY Wrapped - Baltimore/g, "NCSY Wrapped - Baltimore")
      .replace(' data-config-source="https://stsimon-ncsy.github.io/jsu-wrapped-widget/wrapped-config-2026.json?v=jsuw-prod-20260602a"', "")
      .replace(' data-share-base="https://stsimon-ncsy.github.io/jsu-wrapped-widget/share/"', ""),
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  });
  const directCtaFixPacket = wordpressSmoke.formatFixPacket({
    status: 200,
    text: goodHtml
      .replace(/JSU\/NCSY Wrapped - Baltimore/g, "NCSY Wrapped - Baltimore")
      .replace(' data-config-source="https://stsimon-ncsy.github.io/jsu-wrapped-widget/wrapped-config-2026.json?v=jsuw-prod-20260602a"', "")
      .replace(' data-share-base="https://stsimon-ncsy.github.io/jsu-wrapped-widget/share/"', ""),
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  }, null, {
    ctaHref: "https://ncsy.org/wrapped-interest/"
  });
  const missingContextFixPacket = wordpressSmoke.formatFixPacket({
    status: 200,
    text: goodHtml.replace('<input name="wrapped_url">', '<input name="input_3">'),
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  });
  const missingAssetsFixPacket = wordpressSmoke.formatFixPacket({
    status: 200,
    text: goodHtml
      .replace(hostedCssTag, "")
      .replace(hostedJsTag, ""),
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  });
  const staleDataUrlReport = wordpressSmoke.validateWordPressPage({
    status: 200,
    text: goodHtml.replace("sample-wrapped-2026.json?v=jsuw-prod-20260602a", "sample-wrapped-2026.json"),
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  });
  const missingPrivacyReport = wordpressSmoke.validateWordPressPage({
    status: 200,
    text: goodHtml.replace('<a href="/privacy-policy/">Privacy Policy</a>', "").replace('<button onclick="window.Osano && window.Osano.cm.showDrawer()">Cookie Policy</button>', ""),
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  });
  const brokenTextReport = wordpressSmoke.validateWordPressPage({
    status: 200,
    text: goodHtml.replace("JSU/NCSY Wrapped - Baltimore", "undefined Wrapped"),
    url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
  });
  const dryRunOutput = childProcess.execFileSync(process.execPath, [scriptPath, "--url", "https://ncsy.org/ncsy-wrapped/?chapter=baltimore", "--dry-run"], {
    cwd: __dirname,
    encoding: "utf8",
    stdio: "pipe"
  });
  const helpOutput = childProcess.execFileSync(process.execPath, [scriptPath, "--help"], {
    cwd: __dirname,
    encoding: "utf8",
    stdio: "pipe"
  });
  const destinationDryRunOutput = childProcess.execFileSync(process.execPath, [scriptPath, "--url", "https://ncsy.org/ncsy-wrapped/?chapter=baltimore", "--cta-href", "https://ncsy.org/wrapped-interest/", "--check-cta-destination", "--dry-run"], {
    cwd: __dirname,
    encoding: "utf8",
    stdio: "pipe"
  });
  const listed = childProcess.execFileSync(process.execPath, ["check-production.js", "--list"], { encoding: "utf8" });
  const readme = loadText("README.md");
  const docs = loadText("docs/production-readiness.md");
  const checklist = loadText("docs/launch-checklist.md");
  const launchPacketPath = "docs/wordpress-launch-packet.md";
  const launchPacket = fs.existsSync(launchPacketPath) ? loadText(launchPacketPath) : "";
  const source = loadText(scriptPath);

  assert(goodReport.ok, `WordPress smoke validator rejected good page: ${goodReport.errors.join("; ")}`);
  assert(typeof wordpressSmoke.suggestedSocialDescription === "function", "WordPress smoke should expose a social description helper");
  assert(wordpressSmoke.suggestedSocialDescription({ url: "https://ncsy.org/ncsy-wrapped/?chapter=baltimore" }, goodHtml) === socialDescription, "WordPress smoke should suggest the exact chapter social description");
  assert(!missingWidgetReport.ok && missingWidgetReport.errors.some((error) => error.includes("widget container")), "WordPress smoke should reject pages without the widget container");
  assert(!missingWidgetAssetsReport.ok && missingWidgetAssetsReport.errors.some((error) => error.includes("stylesheet")), "WordPress smoke should reject pages without widget CSS");
  assert(!missingWidgetAssetsReport.ok && missingWidgetAssetsReport.errors.some((error) => error.includes("script")), "WordPress smoke should reject pages without widget JS");
  assert(missingWidgetAssetsReport.fixes.some((fix) => fix.includes("jsu-wrapped.css")), "WordPress smoke should suggest adding the widget stylesheet");
  assert(missingWidgetAssetsReport.fixes.some((fix) => fix.includes("jsu-wrapped.js")), "WordPress smoke should suggest adding the widget script");
  assert(!staleWidgetAssetsReport.ok && staleWidgetAssetsReport.errors.some((error) => error.includes("stylesheet") && error.includes("cache token")), "WordPress smoke should reject stale widget stylesheet URLs");
  assert(!staleWidgetAssetsReport.ok && staleWidgetAssetsReport.errors.some((error) => error.includes("script") && error.includes("cache token")), "WordPress smoke should reject stale widget script URLs");
  assert(!missingPanelReport.ok && missingPanelReport.errors.some((error) => error.includes("CTA target")), "WordPress smoke should reject missing CTA target panels");
  assert(!missingCtaContextReport.ok && missingCtaContextReport.errors.some((error) => error.includes("Wrapped URL")), "WordPress smoke should reject embedded CTA forms without a Wrapped URL context field");
  assert(missingCtaContextReport.fixes.some((fix) => fix.includes("wrapped_url")), "WordPress smoke should suggest the missing Wrapped URL field name");
  assert(!minimalCtaContextReport.ok && minimalCtaContextReport.errors.some((error) => error.includes("scope type")), "WordPress smoke should require a scope type context field");
  assert(!minimalCtaContextReport.ok && minimalCtaContextReport.errors.some((error) => error.includes("scope slug")), "WordPress smoke should require a scope slug context field");
  assert(!minimalCtaContextReport.ok && minimalCtaContextReport.errors.some((error) => error.includes("scope name")), "WordPress smoke should require a scope name context field");
  assert(!minimalCtaContextReport.ok && minimalCtaContextReport.errors.some((error) => error.includes("chapter slug")), "WordPress smoke should require a chapter slug context field");
  assert(!minimalCtaContextReport.ok && minimalCtaContextReport.errors.some((error) => error.includes("variant")), "WordPress smoke should require a variant context field");
  assert(!minimalCtaContextReport.ok && minimalCtaContextReport.errors.some((error) => error.includes("year")), "WordPress smoke should require a year context field");
  assert(!unrenderedShortcodeReport.ok && unrenderedShortcodeReport.errors.some((error) => error.includes("unrendered Gravity Forms shortcode")), "WordPress smoke should call out unrendered Gravity Forms shortcodes in Custom HTML panels");
  assert(unrenderedShortcodeReport.fixes.some((fix) => fix.includes("Shortcode block") && fix.includes("jsuw-wrapped-interest")), "WordPress smoke should suggest a rendered Shortcode or Gravity Forms block for embedded CTA forms");
  assert(!missingHostedAttrsReport.ok && missingHostedAttrsReport.fixes.some((fix) => fix.includes("data-config-source")), "WordPress smoke should suggest the missing config-source attribute");
  assert(!missingHostedAttrsReport.ok && missingHostedAttrsReport.fixes.some((fix) => fix.includes("data-share-base")), "WordPress smoke should suggest the missing share-base attribute");
  assert(missingHostedAttrsReport.fixes[0].includes('Replace the #jsu-wrapped opening tag with: <div id="jsu-wrapped"'), "WordPress smoke should lead with the full replacement widget tag");
  assert(!missingHostedAttrsReport.ok && missingHostedAttrsReport.fixes.some((fix) => fix.includes('Replace the #jsu-wrapped opening tag with: <div id="jsu-wrapped"')), "WordPress smoke should suggest a full replacement widget opening tag");
  assert(!missingHostedAttrsReport.ok && missingHostedAttrsReport.fixes.some((fix) => fix.includes('data-assets-base="https://stsimon-ncsy.github.io/jsu-wrapped-widget/assets/"')), "WordPress smoke replacement tag should include the assets base");
  assert(!missingHostedAttrsReport.ok && missingHostedAttrsReport.fixes.some((fix) => fix.includes('data-analytics="true"')), "WordPress smoke replacement tag should keep analytics enabled");
  assert(directCtaHrefAttrsReport.fixes[0].includes('data-cta-href="https://ncsy.org/wrapped-interest/"'), "WordPress smoke replacement tag should preserve direct Gravity Forms CTA URLs");
  assert(!directCtaHrefAttrsReport.fixes[0].includes('data-cta-target="#jsuw-wrapped-interest"'), "WordPress smoke replacement tag should not add an embedded CTA target when preserving a direct CTA URL");
  assert(!unsafeCtaHrefReport.ok && unsafeCtaHrefReport.errors.some((error) => error.includes("data-cta-href")), "WordPress smoke should reject unsafe CTA href attributes");
  assert(unsafeCtaHrefReport.fixes.some((fix) => fix.includes("safe")), "WordPress smoke should suggest a safe CTA destination");
  assert(!oversizedCtaHrefReport.ok && oversizedCtaHrefReport.errors.some((error) => error.includes("short wrapped_* context params")), "WordPress smoke should reject CTA hrefs that carry JSON submission params");
  assert(oversizedCtaHrefReport.fixes.some((fix) => fix.includes("short wrapped_* context params")), "WordPress smoke should explain that CTA URLs should only carry short context params");
  assert(!unsafeCtaHrefStaleAttrsReport.fixes[0].includes("javascript:"), "WordPress smoke replacement tag should not preserve unsafe CTA href values");
  assert(unsafeCtaHrefStaleAttrsReport.fixes[0].includes('data-cta-target="#jsuw-wrapped-interest"'), "WordPress smoke replacement tag should fall back to the embedded CTA target for unsafe direct URLs");
  assert(!wrongSocialTitleReport.ok && wrongSocialTitleReport.errors.some((error) => error.includes("JSU/NCSY Wrapped - [Chapter or Scope Name]")), "WordPress smoke should reject generic NCSY-only social titles");
  assert(wrongSocialTitleReport.fixes.some((fix) => fix.includes('"JSU/NCSY Wrapped - Baltimore"')), "WordPress smoke should suggest the exact corrected chapter title when it can infer one");
  assert(!missingTwitterPairedMetadataReport.ok && missingTwitterPairedMetadataReport.errors.some((error) => error.includes("twitter:title")), "WordPress smoke should reject pages without twitter:title metadata");
  assert(!missingSocialImageReport.ok && missingSocialImageReport.errors.some((error) => error.includes("social image")), "WordPress smoke should reject pages without social image metadata");
  assert(missingSocialImageReport.fixes.some((fix) => fix.includes("og:image") && fix.includes("wrapped-social-preview.png")), "WordPress smoke should suggest the campaign social image");
  assert(!missingTwitterPairedMetadataReport.ok && missingTwitterPairedMetadataReport.errors.some((error) => error.includes("twitter:image")), "WordPress smoke should reject pages without twitter:image metadata");
  assert(!wrongSocialImageReport.ok && wrongSocialImageReport.errors.some((error) => error.includes("social image")), "WordPress smoke should reject generic social image metadata");
  assert(!missingSocialUrlReport.ok && missingSocialUrlReport.errors.some((error) => error.includes("canonical URL")), "WordPress smoke should reject pages without canonical URL metadata");
  assert(!missingSocialUrlReport.ok && missingSocialUrlReport.errors.some((error) => error.includes("social URL")), "WordPress smoke should reject pages without social URL metadata");
  assert(missingSocialUrlReport.fixes.some((fix) => fix.includes("og:url") && fix.includes("?chapter=baltimore")), "WordPress smoke should suggest chapter-specific social URL metadata");
  assert(!missingTwitterPairedMetadataReport.ok && missingTwitterPairedMetadataReport.errors.some((error) => error.includes("twitter:url")), "WordPress smoke should reject pages without twitter:url metadata");
  assert(!missingSocialDescriptionReport.ok && missingSocialDescriptionReport.errors.some((error) => error.includes("social description")), "WordPress smoke should reject pages without social description metadata");
  assert(missingSocialDescriptionReport.fixes.some((fix) => fix.includes("og:description") && fix.includes(socialDescription)), "WordPress smoke should suggest chapter-specific social description metadata");
  assert(!missingMetaDescriptionReport.ok && missingMetaDescriptionReport.errors.some((error) => error.includes("meta description")), "WordPress smoke should reject pages without plain meta description metadata");
  assert(missingMetaDescriptionReport.fixes.some((fix) => fix.includes("meta description") && fix.includes(socialDescription)), "WordPress smoke should suggest chapter-specific plain meta description metadata");
  assert(!wrongSocialDescriptionReport.ok && wrongSocialDescriptionReport.errors.some((error) => error.includes("social description")), "WordPress smoke should reject privacy/cookie fallback social descriptions");
  assert(!wrongSocialUrlReport.ok && wrongSocialUrlReport.errors.some((error) => error.includes("chapter URL")), "WordPress smoke should reject generic URL metadata that drops the chapter parameter");
  assert(!missingOpenGraphIdentityReport.ok && missingOpenGraphIdentityReport.errors.some((error) => error.includes("og:type")), "WordPress smoke should reject pages without OG type metadata");
  assert(!missingOpenGraphIdentityReport.ok && missingOpenGraphIdentityReport.errors.some((error) => error.includes("site name")), "WordPress smoke should reject pages without OG site name metadata");
  assert(!missingOpenGraphIdentityReport.ok && missingOpenGraphIdentityReport.errors.some((error) => error.includes("secure image")), "WordPress smoke should reject pages without OG secure image metadata");
  assert(!missingSocialCardDetailsReport.ok && missingSocialCardDetailsReport.errors.some((error) => error.includes("twitter:card")), "WordPress smoke should reject pages without summary_large_image Twitter card metadata");
  assert(!missingSocialCardDetailsReport.ok && missingSocialCardDetailsReport.errors.some((error) => error.includes("image dimensions")), "WordPress smoke should reject pages without social image dimensions");
  assert(!missingSocialCardDetailsReport.ok && missingSocialCardDetailsReport.errors.some((error) => error.includes("image alt")), "WordPress smoke should reject pages without social image alt metadata");
  assert(!missingTwitterImageAltReport.ok && missingTwitterImageAltReport.errors.some((error) => error.includes("Twitter image alt")), "WordPress smoke should reject pages without Twitter image alt metadata");
  assert(goodDestinationReport.ok, `WordPress smoke rejected a good direct Gravity Forms destination: ${goodDestinationReport.errors.join("; ")}`);
  assert(!missingDestinationContextReport.ok && missingDestinationContextReport.errors.some((error) => error.includes("Gravity Forms destination") && error.includes("Wrapped URL")), "WordPress smoke should reject direct Gravity Forms destinations missing wrapped_url");
  assert(missingDestinationContextReport.fixes.some((fix) => fix.includes("wrapped_url")), "WordPress smoke should suggest wrapped_url for direct Gravity Forms destinations");
  assert(!nonHtmlDestinationReport.ok && nonHtmlDestinationReport.errors.some((error) => error.includes("content type")), "WordPress smoke should reject non-HTML direct CTA destinations");
  assert(fixPacket.includes("WordPress Wrapped launch packet"), "WordPress fix packet should include a clear header");
  assert(fixPacket.includes("NCSY.org is the canonical public Wrapped page"), "WordPress fix packet should identify NCSY.org as the production page host");
  assert(fixPacket.includes("GitHub Pages is the static asset/data host"), "WordPress fix packet should identify GitHub Pages as the static asset/data host");
  assert(fixPacket.includes("Gravity Forms handles only the final CTA/contact capture"), "WordPress fix packet should explain the Gravity Forms scope");
  assert(fixPacket.includes("not the staff-builder submission intake flow"), "WordPress fix packet should distinguish the public CTA form from the staff builder intake form");
  assert(fixPacket.includes("A nonzero exit in fix-packet mode means the live page is still stale"), "WordPress fix packet should explain why fix-packet mode can exit nonzero");
  assert(fixPacket.includes("Embedded Gravity Forms CTA setup"), "WordPress fix packet should include embedded Gravity Forms setup guidance");
  assert(fixPacket.includes("Do not rely on a [gravityform] shortcode inside a Custom HTML block"), "WordPress fix packet should warn about unrendered shortcodes in Custom HTML blocks");
  assert(fixPacket.includes("Replace #jsu-wrapped with:"), "WordPress fix packet should identify the widget tag replacement");
  assert(fixPacket.includes("Copy-ready WordPress HTML block:"), "WordPress fix packet should include one paste-ready HTML block");
  assert(fixPacket.includes(hostedCssTag + "\n" + '<div id="jsu-wrapped"'), "WordPress fix packet should put the stylesheet and widget tag together in the paste-ready HTML block");
  assert(fixPacket.includes("</div>\n" + hostedJsTag), "WordPress fix packet should put the widget script after the widget tag in the paste-ready HTML block");
  assert(directCtaFixPacket.includes('data-cta-href="https://ncsy.org/wrapped-interest/"'), "WordPress fix packet should support a direct Gravity Forms CTA URL option");
  assert(!directCtaFixPacket.includes('data-cta-target="#jsuw-wrapped-interest"'), "WordPress fix packet should not include an embedded CTA target when a direct Gravity Forms CTA URL is requested");
  assert(directCtaFixPacket.includes("Direct Gravity Forms CTA URL: https://ncsy.org/wrapped-interest/"), "WordPress fix packet should label the direct Gravity Forms CTA URL");
  assert(directCtaFixPacket.includes("Add these hidden/context fields on the destination form page"), "WordPress fix packet should clarify that direct CTA context fields belong on the destination form page");
  assert(fixPacket.includes('data-config-source="https://stsimon-ncsy.github.io/jsu-wrapped-widget/wrapped-config-2026.json?v=jsuw-prod-20260602a"'), "WordPress fix packet should include the config source");
  assert(fixPacket.includes("jsu-wrapped.css?v=jsuw-prod-20260602a"), "WordPress fix packet should include the hosted widget stylesheet");
  assert(fixPacket.includes("jsu-wrapped.js?v=jsuw-prod-20260602a"), "WordPress fix packet should include the hosted widget script");
  assert(fixPacket.includes("og:image: https://stsimon-ncsy.github.io/jsu-wrapped-widget/assets/wrapped-social-preview.png"), "WordPress fix packet should include the campaign og:image URL");
  assert(fixPacket.includes("og:image:secure_url: https://stsimon-ncsy.github.io/jsu-wrapped-widget/assets/wrapped-social-preview.png"), "WordPress fix packet should include the campaign og:image secure URL");
  assert(fixPacket.includes("twitter:image: https://stsimon-ncsy.github.io/jsu-wrapped-widget/assets/wrapped-social-preview.png"), "WordPress fix packet should include the campaign twitter:image URL");
  assert(fixPacket.includes("twitter:card: summary_large_image"), "WordPress fix packet should include the large-card Twitter metadata");
  assert(fixPacket.includes("og:type: website"), "WordPress fix packet should include the OG type");
  assert(fixPacket.includes("og:site_name: JSU/NCSY Wrapped"), "WordPress fix packet should include the OG site name");
  assert(fixPacket.includes("og:image:width: 1200"), "WordPress fix packet should include the social image width");
  assert(fixPacket.includes("og:image:height: 630"), "WordPress fix packet should include the social image height");
  assert(fixPacket.includes("og:image:alt: JSU/NCSY Wrapped social preview for Baltimore"), "WordPress fix packet should include chapter-specific social image alt text");
  assert(fixPacket.includes("twitter:image:alt: JSU/NCSY Wrapped social preview for Baltimore"), "WordPress fix packet should include chapter-specific Twitter social image alt text");
  assert(fixPacket.includes("canonical: https://ncsy.org/ncsy-wrapped/?chapter=baltimore"), "WordPress fix packet should include the chapter canonical URL");
  assert(fixPacket.includes("og:url: https://ncsy.org/ncsy-wrapped/?chapter=baltimore"), "WordPress fix packet should include the chapter og:url");
  assert(fixPacket.includes("twitter:url: https://ncsy.org/ncsy-wrapped/?chapter=baltimore"), "WordPress fix packet should include the chapter twitter:url");
  assert(fixPacket.includes("description: " + socialDescription), "WordPress fix packet should include the exact plain meta description");
  assert(fixPacket.includes("og:description: " + socialDescription), "WordPress fix packet should include the exact og:description");
  assert(fixPacket.includes("twitter:description: " + socialDescription), "WordPress fix packet should include the exact twitter:description");
  assert(fixPacket.includes("Page/social title: JSU/NCSY Wrapped - Baltimore"), "WordPress fix packet should include the exact title");
  assert(fixPacket.includes('node wordpress-smoke.js --url "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"'), "WordPress fix packet should include the follow-up smoke command");
  assert(launchPacket.includes("WordPress Wrapped Launch Packet"), "repo should include a checked-in WordPress launch packet");
  assert(launchPacket.includes('data-config-source="https://stsimon-ncsy.github.io/jsu-wrapped-widget/wrapped-config-2026.json?v=jsuw-prod-20260602a"'), "checked-in WordPress launch packet should include the current config source");
  assert(launchPacket.includes("JSU/NCSY Wrapped - Baltimore"), "checked-in WordPress launch packet should include the exact Baltimore title");
  assert(launchPacket.includes("A failed live smoke after generating this packet means the public page still needs this packet applied"), "checked-in WordPress launch packet should explain that stale live-page failure is expected before application");
  assert(launchPacket.includes('node wordpress-smoke.js --url "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"'), "checked-in WordPress launch packet should include the follow-up verification command");
  assert(missingContextFixPacket.includes("Gravity Forms hidden/context fields:"), "WordPress fix packet should call out missing Gravity Forms context fields");
  assert(missingContextFixPacket.includes("wrapped_url"), "WordPress fix packet should include missing Wrapped URL field names");
  assert(missingAssetsFixPacket.includes("Hosted CSS/JS assets:"), "WordPress fix packet should call out missing hosted widget assets");
  assert(missingAssetsFixPacket.includes(hostedCssTag), "WordPress fix packet should include the copy-ready CSS link");
  assert(missingAssetsFixPacket.includes(hostedJsTag), "WordPress fix packet should include the copy-ready JS script");
  assert(!staleDataUrlReport.ok && staleDataUrlReport.errors.some((error) => error.includes("cache token")), "WordPress smoke should reject hosted data URLs without the shared cache token");
  assert(!staleDataUrlReport.ok && staleDataUrlReport.fixes.some((fix) => fix.includes("data-source")), "WordPress smoke should suggest the fixed data-source attribute for stale data URLs");
  assert(!missingPrivacyReport.ok && missingPrivacyReport.errors.some((error) => error.includes("privacy")), "WordPress smoke should reject pages without privacy/cookie affordances");
  assert(!brokenTextReport.ok && brokenTextReport.errors.some((error) => error.includes("broken placeholder text")), "WordPress smoke should reject visible broken placeholder text");
  assert(dryRunOutput.includes("https://ncsy.org/ncsy-wrapped/?chapter=baltimore"), "WordPress smoke dry run should show the target URL");
  assert(destinationDryRunOutput.includes("would also check CTA destination https://ncsy.org/wrapped-interest/"), "WordPress smoke dry run should show the direct CTA destination when requested");
  assert(helpOutput.includes("social descriptions"), "WordPress smoke help should describe social description checks");
  assert(helpOutput.includes("image alt"), "WordPress smoke help should describe social image alt checks");
  assert(listed.includes("node --check wordpress-smoke.js"), "production QA should syntax-check the WordPress smoke helper");
  assert(source.includes("process.exitCode = 1"), "WordPress smoke should set exitCode on validation failure");
  assert(!source.includes("process.exit(1)"), "WordPress smoke should not force process.exit after async fetch validation");
  assert(source.includes("settings.fixPacket && !report.ok"), "WordPress fix-packet mode should return after the packet on stale pages instead of duplicating detailed fixes");
  assert(source.includes("--cta-href"), "WordPress smoke should support a direct Gravity Forms CTA href option");
  assert(source.includes("--check-cta-destination"), "WordPress smoke should support an explicit direct Gravity Forms destination check option");
  assert(readme.includes("node wordpress-smoke.js"), "README should document WordPress smoke checks");
  assert(docs.includes("node wordpress-smoke.js"), "production docs should document WordPress smoke checks");
  assert(docs.includes("docs/wordpress-launch-packet.md"), "production docs should link the checked-in WordPress launch packet");
  assert(checklist.includes("node wordpress-smoke.js"), "launch checklist should include WordPress smoke checks");
  assert(readme.includes("--fix-packet"), "README should document the WordPress fix-packet helper");
  assert(docs.includes("--fix-packet"), "production docs should document the WordPress fix-packet helper");
  assert(checklist.includes("--fix-packet"), "launch checklist should document the WordPress fix-packet helper");
  assert(readme.includes("A nonzero `--fix-packet` exit means the live page is still stale"), "README should explain fix-packet nonzero exits");
  assert(docs.includes("A nonzero `--fix-packet` exit means the live page is still stale"), "production docs should explain fix-packet nonzero exits");
  assert(readme.includes("--cta-href"), "README should document the direct Gravity Forms CTA href fix-packet option");
  assert(docs.includes("--cta-href"), "production docs should document the direct Gravity Forms CTA href fix-packet option");
  assert(checklist.includes("--cta-href"), "launch checklist should document the direct Gravity Forms CTA href fix-packet option");
  assert(readme.includes("--check-cta-destination"), "README should document direct Gravity Forms destination checks");
  assert(docs.includes("--check-cta-destination"), "production docs should document direct Gravity Forms destination checks");
  assert(checklist.includes("--check-cta-destination"), "launch checklist should document direct Gravity Forms destination checks");
  assert(readme.includes("og:description"), "README should document social description metadata");
  assert(docs.includes("og:description"), "production docs should document social description metadata");
  assert(checklist.includes("og:description"), "launch checklist should document social description metadata");
  assert(readme.includes("meta description"), "README should document plain meta description metadata");
  assert(docs.includes("meta description"), "production docs should document plain meta description metadata");
  assert(checklist.includes("meta description"), "launch checklist should document plain meta description metadata");
  assert(readme.includes("twitter:image:alt"), "README should document Twitter image alt metadata");
  assert(docs.includes("twitter:image:alt"), "production docs should document Twitter image alt metadata");
  assert(checklist.includes("twitter:image:alt"), "launch checklist should document Twitter image alt metadata");
  assert(readme.includes("og:site_name"), "README should document OG site name metadata");
  assert(docs.includes("og:site_name"), "production docs should document OG site name metadata");
  assert(checklist.includes("og:site_name"), "launch checklist should document OG site name metadata");
  assert(readme.includes("NCSY.org is the canonical public Wrapped page"), "README should document the canonical NCSY.org hosting role");
  assert(readme.includes("GitHub Pages is the static asset/data host"), "README should document the GitHub Pages asset/data role");
  assert(readme.includes("Gravity Forms handles only the final CTA/contact capture"), "README should document the limited Gravity Forms role");
  assert(docs.includes("NCSY.org is the canonical public Wrapped page"), "production docs should document the canonical NCSY.org hosting role");
  assert(docs.includes("GitHub Pages is the static asset/data host"), "production docs should document the GitHub Pages asset/data role");
  assert(checklist.includes("NCSY.org is the canonical public Wrapped page"), "launch checklist should include the canonical hosting role");
}

function runRenderSmokeScriptSmoke() {
  const scriptPath = "render-smoke.js";

  assert(fs.existsSync(scriptPath), "headless render smoke script is missing");

  const renderSmoke = require("./render-smoke.js");
  const goodReport = renderSmoke.validateRenderedDom({
    label: "chapter story",
    html: '<main><div id="jsu-wrapped"><section class="jsuw-story"><h1>Baltimore Wrapped</h1><button>Share this recap</button></section></div></main>',
    requiredText: ["Baltimore Wrapped", "Share this recap"],
    requiredSelectors: ['id="jsu-wrapped"', "jsuw-story"]
  });
  const badReport = renderSmoke.validateRenderedDom({
    label: "chapter story",
    html: '<main><div id="jsu-wrapped"></div></main>',
    requiredText: ["Baltimore Wrapped"],
    requiredSelectors: ["jsuw-story"]
  });
  const dryRunOutput = childProcess.execFileSync(process.execPath, [scriptPath, "--dry-run"], {
    cwd: __dirname,
    encoding: "utf8",
    stdio: "pipe"
  });
  const defaultListEnv = Object.assign({}, process.env);

  delete defaultListEnv.JSUW_SKIP_OPTIONAL_RENDER_SMOKE;

  const listed = childProcess.execFileSync(process.execPath, ["check-production.js", "--list"], {
    encoding: "utf8",
    env: defaultListEnv
  });
  const readme = loadText("README.md");
  const docs = loadText("docs/production-readiness.md");
  const workflow = loadText(".github/workflows/qa.yml");
  const renderSmokeSource = loadText(scriptPath);

  assert(goodReport.ok, `render smoke validator rejected good DOM: ${goodReport.errors.join("; ")}`);
  assert(!badReport.ok && badReport.errors.some((error) => error.includes("chapter story")), "render smoke validator should reject blank story DOM");
  assert(dryRunOutput.includes("/?qa=render-smoke"), "render smoke dry run should list the no-parameter picker URL");
  assert(dryRunOutput.includes("/?chapter=baltimore"), "render smoke dry run should list the Baltimore story URL");
  assert(dryRunOutput.includes("/cta-prefill-smoke.html?chapter=baltimore"), "render smoke dry run should list the CTA prefill smoke page");
  assert(dryRunOutput.includes("/cta-link-smoke.html?chapter=baltimore"), "render smoke dry run should list the CTA link smoke page");
  assert(dryRunOutput.includes("/analytics-smoke.html?chapter=baltimore"), "render smoke dry run should list the analytics smoke page");
  assert(dryRunOutput.includes("/layout-smoke.html?chapter=baltimore"), "render smoke dry run should list the layout smoke page");
  assert(dryRunOutput.includes("/builder.html"), "render smoke dry run should list the builder URL");
  assert(listed.includes("node --check render-smoke.js"), "production QA should syntax-check the render smoke helper");
  assert(listed.includes("node render-smoke.js --skip-if-missing"), "production QA should run render smoke when a browser is available");
  assert(workflow.includes("node render-smoke.js --browser \"${{ steps.chrome.outputs.chrome-path }}\" --timeout-ms 60000"), "CI enforced render smoke should allow enough time for cold headless Chrome startup");
  assert(readme.includes("node render-smoke.js --skip-if-missing"), "README should document optional headless render smoke checks");
  assert(docs.includes("node render-smoke.js --skip-if-missing"), "production docs should document optional headless render smoke checks");
  assert(docs.includes("picker, Baltimore story, layout smoke, CTA form prefill, CTA link prefill, analytics dataLayer, and builder"), "production docs should describe all render-smoke page types");
  assert(docs.includes("CTA form prefill"), "production docs should document CTA form prefill render coverage");
  assert(docs.includes("CTA link prefill"), "production docs should document CTA link prefill render coverage");
  assert(docs.includes("analytics dataLayer"), "production docs should document analytics render coverage");
  assert(docs.includes("layout smoke"), "production docs should document layout smoke render coverage");
  assert(!renderSmokeSource.includes("spawnSync"), "render smoke should launch browsers asynchronously so the local static server can answer requests");
  assert(typeof renderSmoke.findBrowserCandidates === "function", "render smoke should expose browser candidate resolution for smoke coverage");
  assert(typeof renderSmoke.browserDumpDomArgs === "function", "render smoke should expose Chrome dump-DOM args for smoke coverage");
  assert(typeof renderSmoke.probeTimeoutMs === "function", "render smoke should expose probe timeout selection for smoke coverage");

  const explicitCandidates = renderSmoke.findBrowserCandidates({ browser: process.execPath });
  const dumpDomArgs = renderSmoke.browserDumpDomArgs({
    profile: "render-smoke-profile",
    timeoutMs: 1234,
    url: "data:text/html,<main>ok</main>",
    viewport: { height: 844, width: 390 },
    virtualTimeBudgetMs: 5678
  });
  const probeDumpDomArgs = renderSmoke.browserDumpDomArgs({
    profile: "render-smoke-profile",
    timeoutMs: 1234,
    url: "data:text/html,<main>ok</main>",
    viewport: { height: 844, width: 390 },
    virtualTimeBudgetMs: 0
  });

  assert(explicitCandidates.length === 1 && explicitCandidates[0] === process.execPath, "render smoke should only try the explicit browser path when --browser is provided");
  assert(dumpDomArgs.includes("--headless"), "Chrome dump-DOM args should use standard headless mode");
  assert(dumpDomArgs.includes("--timeout=1234"), "Chrome dump-DOM args should include a browser-side timeout");
  assert(dumpDomArgs.includes("--virtual-time-budget=5678"), "Chrome dump-DOM args should preserve the requested virtual-time budget");
  assert(!probeDumpDomArgs.some((arg) => arg.indexOf("--virtual-time-budget") === 0), "Chrome probe args should omit virtual-time budget when it is not needed");
  assert(renderSmoke.probeTimeoutMs({ browser: process.execPath, timeoutMs: 30000 }) === 30000, "explicit render smoke browser probe should respect the requested timeout");
  assert(renderSmoke.probeTimeoutMs({ browser: "", timeoutMs: 30000 }) === 4000, "auto-discovered render smoke probes should keep the short local fallback timeout");
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

function runLaunchChecklistDocSmoke() {
  const path = "docs/launch-checklist.md";

  assert(fs.existsSync(path), "launch checklist doc is missing");

  const checklist = loadText(path);
  const readme = loadText("README.md");
  const productionDocs = loadText("docs/production-readiness.md");
  const playbook = loadText("docs/staff-playbook.md");
  const requiredPhrases = [
    "Launch Checklist",
    "Preflight",
    "WordPress",
    "Gravity Forms",
    "Analytics",
    "Social Preview",
    "Staff Pilot",
    "Go/No-Go",
    "node check-production.js",
    "node hosted-smoke.js",
    "GTM Preview",
    "GA4 DebugView"
  ];

  requiredPhrases.forEach((phrase) => {
    assert(checklist.includes(phrase), `launch checklist missing ${phrase}`);
  });

  assert(readme.includes(path), "README should link the launch checklist");
  assert(productionDocs.includes(path), "production readiness docs should link the launch checklist");
  assert(playbook.includes(path), "staff playbook should link the launch checklist");
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
    "wrapped_chapter_slug",
    "wrapped_url",
    "It does not put the full story JSON or metrics in the URL",
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
    "Use **Open review form** first when your builder link includes one",
    "chapter context, not the full JSON packet",
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

function runStaffSubmissionIntakeDocSmoke() {
  const path = "docs/staff-submission-intake.md";

  assert(fs.existsSync(path), "staff submission intake setup doc is missing");

  const intakeDoc = loadText(path);
  const readme = loadText("README.md");
  const playbook = loadText("docs/staff-playbook.md");
  const productionDocs = loadText("docs/production-readiness.md");
  const dataContract = loadText("docs/data-contract.md");
  const requiredPhrases = [
    "Staff Submission Intake Setup",
    "Recommended Pilot Flow",
    "Gravity Forms Fields",
    "wrapped_submission",
    "public final-card CTA",
    "wrapped_chapter_slug",
    "Do not depend on URL prefill for the full JSON packet",
    "Staff Builder Link",
    "Message To Staff",
    "Reviewing Returned Submissions",
    "node review-builder-submissions.js",
    "node merge-builder-submission.js",
    "Review Rules"
  ];

  requiredPhrases.forEach((phrase) => {
    assert(intakeDoc.includes(phrase), `staff submission intake doc missing ${phrase}`);
  });

  assert(readme.includes(path), "README should link the staff submission intake setup doc");
  assert(playbook.includes(path), "staff playbook should link the staff submission intake setup doc");
  assert(productionDocs.includes(path), "production readiness docs should link the staff submission intake setup doc");
  assert(productionDocs.includes("NCSY.org should own the public page and Gravity Forms shell"), "production docs should document the WordPress/GitHub Pages hosting split");
  assert(productionDocs.includes("GitHub Pages can remain the static asset and JSON host"), "production docs should document GitHub Pages as the static JSON host");
  assert(productionDocs.includes("Do not pass the full story JSON, config JSON, metrics object, or builder submission packet in a query string"), "production docs should ban URL-passing full JSON packets");
  assert(intakeDoc.includes("Do not pass the full story JSON, config JSON, metrics object, or builder submission packet in a query string"), "intake docs should ban URL-passing full JSON packets");
  assert(dataContract.includes("Do not pass the full story JSON, config JSON, metrics object, or builder submission packet in a query string"), "data contract should ban URL-passing full JSON packets");
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
  const collidingCustomIdReport = dataValidator.validateConfig({
    version: 1,
    year: "2026",
    chapters: {
      baltimore: {
        custom_cards: [
          {
            id: "final",
            type: "text",
            headline: "Custom final"
          },
          {
            id: "Final Share",
            type: "text",
            headline: "Custom final alias"
          },
          {
            id: "local-note",
            type: "text",
            headline: "Local note"
          },
          {
            id: "local note",
            type: "text",
            headline: "Duplicate local note"
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
  const oversizedCtaPayloadReport = dataValidator.validateConfig({
    version: 1,
    year: "2026",
    defaults: {
      cta_href: "https://ncsy.org/wrapped-interest/?wrapped_submission=%7B%22cards%22%3A%5B%7B%22headline%22%3A%22Too%20much%20JSON%22%7D%5D%7D"
    },
    chapters: {
      baltimore: {
        ctaHref: "https://ncsy.org/wrapped-interest/?wrapped_config=%7B%22events_hosted%22%3A338%7D"
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
  assert(!collidingCustomIdReport.ok && collidingCustomIdReport.errors.some((error) => error.includes("custom_cards[0].id cannot use generated card id")), "custom cards should not reuse generated card ids");
  assert(!collidingCustomIdReport.ok && collidingCustomIdReport.errors.some((error) => error.includes("custom_cards[1].id cannot use generated card id")), "custom card aliases should not reuse generated card ids");
  assert(!collidingCustomIdReport.ok && collidingCustomIdReport.errors.some((error) => error.includes("Duplicate custom_cards id")), "duplicate custom card ids should fail validation");
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
  assert(!oversizedCtaPayloadReport.ok && oversizedCtaPayloadReport.errors.some((error) => error.includes("config.defaults.cta_href") && error.includes("short wrapped_* context params")), "default CTA href should reject JSON submission params");
  assert(!oversizedCtaPayloadReport.ok && oversizedCtaPayloadReport.errors.some((error) => error.includes("config chapter \"baltimore\".ctaHref") && error.includes("short wrapped_* context params")), "chapter CTA href should reject JSON config params");
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
  runRuntimeUrlSafetySmoke();
  runAnalyticsDocsSmoke();
  runStoryScopeSmoke();
  runScopedStoryValidationSmoke();
  runBuilderFutureScopeSmoke();
  runBuilderProtectedCardsSmoke();
  runBuilderSubmissionSmoke();
  runBuilderPilotLinkUrlSmoke();
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
  runWordPressSmokeScriptSmoke();
  runRenderSmokeScriptSmoke();
  runReadmeSmoke();
  runStaffPlaybookSmoke();
  runLaunchChecklistDocSmoke();
  runDataContractDocSmoke();
  runPilotStaffGuideSmoke();
  runStaffSubmissionIntakeDocSmoke();
  runStaffSubmissionPrivacySmoke();

  console.log("qa smoke ok");
}

main();
