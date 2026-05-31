(function () {
  "use strict";

  var DATA_URL = "./sample-wrapped-2026.json?v=builder1";
  var CONFIG_URL = "./wrapped-config-2026.json?v=builder1";
  var CARD_IDS = [
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
  ];
  var CARD_LABELS = {
    cover: "Cover",
    events: "Events hosted",
    reach: "Teen reach",
    moments: "Engagement moments",
    new: "New teens",
    repeat: "Repeat engagement",
    biggest: "Biggest event",
    persona: "Chapter persona",
    movement: "Bigger movement",
    final: "Final share card"
  };
  var METRIC_FIELDS = [
    ["events_hosted", "Events hosted"],
    ["unique_teens", "Unique teens"],
    ["engagement_moments", "Engagement moments"],
    ["new_teens", "New teens"],
    ["repeat_attendee_rate_label", "Repeat rate label"],
    ["largest_event_attendance", "Largest event attendance"],
    ["largest_event_name", "Largest event name"],
    ["schools_represented", "Schools represented"],
    ["learning_sessions", "Learning sessions"],
    ["shabbatons", "Shabbatons"],
    ["region_unique_teens", "Region teens reached"],
    ["region_schools_represented", "Region schools"],
    ["national_engagement_moments", "National engagement moments"]
  ];
  var METRIC_FIELD_LABELS = METRIC_FIELDS.reduce(function (map, item) {
    map[item[0]] = item[1];
    return map;
  }, {});
  var CARD_METRIC_FIELDS = {
    events: ["events_hosted"],
    reach: ["unique_teens", "new_teens"],
    moments: ["engagement_moments"],
    new: ["new_teens"],
    repeat: ["repeat_attendee_rate_label", "unique_teens"],
    biggest: ["largest_event_name", "largest_event_attendance", "schools_represented"],
    persona: ["learning_sessions", "shabbatons"],
    movement: ["region_unique_teens", "region_schools_represented", "national_engagement_moments"],
    final: ["events_hosted", "unique_teens", "engagement_moments", "new_teens", "repeat_attendee_rate_label"]
  };
  var CARD_TOKEN_FIELDS = {
    cover: ["chapter_name", "year_label", "region_name", "school_name"],
    events: ["events_hosted", "chapter_name"],
    reach: ["unique_teens", "new_teens"],
    moments: ["engagement_moments"],
    new: ["new_teens", "chapter_name"],
    repeat: ["repeat_attendee_rate_label", "unique_teens"],
    biggest: ["largest_event_name", "largest_event_attendance", "schools_represented", "most_active_month"],
    persona: ["chapter_persona", "chapter_line", "top_program_type", "most_active_month", "learning_sessions", "shabbatons"],
    movement: ["region_unique_teens", "region_schools_represented", "national_engagement_moments"],
    final: ["chapter_name", "year_label", "events_hosted", "unique_teens", "engagement_moments", "new_teens", "repeat_attendee_rate_label", "chapter_persona"]
  };

  var state = {
    records: [],
    config: null,
    regionSlug: "",
    chapterSlug: "",
    scope: "chapter",
    previewCardId: "cover",
    previewTimer: null
  };

  function $(selector) {
    return document.querySelector(selector);
  }

  function $all(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function slugify(value) {
    return String(value || "jsu-wrapped")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "jsu-wrapped";
  }

  function hasValue(value) {
    return value !== null && value !== undefined && String(value).trim() !== "";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function fetchJson(url) {
    var response = await fetch(url, { credentials: "same-origin" });

    if (!response.ok) {
      throw new Error("Could not load " + url);
    }

    return response.json();
  }

  function ensureConfigShape(config) {
    var next = config && typeof config === "object" && !Array.isArray(config) ? config : {};

    next.version = next.version || 1;
    next.year = next.year || "2026";
    next.defaults = next.defaults && typeof next.defaults === "object" ? next.defaults : {};
    next.regions = next.regions && typeof next.regions === "object" && !Array.isArray(next.regions) ? next.regions : {};
    next.chapters = next.chapters && typeof next.chapters === "object" && !Array.isArray(next.chapters) ? next.chapters : {};

    return next;
  }

  function getRegions() {
    var map = {};

    state.records.forEach(function (record) {
      var name = record.region_name || "Other chapters";
      var slug = slugify(name);

      if (!map[slug]) {
        map[slug] = {
          slug: slug,
          name: name,
          records: []
        };
      }

      map[slug].records.push(record);
    });

    return Object.keys(map).sort(function (a, b) {
      return map[a].name.localeCompare(map[b].name);
    }).map(function (slug) {
      map[slug].records.sort(function (a, b) {
        return String(a.chapter_name || "").localeCompare(String(b.chapter_name || ""));
      });

      return map[slug];
    });
  }

  function getActiveRegion() {
    var regions = getRegions();

    return regions.filter(function (region) {
      return region.slug === state.regionSlug;
    })[0] || regions[0] || null;
  }

  function getActiveRecord() {
    return state.records.filter(function (record) {
      return record.chapter_slug === state.chapterSlug;
    })[0] || state.records[0] || null;
  }

  function ensureRegionSection() {
    var region = getActiveRegion();
    var slug = region ? region.slug : state.regionSlug;

    if (!slug) {
      return {};
    }

    state.config.regions[slug] = state.config.regions[slug] || {};
    return state.config.regions[slug];
  }

  function ensureChapterSection() {
    var record = getActiveRecord();
    var slug = record ? record.chapter_slug : state.chapterSlug;

    if (!slug) {
      return {};
    }

    state.config.chapters[slug] = state.config.chapters[slug] || {};
    return state.config.chapters[slug];
  }

  function getActiveSection() {
    return state.scope === "region" ? ensureRegionSection() : ensureChapterSection();
  }

  function setValue(selector, value) {
    var node = $(selector);

    if (node) {
      node.value = value || "";
    }
  }

  function renderSelectors() {
    var regions = getRegions();
    var region = getActiveRegion() || regions[0];
    var regionSelect = $("[data-builder-region]");
    var chapterSelect = $("[data-builder-chapter]");
    var scopeSelect = $("[data-builder-scope]");

    if (!state.regionSlug && region) {
      state.regionSlug = region.slug;
    }

    if (!state.chapterSlug && region && region.records[0]) {
      state.chapterSlug = region.records[0].chapter_slug;
    }

    regionSelect.innerHTML = regions.map(function (item) {
      return '<option value="' + escapeHtml(item.slug) + '"' + (item.slug === state.regionSlug ? " selected" : "") + ">" + escapeHtml(item.name) + " (" + item.records.length + ")</option>";
    }).join("");

    region = getActiveRegion() || regions[0];
    chapterSelect.innerHTML = (region ? region.records : []).map(function (record) {
      return '<option value="' + escapeHtml(record.chapter_slug) + '"' + (record.chapter_slug === state.chapterSlug ? " selected" : "") + ">" + escapeHtml(record.chapter_name || record.chapter_slug) + "</option>";
    }).join("");

    scopeSelect.value = state.scope;
  }

  function renderBasicFields() {
    var section = getActiveSection();

    $all("[data-builder-field]").forEach(function (field) {
      field.value = section[field.getAttribute("data-builder-field")] || "";
    });
  }

  function hiddenCards(section) {
    return Array.isArray(section.hidden_cards) ? section.hidden_cards : [];
  }

  function setHiddenCard(section, cardId, isHidden) {
    var list = hiddenCards(section).filter(function (id) {
      return id !== cardId;
    });

    if (isHidden) {
      list.push(cardId);
    }

    section.hidden_cards = list;
  }

  function ensureCardOverride(section, cardId) {
    section.card_overrides = section.card_overrides || {};
    section.card_overrides[cardId] = section.card_overrides[cardId] || {};
    return section.card_overrides[cardId];
  }

  function ensureRecordOverrides(section) {
    section.record_overrides = section.record_overrides && typeof section.record_overrides === "object" ? section.record_overrides : {};
    return section.record_overrides;
  }

  function coerceMetricValue(value, original) {
    var text = String(value || "").trim();

    if (!text) {
      return "";
    }

    if (/%$/.test(text) || /[A-Za-z]/.test(text)) {
      return text;
    }

    var numeric = Number(text.replace(/,/g, ""));

    if (isFinite(numeric) && typeof original === "number") {
      return numeric;
    }

    if (isFinite(numeric) && /^-?\d+(?:\.\d+)?$/.test(text.replace(/,/g, ""))) {
      return numeric;
    }

    return text;
  }

  function formatMetricValue(value) {
    if (!hasValue(value)) {
      return "";
    }

    var text = String(value).trim();
    var numeric = Number(text.replace(/,/g, ""));

    if (typeof value === "number" || (isFinite(numeric) && /^-?\d+(?:,\d{3})*(?:\.\d+)?$/.test(text))) {
      return new Intl.NumberFormat("en-US").format(numeric);
    }

    return text;
  }

  function metricDisplayValue(record, key) {
    var value = record && record[key];

    if (!hasValue(value)) {
      return "";
    }

    if (key === "largest_event_name" || key === "repeat_attendee_rate_label" || key === "chapter_name" || key === "region_name" || key === "school_name" || key === "year_label" || key === "school_year" || key === "chapter_persona" || key === "chapter_line" || key === "top_program_type" || key === "most_active_month") {
      return String(value).trim();
    }

    return formatMetricValue(value);
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function uniqueList(values) {
    return (values || []).filter(function (value, index, list) {
      return hasValue(value) && list.indexOf(value) === index;
    });
  }

  function getEffectiveRecord(record) {
    if (!window.JSUWrapped || !window.JSUWrapped.createEffectiveRecord || !record) {
      return record || {};
    }

    return window.JSUWrapped.createEffectiveRecord(record, getStoryConfig(record));
  }

  function getCardMetricFields(cardId) {
    return (CARD_METRIC_FIELDS[cardId] || []).filter(function (key, index, list) {
      return METRIC_FIELD_LABELS[key] && list.indexOf(key) === index;
    });
  }

  function getCardTokenFields(cardId) {
    return uniqueList((CARD_TOKEN_FIELDS[cardId] || []).concat(["chapter_name", "region_name", "year_label"]));
  }

  function shouldTokenizeValue(value) {
    var text = String(value || "").trim();

    if (text.length < 2) {
      return false;
    }

    if (/^-?\d$/.test(text)) {
      return false;
    }

    return true;
  }

  function replaceTokenCandidate(text, fromValue, token) {
    var escaped = escapeRegExp(fromValue);

    if (/^[\d,.\-%]+$/.test(String(fromValue))) {
      return String(text).replace(new RegExp("(^|[^0-9])(" + escaped + ")(?![0-9])", "g"), function (match, prefix) {
        return prefix + token;
      });
    }

    return String(text).replace(new RegExp(escaped, "g"), token);
  }

  function tokenizeMetricText(value, record, cardId) {
    var output = String(value || "");
    var effectiveRecord = getEffectiveRecord(record);
    var sourceRecords = [effectiveRecord, record || {}];
    var candidates = [];

    getCardTokenFields(cardId).forEach(function (key) {
      var values = [];

      sourceRecords.forEach(function (source) {
        values.push(metricDisplayValue(source, key));

        if (hasValue(source && source[key])) {
          values.push(String(source[key]).trim());
        }
      });

      uniqueList(values).forEach(function (fromValue) {
        if (shouldTokenizeValue(fromValue)) {
          candidates.push({
            from: fromValue,
            token: "{" + key + "}"
          });
        }
      });
    });

    candidates.sort(function (a, b) {
      return b.from.length - a.from.length;
    });

    candidates.forEach(function (candidate) {
      output = replaceTokenCandidate(output, candidate.from, candidate.token);
    });

    return output;
  }

  function getStoryConfig(record) {
    if (!window.JSUWrapped || !window.JSUWrapped.resolveStoryConfig || !record) {
      return {};
    }

    return window.JSUWrapped.resolveStoryConfig(state.config, record);
  }

  function getCardsForRecord(record, options) {
    var storyConfig = getStoryConfig(record);
    var cardConfig = Object.assign({}, storyConfig);

    if (options && options.generatedOnly) {
      cardConfig.hidden_cards = [];
      cardConfig.custom_cards = [];
    }

    if (!window.JSUWrapped || !window.JSUWrapped.createEffectiveRecord || !window.JSUWrapped.createCards || !record) {
      return [];
    }

    return window.JSUWrapped.createCards(window.JSUWrapped.createEffectiveRecord(record, storyConfig), {
      storyConfig: cardConfig,
      assetBase: "./assets/",
      ctaLabel: storyConfig.cta_label || storyConfig.ctaLabel || "",
      ctaTarget: storyConfig.cta_target || storyConfig.ctaTarget || "",
      ctaHref: storyConfig.cta_href || storyConfig.ctaHref || ""
    });
  }

  function cardsById(cards) {
    var output = {};

    (cards || []).forEach(function (card) {
      output[card.id] = card;
    });

    return output;
  }

  function cardFieldValue(card, field) {
    if (!card) {
      return "";
    }

    if (field === "headline") {
      return card.headline || card.displayHeadline || "";
    }

    if (field === "eyebrow") {
      return card.eyebrow || card.displayEyebrow || "";
    }

    return card[field] || "";
  }

  function setPreviewCard(cardId) {
    if (!cardId) {
      return;
    }

    state.previewCardId = cardId;
    markPreviewRows();
    schedulePreview();
  }

  function markPreviewRows() {
    $all("[data-builder-preview-card]").forEach(function (row) {
      row.classList.toggle("builder-card-row--active", row.getAttribute("data-builder-preview-card") === state.previewCardId);
    });
  }

  function renderCardEditor() {
    var section = getActiveSection();
    var overrides = section.card_overrides || {};
    var record = getActiveRecord() || {};
    var metricOverrides = section.record_overrides && typeof section.record_overrides === "object" ? section.record_overrides : {};
    var hidden = hiddenCards(section);
    var container = $("[data-builder-card-editor]");
    var generatedCards = cardsById(getCardsForRecord(record, { generatedOnly: true }));

    container.innerHTML = CARD_IDS.map(function (cardId) {
      var override = overrides[cardId] || {};
      var isHidden = hidden.indexOf(cardId) !== -1;
      var card = generatedCards[cardId] || {};
      var copyField = cardId === "cover" ? "markerText" : "subtext";
      var copyLabel = cardId === "cover" ? "Footer line" : "Subtext";
      var headline = hasValue(override.headline) ? tokenizeMetricText(override.headline, record, cardId) : cardFieldValue(card, "headline");
      var eyebrow = hasValue(override.eyebrow) ? tokenizeMetricText(override.eyebrow, record, cardId) : cardFieldValue(card, "eyebrow");
      var subtext = hasValue(override[copyField]) ? tokenizeMetricText(override[copyField], record, cardId) : cardFieldValue(card, copyField);

      return [
        '<article class="builder-card-row" data-builder-preview-card="' + escapeHtml(cardId) + '">',
        '<header>',
        '<strong>' + escapeHtml(CARD_LABELS[cardId]) + "</strong>",
        '<label class="builder-toggle"><input type="checkbox" data-builder-card-hidden="' + escapeHtml(cardId) + '"' + (isHidden ? " checked" : "") + "> Hide</label>",
        "</header>",
        '<div class="builder-card-fields">',
        '<label>Headline<input data-builder-card-field="headline" data-builder-card-id="' + escapeHtml(cardId) + '" value="' + escapeHtml(headline) + '"></label>',
        '<label>Eyebrow<input data-builder-card-field="eyebrow" data-builder-card-id="' + escapeHtml(cardId) + '" value="' + escapeHtml(eyebrow) + '"></label>',
        '<label>' + escapeHtml(copyLabel) + '<textarea data-builder-card-field="' + escapeHtml(copyField) + '" data-builder-card-id="' + escapeHtml(cardId) + '">' + escapeHtml(subtext) + "</textarea></label>",
        "</div>",
        renderInlineMetricEditor(cardId, record, metricOverrides),
        renderTokenHint(cardId),
        "</article>"
      ].join("");
    }).join("");

    markPreviewRows();
  }

  function renderInlineMetricEditor(cardId, record, overrides) {
    var keys = getCardMetricFields(cardId);
    var isActive = keys.some(function (key) {
      return hasValue(overrides[key]);
    });

    if (!keys.length) {
      return "";
    }

    return [
      '<details class="builder-inline-metrics"' + (isActive ? " open" : "") + ">",
      "<summary>Correct stats used on this screen</summary>",
      '<div class="builder-metric-grid">',
      keys.map(function (key) {
        var official = hasValue(record[key]) ? record[key] : "";
        var value = hasValue(overrides[key]) ? overrides[key] : "";

        return [
          '<label class="' + (hasValue(value) ? "builder-metric-field builder-metric-field--active" : "builder-metric-field") + '">',
          '<span>' + escapeHtml(METRIC_FIELD_LABELS[key] || key) + "</span>",
          '<input data-builder-metric-field="' + escapeHtml(key) + '" value="' + escapeHtml(value) + '" placeholder="' + escapeHtml(official) + '">',
          '<em>Official: ' + escapeHtml(hasValue(official) ? official : "not set") + "</em>",
          "</label>"
        ].join("");
      }).join(""),
      "</div>",
      "</details>"
    ].join("");
  }

  function renderTokenHint(cardId) {
    var fields = getCardTokenFields(cardId).filter(function (key) {
      return METRIC_FIELD_LABELS[key];
    });

    if (!fields.length) {
      return "";
    }

    return '<p class="builder-token-hint">Copy can use ' + fields.slice(0, 4).map(function (key) {
      return "<code>{" + escapeHtml(key) + "}</code>";
    }).join(" ") + " so edited text stays tied to corrected stats.</p>";
  }

  function ensureCustomCards(section) {
    section.custom_cards = Array.isArray(section.custom_cards) ? section.custom_cards : [];
    return section.custom_cards;
  }

  function renderCustomCards() {
    var section = getActiveSection();
    var cards = ensureCustomCards(section);
    var container = $("[data-builder-custom-list]");

    if (!cards.length) {
      container.innerHTML = '<p class="builder-warning builder-warning--ok">No custom screens yet. Add one when the local story needs a human touch.</p>';
      return;
    }

    container.innerHTML = cards.map(function (card, index) {
      var type = card.type || "text";

      return [
        '<article class="builder-custom-card" data-builder-preview-card="' + escapeHtml(card.id || "") + '">',
        '<header>',
        '<strong>Custom screen ' + (index + 1) + "</strong>",
        '<button type="button" data-builder-action="delete-custom" data-custom-index="' + index + '">Remove</button>',
        "</header>",
        '<div class="builder-custom-fields">',
        '<label>Type<select data-custom-index="' + index + '" data-custom-field="type">',
        '<option value="text"' + (type === "text" ? " selected" : "") + ">Text</option>",
        '<option value="metric"' + (type === "metric" ? " selected" : "") + ">Metric</option>",
        '<option value="media"' + (type === "media" ? " selected" : "") + ">Media</option>",
        "</select></label>",
        '<label>Placement<select data-custom-index="' + index + '" data-custom-field="placement">' + placementOptions(card.placement) + "</select></label>",
        '<label>Eyebrow<input data-custom-index="' + index + '" data-custom-field="eyebrow" value="' + escapeHtml(card.eyebrow || "") + '"></label>',
        '<label>Headline<input data-custom-index="' + index + '" data-custom-field="headline" value="' + escapeHtml(card.headline || "") + '"></label>',
        '<label>Value<input data-custom-index="' + index + '" data-custom-field="value" value="' + escapeHtml(card.value || "") + '"></label>',
        '<label>Label<input data-custom-index="' + index + '" data-custom-field="label" value="' + escapeHtml(card.label || "") + '"></label>',
        '<label>Image URL<input data-custom-index="' + index + '" data-custom-field="image_url" value="' + escapeHtml(card.image_url || "") + '"></label>',
        '<label>Copy<textarea data-custom-index="' + index + '" data-custom-field="subtext">' + escapeHtml(card.subtext || "") + "</textarea></label>",
        "</div>",
        "</article>"
      ].join("");
    }).join("");

    markPreviewRows();
  }

  function renderChangeSummary() {
    var section = getActiveSection();
    var record = getActiveRecord() || {};
    var overrides = section.record_overrides && typeof section.record_overrides === "object" ? section.record_overrides : {};
    var container = $("[data-builder-change-summary]");
    var keys = Object.keys(overrides).filter(function (key) {
      return hasValue(overrides[key]);
    });

    if (!container) {
      return;
    }

    if (!keys.length) {
      container.innerHTML = '<p class="builder-warning builder-warning--ok">No stat corrections at this scope. Open a generated screen and correct only the stats that need a local adjustment.</p>';
      return;
    }

    container.innerHTML = [
      '<div class="builder-change-list">',
      keys.map(function (key) {
        var official = metricDisplayValue(record, key) || "not set";
        var corrected = metricDisplayValue(overrides, key) || String(overrides[key]);

        return [
          '<article class="builder-change-item">',
          "<span>" + escapeHtml(METRIC_FIELD_LABELS[key] || key) + "</span>",
          "<strong>" + escapeHtml(official) + " -> " + escapeHtml(corrected) + "</strong>",
          '<button type="button" data-builder-action="clear-metric" data-metric-key="' + escapeHtml(key) + '">Clear</button>',
          "</article>"
        ].join("");
      }).join(""),
      "</div>"
    ].join("");
  }

  function placementOptions(selected) {
    var values = [
      ["after_cover", "After cover"],
      ["after_events", "After events"],
      ["after_persona", "After persona"],
      ["before_final", "Before final"],
      ["end", "After final"]
    ];

    return values.map(function (item) {
      return '<option value="' + item[0] + '"' + (item[0] === selected ? " selected" : "") + ">" + item[1] + "</option>";
    }).join("");
  }

  function renderWarnings() {
    var record = getActiveRecord();
    var section = getActiveSection();
    var warnings = [];
    var effective = window.JSUWrapped && window.JSUWrapped.resolveStoryConfig ? window.JSUWrapped.resolveStoryConfig(state.config, record) : section;
    var customCards = section.custom_cards || [];
    var hidden = hiddenCards(section);

    if (hidden.indexOf("final") !== -1) {
      warnings.push("The final share card is hidden. That removes the strongest CTA/share moment.");
    }

    if (section.record_overrides && Object.keys(section.record_overrides).length) {
      warnings.push("Metric corrections are active for this " + state.scope + ". Generated text and stats will use the corrected values.");
    }

    if (!hasValue(effective.cta_label || effective.ctaLabel)) {
      warnings.push("No CTA label is set at this scope or inherited scopes.");
    }

    customCards.forEach(function (card, index) {
      if (String(card.headline || "").length > 68) {
        warnings.push("Custom screen " + (index + 1) + " has a long headline that may wrap tightly on phones.");
      }

      if ((card.type === "metric" || card.type === "media") && !hasValue(card.value) && card.type === "metric") {
        warnings.push("Custom metric screen " + (index + 1) + " needs a value.");
      }

      if (card.type === "media" && !hasValue(card.image_url)) {
        warnings.push("Custom media screen " + (index + 1) + " needs an image URL.");
      }
    });

    if (!warnings.length) {
      warnings.push("Looks clean for this scope. Still do a phone preview before publishing.");
    }

    $("[data-builder-warnings]").innerHTML = warnings.map(function (warning, index) {
      return '<div class="builder-warning' + (!index && warnings.length === 1 ? " builder-warning--ok" : "") + '">' + escapeHtml(warning) + "</div>";
    }).join("");
  }

  function renderExport() {
    var json = JSON.stringify(state.config, null, 2);
    var exportField = $("[data-builder-export]");

    exportField.value = json;
    exportField.textContent = json;
  }

  function renderPreview() {
    var preview = document.getElementById("jsu-wrapped");
    var record = getActiveRecord();
    var cards = getCardsForRecord(record);
    var previewIndex = 0;

    if (!preview || !record || !window.JSUWrapped) {
      return;
    }

    cards.some(function (card, index) {
      if (card.id === state.previewCardId) {
        previewIndex = index;
        return true;
      }

      return false;
    });

    $("[data-builder-preview-title]").textContent = (record.chapter_name || record.chapter_slug) + " Wrapped";

    window.JSUWrapped.init(preview, {
      records: state.records,
      config: state.config,
      chapter: record.chapter_slug,
      url: window.location.origin + window.location.pathname + "?chapter=" + encodeURIComponent(record.chapter_slug),
      assetBase: "./assets/",
      initialIndex: previewIndex,
      autoplay: false,
      analytics: false,
      metadata: false
    });
  }

  function schedulePreview() {
    window.clearTimeout(state.previewTimer);
    state.previewTimer = window.setTimeout(renderPreview, 120);
  }

  function renderAll() {
    renderSelectors();
    renderBasicFields();
    renderCardEditor();
    renderChangeSummary();
    renderCustomCards();
    renderWarnings();
    renderExport();
    schedulePreview();
  }

  function addCustomCard(type) {
    var section = getActiveSection();
    var cards = ensureCustomCards(section);
    var id = "custom-" + Date.now().toString(36);

    cards.push({
      id: id,
      type: type,
      placement: "before_final",
      eyebrow: type === "metric" ? "Custom metric" : type === "media" ? "Custom media" : "Custom note",
      headline: type === "metric" ? "A local stat worth celebrating" : type === "media" ? "A moment from the year" : "A note from the chapter",
      value: type === "metric" ? "100" : "",
      label: type === "metric" ? "moments" : "",
      image_url: "",
      subtext: "Add the local story here."
    });

    state.previewCardId = id;
    renderAll();
  }

  function updateField(event) {
    var field = event.target;
    var section = getActiveSection();

    if (field.matches("[data-builder-field]")) {
      var key = field.getAttribute("data-builder-field");

      if (hasValue(field.value)) {
        section[key] = field.value;
      } else {
        delete section[key];
      }

      renderWarnings();
      renderExport();
      schedulePreview();
      return;
    }

    if (field.matches("[data-builder-card-hidden]")) {
      setHiddenCard(section, field.getAttribute("data-builder-card-hidden"), field.checked);
      renderWarnings();
      renderExport();
      schedulePreview();
      return;
    }

    if (field.matches("[data-builder-card-field]")) {
      var cardId = field.getAttribute("data-builder-card-id");
      var override = ensureCardOverride(section, cardId);
      var overrideKey = field.getAttribute("data-builder-card-field");
      var storedValue = tokenizeMetricText(field.value, getActiveRecord(), cardId);

      if (hasValue(field.value)) {
        override[overrideKey] = storedValue;
        if (overrideKey === "headline") {
          override.displayHeadline = storedValue;
        }

        if (event.type === "focusout") {
          field.value = storedValue;
        }
      } else {
        delete override[overrideKey];
        if (overrideKey === "headline") {
          delete override.displayHeadline;
        }
      }

      renderWarnings();
      renderExport();
      schedulePreview();
      return;
    }

    if (field.matches("[data-builder-metric-field]")) {
      var metricKey = field.getAttribute("data-builder-metric-field");
      var overrides = ensureRecordOverrides(section);
      var record = getActiveRecord() || {};

      if (hasValue(field.value)) {
        overrides[metricKey] = coerceMetricValue(field.value, record[metricKey]);
      } else {
        delete overrides[metricKey];
      }

      if (!Object.keys(overrides).length) {
        delete section.record_overrides;
      }

      if (event.type !== "input") {
        renderCardEditor();
      }

      renderChangeSummary();
      renderWarnings();
      renderExport();
      schedulePreview();
      return;
    }

    if (field.matches("[data-custom-field]")) {
      var cards = ensureCustomCards(section);
      var index = Number(field.getAttribute("data-custom-index"));
      var card = cards[index];
      var customKey = field.getAttribute("data-custom-field");

      if (!card) {
        return;
      }

      if (hasValue(field.value)) {
        card[customKey] = field.value;
      } else {
        delete card[customKey];
      }

      if (customKey === "headline") {
        card.displayHeadline = field.value;
      }

      renderWarnings();
      renderExport();
      schedulePreview();
    }
  }

  function bindEvents() {
    document.addEventListener("input", updateField);
    document.addEventListener("focusout", updateField);
    document.addEventListener("change", function (event) {
      var target = event.target;

      if (target.matches("[data-builder-region]")) {
        state.regionSlug = target.value;
        var region = getActiveRegion();
        state.chapterSlug = region && region.records[0] ? region.records[0].chapter_slug : "";
        renderAll();
        return;
      }

      if (target.matches("[data-builder-chapter]")) {
        state.chapterSlug = target.value;
        renderAll();
        return;
      }

      if (target.matches("[data-builder-scope]")) {
        state.scope = target.value;
        renderAll();
        return;
      }

      updateField(event);
    });

    document.addEventListener("focusin", function (event) {
      var previewRow = event.target && event.target.closest && event.target.closest("[data-builder-preview-card]");

      if (previewRow) {
        setPreviewCard(previewRow.getAttribute("data-builder-preview-card"));
      }
    });

    document.addEventListener("click", function (event) {
      var action = event.target && event.target.getAttribute("data-builder-action");
      var previewRow = event.target && event.target.closest && event.target.closest("[data-builder-preview-card]");

      if (previewRow) {
        setPreviewCard(previewRow.getAttribute("data-builder-preview-card"));
      }

      if (!action) {
        return;
      }

      if (action === "add-text") {
        addCustomCard("text");
      } else if (action === "add-metric") {
        addCustomCard("metric");
      } else if (action === "add-media") {
        addCustomCard("media");
      } else if (action === "delete-custom") {
        var section = getActiveSection();
        var cards = ensureCustomCards(section);
        cards.splice(Number(event.target.getAttribute("data-custom-index")), 1);
        renderAll();
      } else if (action === "clear-metric") {
        var metricKey = event.target.getAttribute("data-metric-key");
        var recordOverrides = ensureRecordOverrides(getActiveSection());

        delete recordOverrides[metricKey];

        if (!Object.keys(recordOverrides).length) {
          delete getActiveSection().record_overrides;
        }

        renderAll();
      } else if (action === "refresh-preview") {
        renderPreview();
      } else if (action === "copy-export") {
        navigator.clipboard.writeText(JSON.stringify(state.config, null, 2)).catch(function () {});
      }
    });
  }

  async function init() {
    var root = $("#wrapped-builder");

    try {
      state.records = await fetchJson(DATA_URL);
      state.config = ensureConfigShape(await fetchJson(CONFIG_URL));
      bindEvents();
      renderAll();
    } catch (error) {
      root.innerHTML = '<div class="builder-error">Could not load the builder data. Serve this folder from a local web server, then open <strong>builder.html</strong>. Browser file URLs usually block JSON fetches.</div>';
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
