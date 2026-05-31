const fs = require("fs");
const api = require("./jsu-wrapped.js");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
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

function main() {
  const records = loadJson("sample-wrapped-2026.json");
  const config = loadJson("wrapped-config-2026.json");

  runLayeredVariantSmoke();
  runPickerSmoke(records, config);
  runHiddenVariantSmoke();
  runSampleVariantSmoke(records, config);
  runAnalyticsSmoke();
  runStoryScopeSmoke();
  runFallbackSvgSmoke(records, config);

  console.log("qa smoke ok");
}

main();
