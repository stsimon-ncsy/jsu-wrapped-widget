# Wrapped Builder Customizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a static MVP builder/customizer so region or chapter staff can hide generated screens, override copy/branding/CTA, and add custom text, metric, or media screens without editing widget code.

**Architecture:** Keep `jsu-wrapped.js` as the public renderer and add a small config composition layer around the existing `createCards()` flow. Add a static internal builder page that loads the metrics JSON plus config JSON, previews the existing widget through its exported API, and exports updated config for static hosting.

**Tech Stack:** Vanilla JavaScript, scoped CSS, static JSON, existing `JSUWrapped` browser API, local static server for QA.

---

### Task 1: Add Builder Config Shape

**Files:**
- Create: `wrapped-config-2026.json`
- Modify: `index.html`
- Modify: `embed-example.html`

- [ ] **Step 1: Add a sample config file**

Create `wrapped-config-2026.json` with defaults, one region override, and one chapter override. Include `hidden_cards`, `card_overrides`, and `custom_cards` examples using only real card ids: `cover`, `events`, `reach`, `moments`, `new`, `repeat`, `biggest`, `persona`, `movement`, `final`.

- [ ] **Step 2: Wire example pages to the config**

Add `data-config-source="./wrapped-config-2026.json?v=builder1"` to the `#jsu-wrapped` embed in `index.html` and `embed-example.html`.

- [ ] **Step 3: Verify JSON parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('wrapped-config-2026.json','utf8')); console.log('config ok')"`

Expected: `config ok`

### Task 2: Teach the Renderer to Consume Config

**Files:**
- Modify: `jsu-wrapped.js`

- [ ] **Step 1: Add config URL helpers**

Add `DEFAULT_CONFIG_PATH`, `getConfigUrl(container)`, `fetchConfig(url)`, and export `getConfigUrl`.

- [ ] **Step 2: Add config lookup and merge helpers**

Add helpers that merge `defaults`, matching `regions[slug]`, and matching `chapters[chapter_slug]` into one effective config. Region slugs must be derived with existing `slugify(region_name)`.

- [ ] **Step 3: Add card ids to default cards**

Give every generated chapter card a stable `id`. Use `biggest` for the biggest-event card and keep ids aligned with `hidden_cards`.

- [ ] **Step 4: Apply copy overrides and hidden cards**

After `createCards()` builds default cards, run them through `applyStoryConfig(cards, record, config, options)`. Hide cards whose id appears in `hidden_cards`. Apply `card_overrides[id]` fields such as `headline`, `displayHeadline`, `eyebrow`, `subtext`, `badge`, `markerText`, and `persona`.

- [ ] **Step 5: Insert custom cards**

Convert `custom_cards` into renderable card objects and insert them using `placement` values such as `after_cover`, `after_events`, `before_final`, or `end`. Supported MVP custom types: `text`, `metric`, `media`.

- [ ] **Step 6: Respect config CTA and logo**

Let config override `brand_logo`, `cta_label`, `cta_target`, and `cta_href`, while preserving embed data attributes as the page-level fallback.

### Task 3: Render Custom Screen Types

**Files:**
- Modify: `jsu-wrapped.js`
- Modify: `jsu-wrapped.css`

- [ ] **Step 1: Add custom renderers**

Add `renderCustomTextBody(card)`, `renderCustomMetricBody(card)`, and `renderCustomMediaBody(card)`. Each custom card should use `renderReferenceShell()` so it inherits the polished story frame.

- [ ] **Step 2: Route custom cards**

Update `renderCardBody(card)` so `theme` values `custom-text`, `custom-metric`, and `custom-media` render through the new functions.

- [ ] **Step 3: Add scoped CSS**

Add styles under `#jsu-wrapped` for `.jsuw-theme-custom-text`, `.jsuw-theme-custom-metric`, `.jsuw-theme-custom-media`, `.jsuw-custom-note`, `.jsuw-custom-stat`, and `.jsuw-custom-media-frame`.

### Task 4: Build the Static Customizer

**Files:**
- Create: `builder.html`
- Create: `wrapped-builder.css`
- Create: `wrapped-builder.js`

- [ ] **Step 1: Create builder shell**

Build a static page with region selector, chapter selector, config controls, custom-card editor, validation panel, live preview, and export textarea.

- [ ] **Step 2: Load data and config**

Load `sample-wrapped-2026.json` and `wrapped-config-2026.json`. Populate regions and chapters from data. Keep config in browser state.

- [ ] **Step 3: Preview with existing renderer**

Call `JSUWrapped.init(previewEl, { records, config, chapter, dataUrl, configUrl, url })` whenever builder state changes.

- [ ] **Step 4: Edit MVP settings**

Support logo choice, palette string, CTA fields, generated card hide/show, generated card copy overrides, and adding/removing custom text/metric/media cards.

- [ ] **Step 5: Export valid JSON**

Render formatted JSON into an export textarea and add a copy button. The exported file should be directly usable as `wrapped-config-2026.json`.

### Task 5: Verify

**Files:**
- Modify as needed based on QA.

- [ ] **Step 1: Static syntax checks**

Run: `node --check jsu-wrapped.js` and `node --check wrapped-builder.js`.

- [ ] **Step 2: JSON checks**

Run JSON parse checks for `sample-wrapped-2026.json`, `sample-teen-wrapped-2026.json`, and `wrapped-config-2026.json`.

- [ ] **Step 3: Renderer smoke**

Run a Node smoke using the exported API to confirm config hides cards, applies overrides, and inserts custom cards.

- [ ] **Step 4: Browser smoke**

Serve locally and open `builder.html` plus `embed-example.html?chapter=baltimore`. Confirm the builder preview changes, export JSON updates, and the public story still renders.

- [ ] **Step 5: Git status review**

Run `git status --short` and summarize modified files.
