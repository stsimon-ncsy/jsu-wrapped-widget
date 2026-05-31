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

function main() {
  const records = loadJson("sample-wrapped-2026.json");
  const config = loadJson("wrapped-config-2026.json");

  runLayeredVariantSmoke();
  runPickerSmoke(records, config);
  runHiddenVariantSmoke();
  runSampleVariantSmoke(records, config);
  runAnalyticsSmoke();

  console.log("qa smoke ok");
}

main();
