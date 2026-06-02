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
  assert(source.includes("isSafeStaticUrl(rawHref)"), "runtime should sanitize configured CTA href values before rendering");
  assert(source.includes("isSafeStaticUrl(href) ? href : \"\""), "runtime should guard CTA navigation at click time");
  assert(source.includes("CTA link is not available."), "runtime should report blocked unsafe CTA navigation without leaving the page");
  assert(safeMediaCard && safeMediaCard.imageUrl === "https://res.cloudinary.com/demo/image/upload/sample.jpg", "runtime should keep safe custom media image URLs");
  assert(unsafeMediaCard && unsafeMediaCard.imageUrl === "", "runtime should strip unsafe custom media image URLs before rendering");
  assert(source.includes("isSafeStaticUrl(rawImageUrl)"), "runtime should sanitize configured custom media image URLs");
  assert(collidingIds.filter((id) => id === "final").length === 1, "runtime should not let custom cards duplicate the generated final card id");
  assert(new Set(collidingIds).size === collidingIds.length, "runtime should dedupe custom card ids before rendering");
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
    "wrapped-builder.js": {
      status: 200,
      text: "Review form opened with chapter context. Submission JSON copied; paste it into the form before sending."
    },
    "sample-wrapped-2026.json": {
      status: 200,
      text: JSON.stringify([{ chapter_slug: "baltimore", chapter_name: "Baltimore" }])
    },
    "wrapped-config-2026.json": {
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
  const staleBuilderScriptAssets = Object.assign({}, goodAssets, {
    "wrapped-builder.js": {
      status: 200,
      text: "MAX_REVIEW_FORM_URL_LENGTH Submission JSON is prefilled in the review form"
    }
  });
  const badReport = hostedSmoke.validateHostedAssets(badAssets);
  const missingSocialPreviewReport = hostedSmoke.validateHostedAssets(missingSocialPreviewAssets);
  const wrongSocialPreviewTypeReport = hostedSmoke.validateHostedAssets(wrongSocialPreviewTypeAssets);
  const staleBuilderScriptReport = hostedSmoke.validateHostedAssets(staleBuilderScriptAssets);
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
  assert(!missingSocialPreviewReport.ok && missingSocialPreviewReport.errors.some((error) => error.includes("social preview image")), "hosted smoke validator should reject a missing social preview image");
  assert(!wrongSocialPreviewTypeReport.ok && wrongSocialPreviewTypeReport.errors.some((error) => error.includes("content type")), "hosted smoke validator should reject the wrong social preview image content type");
  assert(!staleBuilderScriptReport.ok && staleBuilderScriptReport.errors.some((error) => error.includes("builder script")), "hosted smoke validator should reject stale builder script handoff behavior");
  assert(dryRunOutput.includes("https://example.org/wrapped/"), "hosted smoke dry run should list normalized base URL");
  assert(dryRunOutput.includes("https://example.org/wrapped/wrapped-builder.js"), "hosted smoke dry run should list builder script");
  assert(dryRunOutput.includes("https://example.org/wrapped/assets/wrapped-social-preview.png"), "hosted smoke dry run should list the social preview image");
  assert(dryRunOutput.includes("https://example.org/wrapped/share/baltimore/"), "hosted smoke dry run should list Baltimore share page");
  assert(listed.includes("node --check hosted-smoke.js"), "production QA should syntax-check the hosted smoke helper");
  assert(readme.includes("node hosted-smoke.js"), "README should document hosted smoke checks");
  assert(docs.includes("node hosted-smoke.js"), "production docs should document hosted smoke checks");
  assert(docs.includes("social preview image"), "production docs should mention hosted social preview image checks");
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
  assert(dryRunOutput.includes("/builder.html"), "render smoke dry run should list the builder URL");
  assert(listed.includes("node --check render-smoke.js"), "production QA should syntax-check the render smoke helper");
  assert(listed.includes("node render-smoke.js --skip-if-missing"), "production QA should run render smoke when a browser is available");
  assert(workflow.includes("node render-smoke.js --browser \"${{ steps.chrome.outputs.chrome-path }}\" --timeout-ms 60000"), "CI enforced render smoke should allow enough time for cold headless Chrome startup");
  assert(readme.includes("node render-smoke.js --skip-if-missing"), "README should document optional headless render smoke checks");
  assert(docs.includes("node render-smoke.js --skip-if-missing"), "production docs should document optional headless render smoke checks");
  assert(docs.includes("picker, Baltimore story, and builder"), "production docs should describe all render-smoke page types");
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
  const requiredPhrases = [
    "Staff Submission Intake Setup",
    "Recommended Pilot Flow",
    "Gravity Forms Fields",
    "wrapped_submission",
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
