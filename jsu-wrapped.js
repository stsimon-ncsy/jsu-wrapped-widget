(function (root, factory) {
  var api = factory(root);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root && root.document) {
    root.JSUWrapped = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var DEFAULT_DATA_PATH = "/wp-content/uploads/wrapped/wrapped-{year}.json";
  var WIDGET_ID = "jsu-wrapped";

  function hasValue(value) {
    return value !== null && value !== undefined && String(value).trim() !== "";
  }

  function asText(value, fallback) {
    if (hasValue(value)) {
      return String(value);
    }

    return fallback || "";
  }

  function formatNumber(value) {
    if (!hasValue(value)) {
      return "";
    }

    var numeric = Number(value);

    if (isFinite(numeric)) {
      return new Intl.NumberFormat("en-US").format(numeric);
    }

    return String(value);
  }

  function getStatAnimationConfig(value) {
    if (!hasValue(value)) {
      return null;
    }

    var text = String(value).trim();
    var suffixMatch = text.match(/([^\d\s,.-]+)$/);
    var numericText = text.replace(/,/g, "").replace(/[^\d.-]/g, "");
    var target = Number(numericText);

    if (!isFinite(target)) {
      return null;
    }

    var decimalIndex = numericText.indexOf(".");

    return {
      target: target,
      suffix: suffixMatch ? suffixMatch[1] : "",
      decimals: decimalIndex === -1 ? 0 : numericText.length - decimalIndex - 1
    };
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeXml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function slugify(value) {
    return String(value || "jsu-wrapped")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "jsu-wrapped";
  }

  function getChapterSlug(url) {
    var href = url || (root && root.location && root.location.href) || "";

    try {
      return new URL(href).searchParams.get("chapter");
    } catch (error) {
      if (href.charAt(0) === "?") {
        return new URLSearchParams(href).get("chapter");
      }

      return null;
    }
  }

  function getDataUrl(container) {
    var dataset = (container && container.dataset) || {};
    var year = asText(dataset.year, String(new Date().getFullYear()));

    if (hasValue(dataset.source)) {
      return dataset.source;
    }

    return DEFAULT_DATA_PATH.replace("{year}", encodeURIComponent(year));
  }

  function findChapter(records, chapterSlug) {
    if (!Array.isArray(records) || !hasValue(chapterSlug)) {
      return null;
    }

    var requested = String(chapterSlug).trim().toLowerCase();

    for (var index = 0; index < records.length; index += 1) {
      var record = records[index];

      if (String(record && record.chapter_slug || "").trim().toLowerCase() === requested) {
        return record;
      }
    }

    return null;
  }

  function createCards(record) {
    var chapterName = asText(record.chapter_name, "Your JSU chapter");
    var yearLabel = asText(record.year_label || record.school_year, "This year");
    var regionName = asText(record.region_name, "JSU");
    var cards = [
      {
        type: "cover",
        eyebrow: "JSU Wrapped",
        headline: chapterName + ", your year is wrapped",
        subtext: yearLabel + " - " + regionName,
        badge: asText(record.school_name, "Chapter recap"),
        theme: "cover"
      }
    ];

    if (hasValue(record.events_hosted)) {
      cards.push({
        type: "stat",
        eyebrow: "Events hosted",
        headline: "You hosted " + formatNumber(record.events_hosted) + " events this year",
        stat: formatNumber(record.events_hosted),
        statLabel: "events",
        subtext: "From lunch clubs to BBQs, " + chapterName + " kept showing up.",
        theme: "events"
      });
    }

    if (hasValue(record.unique_teens)) {
      cards.push({
        type: "stat",
        eyebrow: "Teen reach",
        headline: formatNumber(record.unique_teens) + " teens were part of the story",
        stat: formatNumber(record.unique_teens),
        statLabel: "teens",
        subtext: "That's " + formatNumber(record.unique_teens) + " students who had a JSU touchpoint this year.",
        theme: "reach"
      });
    }

    if (hasValue(record.engagement_moments)) {
      cards.push({
        type: "stat",
        eyebrow: "Engagement moments",
        headline: formatNumber(record.engagement_moments) + " moments of connection",
        stat: formatNumber(record.engagement_moments),
        statLabel: "moments",
        subtext: "Every sign-in, every lunch table, every conversation - it added up.",
        theme: "moments"
      });
    }

    if (hasValue(record.new_teens)) {
      cards.push({
        type: "stat",
        eyebrow: "New faces",
        headline: formatNumber(record.new_teens) + " new teens joined this year",
        stat: formatNumber(record.new_teens),
        statLabel: "new teens",
        subtext: chapterName + " kept opening the door.",
        theme: "new"
      });
    }

    if (hasValue(record.repeat_attendee_rate_label)) {
      cards.push({
        type: "stat",
        eyebrow: "Repeat engagement",
        headline: asText(record.repeat_attendee_rate_label) + " came back again",
        stat: asText(record.repeat_attendee_rate_label),
        statLabel: "returned",
        subtext: "The best clubs do more than attract teens. They bring them back.",
        theme: "repeat"
      });
    }

    if (hasValue(record.largest_event_name) && hasValue(record.largest_event_attendance)) {
      cards.push({
        type: "stat",
        eyebrow: "Biggest event",
        headline: "Biggest moment: " + asText(record.largest_event_name),
        stat: formatNumber(record.largest_event_attendance),
        statLabel: "teens",
        subtext: formatNumber(record.largest_event_attendance) + " teens in the room. Big energy.",
        theme: "biggest"
      });
    }

    if (hasValue(record.chapter_persona) || hasValue(record.chapter_line)) {
      cards.push({
        type: "persona",
        eyebrow: "Chapter type",
        headline: "Your chapter type: " + asText(record.chapter_persona, "The Momentum Maker"),
        subtext: asText(record.chapter_line, chapterName + " made the year feel personal."),
        badge: asText(record.top_program_type || record.most_active_month, "Signature energy"),
        theme: "persona"
      });
    }

    var movementStats = [];

    if (hasValue(record.region_unique_teens)) {
      movementStats.push({
        value: formatNumber(record.region_unique_teens),
        label: "teens reached in the region"
      });
    }

    if (hasValue(record.region_schools_represented)) {
      movementStats.push({
        value: formatNumber(record.region_schools_represented),
        label: "schools represented"
      });
    }

    if (hasValue(record.national_engagement_moments)) {
      movementStats.push({
        value: formatNumber(record.national_engagement_moments) + "+",
        label: "national engagement moments"
      });
    }

    if (movementStats.length > 0) {
      cards.push({
        type: "movement",
        eyebrow: "Bigger movement",
        headline: "You were part of something bigger",
        stats: movementStats,
        subtext: "One chapter. One region. One national movement.",
        theme: "movement"
      });
    }

    cards.push({
      type: "final",
      eyebrow: "Ready to share",
      headline: chapterName + " Wrapped",
      subtext: [
        hasValue(record.events_hosted) ? formatNumber(record.events_hosted) + " events" : "",
        hasValue(record.unique_teens) ? formatNumber(record.unique_teens) + " teens" : "",
        hasValue(record.engagement_moments) ? formatNumber(record.engagement_moments) + " engagement moments" : "",
        hasValue(record.chapter_persona) ? asText(record.chapter_persona) + " energy" : "JSU energy"
      ].filter(Boolean).join(". ") + ".",
      badge: yearLabel,
      theme: "final"
    });

    return cards;
  }

  function renderProgress(currentIndex, total) {
    var html = "";

    for (var index = 0; index < total; index += 1) {
      var state = index < currentIndex ? "complete" : index === currentIndex ? "active" : "idle";
      html += '<span class="jsuw-progress-segment jsuw-progress-segment--' + state + '"><span></span></span>';
    }

    return html;
  }

  function renderStickerCloud(card) {
    var words = {
      cover: ["JSU", "2026", "Wrapped"],
      events: ["Lunch", "Club", "Showed up"],
      reach: ["New faces", "Belonging", "JSU"],
      moments: ["Stories", "Tables", "Talks"],
      new: ["Open door", "Welcome", "First time"],
      repeat: ["Again", "Back", "Real club"],
      biggest: ["Big energy", "Packed", "Moment"],
      persona: ["Type", "Vibe", "Identity"],
      movement: ["Region", "National", "Together"],
      final: ["Share", "Chapter", "Wrapped"]
    }[card.theme] || ["JSU", "NCSY", "Wrapped"];

    var html = [
      '<div class="jsuw-stickers" aria-hidden="true">',
      '<span class="jsuw-sticker jsuw-sticker--one">' + escapeHtml(words[0]) + '</span>',
      '<span class="jsuw-sticker jsuw-sticker--two">' + escapeHtml(words[1]) + '</span>',
      '<span class="jsuw-sticker jsuw-sticker--three">' + escapeHtml(words[2]) + '</span>',
      '<span class="jsuw-doodle jsuw-doodle--one"></span>',
      '<span class="jsuw-doodle jsuw-doodle--two"></span>',
      '<span class="jsuw-spark jsuw-spark--one"></span>',
      '<span class="jsuw-spark jsuw-spark--two"></span>'
    ];

    for (var index = 0; index < 18; index += 1) {
      var x = 5 + ((index * 11) % 86) + "%";
      var drift = ((index % 5) - 2) * 14 + "px";
      var delay = index * -220 + "ms";

      html.push('<span class="jsuw-confetti-piece" style="--i:' + index + ";--x:" + x + ";--dx:" + drift + ";--delay:" + delay + '"></span>');
    }

    html.push("</div>");
    return html.join("");
  }

  function renderBrandLockup() {
    return [
      '<div class="jsuw-brand-lockup" aria-label="NCSY JSU Wrapped">',
      '<span class="jsuw-brand-mark" aria-hidden="true">JSU</span>',
      '<span class="jsuw-brand-copy"><strong>NCSY / JSU</strong><em>Wrapped</em></span>',
      "</div>"
    ].join("");
  }

  function renderStatPattern(card) {
    var count = card.theme === "events" ? 38 : card.theme === "moments" ? 36 : 42;
    var html = '<div class="jsuw-stat-pattern jsuw-stat-pattern--' + escapeHtml(card.theme) + '" aria-hidden="true">';

    for (var index = 0; index < count; index += 1) {
      var x = ((index * 2.9) % 96).toFixed(2) + "%";
      var y = (12 + ((index * 7) % 68)).toFixed(2) + "%";
      var height = 24 + ((index * 11) % 68) + "px";
      var size = 20 + ((index * 13) % 30) + "px";
      var delay = index * 14 + "ms";
      var waveDelay = index * 46 + "ms";
      var bubbleDelay = index * 72 + "ms";

      html += '<span style="--i:' + index + ";--x:" + x + ";--y:" + y + ";--h:" + height + ";--s:" + size + ";--delay:" + delay + ";--wave-delay:" + waveDelay + ";--bubble-delay:" + bubbleDelay + '"></span>';
    }

    html += "</div>";
    return html;
  }

  function renderStatNumber(card, statClass) {
    var animation = getStatAnimationConfig(card.stat);
    var attributes = "";

    if (animation) {
      attributes = [
        ' data-jsuw-countup="true"',
        ' data-jsuw-stat-target="' + escapeHtml(animation.target) + '"',
        ' data-jsuw-stat-suffix="' + escapeHtml(animation.suffix) + '"',
        ' data-jsuw-stat-decimals="' + escapeHtml(animation.decimals) + '"'
      ].join("");
    }

    return '<div class="' + statClass + '"' + attributes + ">" + escapeHtml(card.stat) + "</div>";
  }

  function renderCardBody(card) {
    var headlineClass = "jsuw-headline";
    var statClass = "jsuw-stat-number";

    if (card.headline.length > 58) {
      headlineClass += " jsuw-headline--dense";
    } else if (card.headline.length > 40) {
      headlineClass += " jsuw-headline--compact";
    }

    if (hasValue(card.stat) && String(card.stat).length > 6) {
      statClass += " jsuw-stat-number--compact";
    }

    var html = [
      '<div class="jsuw-card-main">',
      renderBrandLockup(),
      '<div class="jsuw-eyebrow">' + escapeHtml(card.eyebrow || "JSU Wrapped") + "</div>",
      '<h2 class="' + headlineClass + '">' + escapeHtml(card.headline) + "</h2>"
    ];

    if (card.type === "stat") {
      html.push(
        '<div class="jsuw-stat-lockup" aria-hidden="true">',
        renderStatPattern(card),
        renderStatNumber(card, statClass),
        '<div class="jsuw-stat-label">' + escapeHtml(card.statLabel || "") + "</div>",
        "</div>"
      );
    }

    if (card.type === "movement") {
      html.push('<ul class="jsuw-movement-list">');
      card.stats.forEach(function (stat) {
        html.push(
          '<li><strong>' + escapeHtml(stat.value) + "</strong><span>" + escapeHtml(stat.label) + "</span></li>"
        );
      });
      html.push("</ul>");
    }

    if (hasValue(card.subtext)) {
      html.push('<p class="jsuw-subtext">' + escapeHtml(card.subtext) + "</p>");
    }

    if (hasValue(card.badge)) {
      html.push('<div class="jsuw-badge">' + escapeHtml(card.badge) + "</div>");
    }

    if (card.type === "final") {
      html.push(
        '<div class="jsuw-final-actions">',
        '<button class="jsuw-action-button jsuw-action-button--primary" type="button" data-jsuw-action="share">Share this recap</button>',
        '<button class="jsuw-action-button" type="button" data-jsuw-action="download">Download image</button>',
        '<p class="jsuw-action-status" data-jsuw-status aria-live="polite"></p>',
        "</div>"
      );
    }

    html.push("</div>");

    return html.join("");
  }

  function renderError(container, headline, message) {
    container.innerHTML = [
      '<div class="jsuw-shell jsuw-shell--error">',
      '<section class="jsuw-error" role="status">',
      '<div class="jsuw-eyebrow">JSU Wrapped</div>',
      '<h2 class="jsuw-headline">' + escapeHtml(headline) + "</h2>",
      '<p class="jsuw-subtext">' + escapeHtml(message) + "</p>",
      "</section>",
      "</div>"
    ].join("");
  }

  function setStatus(container, message) {
    var status = container.querySelector("[data-jsuw-status]");

    if (status) {
      status.textContent = message;
    }
  }

  function renderStory(container, state) {
    var card = state.cards[state.index];
    var total = state.cards.length;
    var cardNumber = state.index + 1;
    var nextLabel = state.index === total - 1 ? "Replay" : "Next";

    container.innerHTML = [
      '<div class="jsuw-shell">',
      '<section class="jsuw-story" tabindex="0" role="group" aria-roledescription="story" aria-label="JSU Wrapped card ' + cardNumber + " of " + total + '">',
      '<div class="jsuw-progress" aria-hidden="true">' + renderProgress(state.index, total) + "</div>",
      '<p class="jsuw-sr-only">Card ' + cardNumber + " of " + total + "</p>",
      '<article class="jsuw-card jsuw-type-' + escapeHtml(card.type) + " jsuw-theme-" + escapeHtml(card.theme) + '" data-jsuw-card>',
      renderStickerCloud(card),
      renderCardBody(card),
      "</article>",
      '<div class="jsuw-controls">',
      '<button class="jsuw-nav-button" type="button" data-jsuw-action="prev" ' + (state.index === 0 ? "disabled" : "") + '>Back</button>',
      '<button class="jsuw-nav-button jsuw-nav-button--next" type="button" data-jsuw-action="next">' + nextLabel + "</button>",
      "</div>",
      "</section>",
      "</div>"
    ].join("");
  }

  function focusStory(container) {
    var story = container.querySelector(".jsuw-story");

    if (!story) {
      return;
    }

    try {
      story.focus({ preventScroll: true });
    } catch (error) {
      story.focus();
    }
  }

  function prefersReducedMotion() {
    return Boolean(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function formatAnimatedStat(value, decimals, suffix) {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value) + suffix;
  }

  function animateCountUp(element) {
    var target = Number(element.getAttribute("data-jsuw-stat-target"));
    var suffix = element.getAttribute("data-jsuw-stat-suffix") || "";
    var decimals = Number(element.getAttribute("data-jsuw-stat-decimals") || 0);

    if (!isFinite(target)) {
      return;
    }

    if (prefersReducedMotion() || typeof root.requestAnimationFrame !== "function") {
      element.textContent = formatAnimatedStat(target, decimals, suffix);
      return;
    }

    var start = root.performance && typeof root.performance.now === "function" ? root.performance.now() : Date.now();
    var duration = target > 999 ? 1180 : 880;

    element.textContent = formatAnimatedStat(0, decimals, suffix);

    root.requestAnimationFrame(function step(now) {
      var elapsed = Math.max(0, now - start);
      var progress = Math.min(elapsed / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = target * eased;

      element.textContent = formatAnimatedStat(progress === 1 ? target : current, decimals, suffix);

      if (progress < 1) {
        root.requestAnimationFrame(step);
      }
    });
  }

  function activateStory(container) {
    var story = container.querySelector(".jsuw-story");
    var countUps = container.querySelectorAll("[data-jsuw-countup]");

    if (story && typeof root.requestAnimationFrame === "function") {
      root.requestAnimationFrame(function () {
        story.classList.add("jsuw-story--entered");
      });
    } else if (story) {
      story.classList.add("jsuw-story--entered");
    }

    Array.prototype.forEach.call(countUps, animateCountUp);
  }

  function goTo(container, state, nextIndex, options) {
    var total = state.cards.length;

    if (nextIndex < 0) {
      nextIndex = 0;
    }

    if (nextIndex >= total) {
      nextIndex = 0;
    }

    state.index = nextIndex;
    renderStory(container, state);
    activateStory(container);

    if (options && options.focusStory) {
      focusStory(container);
    }
  }

  function previous(container, state, options) {
    goTo(container, state, state.index - 1, options);
  }

  function next(container, state, options) {
    goTo(container, state, state.index + 1, options);
  }

  function getPointerSide(event, element) {
    var rect = element.getBoundingClientRect();
    var x = event.clientX - rect.left;

    return x < rect.width / 2 ? "left" : "right";
  }

  function isInteractiveTarget(target) {
    return Boolean(target && typeof target.closest === "function" && target.closest("button, a, input, textarea, select, [role='button']"));
  }

  function getKeyNavigationAction(event) {
    if (!event) {
      return null;
    }

    if (event.key === " " && isInteractiveTarget(event.target)) {
      return null;
    }

    if (event.key === "ArrowRight" || event.key === " ") {
      return "next";
    }

    if (event.key === "ArrowLeft") {
      return "prev";
    }

    return null;
  }

  function installInteraction(container, state) {
    function runAction(action, options) {
      if (action === "prev") {
        previous(container, state, options);
      } else if (action === "next") {
        next(container, state, options);
      } else if (action === "share") {
        shareRecap(container, state);
      } else if (action === "download") {
        downloadRecap(container, state);
      }
    }

    function handleClick(event) {
      if (!event.target || typeof event.target.closest !== "function") {
        return;
      }

      var actionTarget = event.target.closest("[data-jsuw-action]");

      if (actionTarget) {
        var action = actionTarget.getAttribute("data-jsuw-action");
        runAction(action);

        return;
      }

      var story = event.target.closest(".jsuw-story");

      if (!story || isInteractiveTarget(event.target)) {
        return;
      }

      if (getPointerSide(event, story) === "left") {
        previous(container, state);
      } else {
        next(container, state);
      }
    }

    function handleKeydown(event) {
      if (event.key === " " && isInteractiveTarget(event.target)) {
        var actionTarget = event.target.closest("[data-jsuw-action]");

        if (actionTarget && !actionTarget.disabled) {
          event.preventDefault();
          runAction(actionTarget.getAttribute("data-jsuw-action"), { focusStory: true });
        }

        return;
      }

      var action = getKeyNavigationAction(event);

      if (action === "next") {
        event.preventDefault();
        next(container, state, { focusStory: true });
      } else if (action === "prev") {
        event.preventDefault();
        previous(container, state, { focusStory: true });
      }
    }

    container.addEventListener("click", handleClick);
    container.addEventListener("keydown", handleKeydown);

    return function cleanupInteraction() {
      container.removeEventListener("click", handleClick);
      container.removeEventListener("keydown", handleKeydown);
    };
  }

  function shareText(state) {
    var record = state.record;
    var chapterName = asText(record.chapter_name, "Our JSU chapter");

    return [
      chapterName + " Wrapped:",
      hasValue(record.events_hosted) ? formatNumber(record.events_hosted) + " events" : "",
      hasValue(record.unique_teens) ? formatNumber(record.unique_teens) + " teens" : "",
      hasValue(record.engagement_moments) ? formatNumber(record.engagement_moments) + " engagement moments" : "",
      hasValue(record.chapter_persona) ? asText(record.chapter_persona) + " energy" : ""
    ].filter(Boolean).join(" - ");
  }

  async function shareRecap(container, state) {
    var data = {
      title: asText(state.record.chapter_name, "JSU Wrapped"),
      text: shareText(state),
      url: root.location ? root.location.href : ""
    };

    try {
      if (root.navigator && typeof root.navigator.share === "function") {
        await root.navigator.share(data);
        setStatus(container, "Shared.");
        return;
      }

      if (root.navigator && root.navigator.clipboard && typeof root.navigator.clipboard.writeText === "function") {
        await root.navigator.clipboard.writeText([data.text, data.url].filter(Boolean).join("\n"));
        setStatus(container, "Recap copied.");
        return;
      }

      setStatus(container, "Copy this page link to share your recap.");
    } catch (error) {
      setStatus(container, "Share was canceled.");
    }
  }

  function downloadBlob(container, blob, filename) {
    var url = root.URL.createObjectURL(blob);
    var link = root.document.createElement("a");

    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    container.appendChild(link);
    link.click();
    link.remove();
    root.setTimeout(function () {
      root.URL.revokeObjectURL(url);
    }, 1000);
  }

  function svgLine(text, x, y, size, weight, fill) {
    return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" font-weight="' + weight + '" fill="' + fill + '" font-family="Arial, Helvetica, sans-serif">' + escapeXml(text) + "</text>";
  }

  function createFallbackSvg(state) {
    var record = state.record;
    var chapterName = asText(record.chapter_name, "JSU Wrapped");
    var persona = asText(record.chapter_persona, "JSU energy");
    var year = asText(record.year_label || record.school_year, "This year");

    return [
      '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">',
      "<defs>",
      '<linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#6025ff"/><stop offset="0.48" stop-color="#ff3b91"/><stop offset="1" stop-color="#ffb000"/></linearGradient>',
      "</defs>",
      '<rect width="1080" height="1920" rx="92" fill="url(#bg)"/>',
      '<circle cx="880" cy="220" r="170" fill="#ffffff" opacity="0.18"/>',
      '<circle cx="160" cy="1550" r="230" fill="#00d4ff" opacity="0.2"/>',
      svgLine("JSU Wrapped", 92, 190, 58, 800, "#ffffff"),
      svgLine(year, 92, 275, 40, 700, "#fff2b8"),
      svgLine(chapterName, 92, 470, 92, 900, "#ffffff"),
      svgLine("Wrapped", 92, 585, 92, 900, "#ffffff"),
      svgLine(hasValue(record.events_hosted) ? formatNumber(record.events_hosted) + " events" : "Events", 92, 890, 70, 900, "#ffffff"),
      svgLine(hasValue(record.unique_teens) ? formatNumber(record.unique_teens) + " teens" : "Teens reached", 92, 1010, 70, 900, "#ffffff"),
      svgLine(hasValue(record.engagement_moments) ? formatNumber(record.engagement_moments) + " moments" : "Engagement moments", 92, 1130, 70, 900, "#ffffff"),
      svgLine(persona + " energy", 92, 1370, 58, 800, "#fff2b8"),
      svgLine("One chapter. One movement.", 92, 1620, 48, 800, "#ffffff"),
      "</svg>"
    ].join("");
  }

  async function downloadRecap(container, state) {
    var filename = slugify(state.record.chapter_slug || state.record.chapter_name) + "-wrapped.svg";
    var card = container.querySelector("[data-jsuw-card]");

    function downloadSvgFallback() {
      var svg = createFallbackSvg(state);
      downloadBlob(container, new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), filename);
      setStatus(container, "Image downloaded.");
    }

    try {
      if (root.html2canvas && card) {
        var canvas = await root.html2canvas(card, {
          backgroundColor: null,
          scale: 2,
          useCORS: true
        });

        if (typeof canvas.toBlob !== "function") {
          downloadSvgFallback();
          return;
        }

        canvas.toBlob(function (blob) {
          if (blob) {
            downloadBlob(container, blob, filename.replace(/\.svg$/, ".png"));
            setStatus(container, "Image downloaded.");
          } else {
            setStatus(container, "Take a screenshot to save this recap.");
          }
        }, "image/png");
        return;
      }

      downloadSvgFallback();
    } catch (error) {
      try {
        downloadSvgFallback();
      } catch (fallbackError) {
        setStatus(container, "Take a screenshot to save this recap.");
      }
    }
  }

  async function fetchRecords(url) {
    var response = await root.fetch(url, { credentials: "same-origin" });

    if (!response.ok) {
      throw new Error("Could not load " + url);
    }

    return response.json();
  }

  async function init(container, options) {
    var target = container || (root.document && root.document.getElementById(WIDGET_ID));
    var settings = options || {};

    if (!target) {
      return null;
    }

    if (target.__jsuWrappedCleanup) {
      target.__jsuWrappedCleanup();
      target.__jsuWrappedCleanup = null;
    }

    var chapterSlug = settings.chapter || getChapterSlug(settings.url);

    if (!hasValue(chapterSlug)) {
      renderError(
        target,
        "This Wrapped link needs a chapter code.",
        "Ask your JSU or NCSY team for a link that includes ?chapter=your-chapter."
      );
      return null;
    }

    target.innerHTML = '<div class="jsuw-shell"><section class="jsuw-loading" role="status">Loading JSU Wrapped...</section></div>';

    try {
      var dataUrl = settings.dataUrl || getDataUrl(target);
      var records = settings.records || await fetchRecords(dataUrl);
      var chapter = findChapter(records, chapterSlug);

      if (!chapter) {
        renderError(
          target,
          "We could not find that chapter.",
          "Check the chapter link or ask your JSU or NCSY team for the right Wrapped URL."
        );
        return null;
      }

      var state = {
        index: 0,
        cards: createCards(chapter),
        record: chapter
      };

      target.__jsuWrappedCleanup = installInteraction(target, state);
      renderStory(target, state);
      activateStory(target);
      return state;
    } catch (error) {
      renderError(
        target,
        "We could not load the Wrapped data.",
        "Try refreshing the page. If you opened this file directly, use a small local web server so the JSON file can be fetched."
      );
      return null;
    }
  }

  function autoInit() {
    var doc = root.document;

    if (!doc) {
      return;
    }

    if (doc.readyState === "loading") {
      doc.addEventListener("DOMContentLoaded", function () {
        init();
      }, { once: true });
    } else {
      init();
    }
  }

  autoInit();

  return {
    createCards: createCards,
    findChapter: findChapter,
    formatNumber: formatNumber,
    getStatAnimationConfig: getStatAnimationConfig,
    getKeyNavigationAction: getKeyNavigationAction,
    getChapterSlug: getChapterSlug,
    getDataUrl: getDataUrl,
    init: init,
    renderCardBody: renderCardBody
  };
});
