# Per-Chapter Social Preview Images

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a per-chapter (and per-scope) static social preview PNG for each story record and commit them alongside the existing `share/*/index.html` redirect pages. This replaces the current single generic `assets/wrapped-social-preview.png` in OG/Twitter cards with a chapter-specific image that shows the chapter name, key stats, and branding.

**Why:** When a staff member shares `share/baltimore/`, social platforms show the same generic image regardless of chapter. Per-chapter images improve click-through and make shares feel more personal.

**Architecture:** A new `generate-share-images.js` script runs headlessly using the existing `createFallbackSvg` logic in `jsu-wrapped.js` (already exports `createFallbackSvg`). It exports each SVG as a PNG using `sharp` (or `canvas` → PNG) and writes `share/{slug}/og.png`. The existing `generate-share-pages.js` is then updated to reference `share/{slug}/og.png` in OG tags when the file exists.

**Static hosting constraint:** GitHub Pages is a static host. There is no server-side OG image generation. All images must be pre-generated at build time and committed.

**Tech stack additions needed:** `sharp` or `canvas` Node module for SVG→PNG. Add to a `package.json` (which does not currently exist). Alternatively, use puppeteer/headless Chrome to screenshot a small HTML page per chapter — same Chrome the render smoke already uses.

---

### Task 1: Add package.json and image generation dependency

**Files:**
- Create: `package.json`
- Create: `generate-share-images.js`

- [ ] **Step 1: Create package.json**

Create a minimal `package.json`. The project has no build step for the public widget — this is purely for dev/build tooling.

```json
{
  "name": "jsu-wrapped-widget",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "generate-images": "node generate-share-images.js",
    "check": "node check-production.js"
  },
  "devDependencies": {
    "sharp": "^0.33.0"
  }
}
```

Add `node_modules/` to `.gitignore`.

- [ ] **Step 2: Create generate-share-images.js scaffold**

The script should:
1. Read `sample-wrapped-2026.json`
2. For each story record (chapter, region, national), call `JSUWrapped.createFallbackSvg()` — but note this requires a state object including a `record`. Need to construct a minimal state.
3. Write the SVG to a temp file or string, then convert to PNG using `sharp`.
4. Write to `share/{slug}/og.png`.

Check how `createFallbackSvg(state, logoDataUrl)` is structured in `jsu-wrapped.js` to understand the state shape it needs. Key fields: `record`, `cards` (at minimum the final card), `storyConfig`, `experienceMode`, `shareBase`.

- [ ] **Step 3: Verify SVG output**

Run the script for one chapter (Baltimore) and inspect the SVG string. Confirm it includes the chapter name, key stats, and branding. Adjust the fallback SVG template in `jsu-wrapped.js` if the output doesn't make a good 1200×630 image.

Note: `createFallbackSvg` was originally designed for download (portrait-ish card). A 1200×630 landscape crop may need a separate render path or CSS transform. Consider creating `createSharePreviewSvg(state, logoDataUrl)` in `jsu-wrapped.js` that renders a landscape layout, exporting it alongside `createFallbackSvg`.

---

### Task 2: Update share page generator to use per-chapter images

**Files:**
- Modify: `generate-share-pages.js`

- [ ] **Step 1: Check for og.png at share page generation time**

In `generate-share-pages.js`, after computing the output directory for a story, check whether `share/{slug}/og.png` exists using `fs.existsSync`. If it does, use the chapter-specific image URL in the OG/Twitter image tags; otherwise fall back to the default `assets/wrapped-social-preview.png`.

```js
const ogImagePath = path.join(shareDir, "og.png");
const ogImageUrl = fs.existsSync(ogImagePath)
  ? `${shareBase}${slug}/og.png`
  : DEFAULT_SOCIAL_IMAGE_URL;
```

- [ ] **Step 2: Verify share page output**

Run `node generate-share-pages.js` after running `node generate-share-images.js` for Baltimore. Open `share/baltimore/index.html` and confirm `og:image` points to `share/baltimore/og.png`, not the generic image.

- [ ] **Step 3: Verify via qa-smoke**

The existing `runSharePageSmoke` in `qa-smoke.js` checks that share page metadata is present. Update it to also assert that when `share/{slug}/og.png` exists, the share page's `og:image` references it.

---

### Task 3: Wire into check-production.js and CI

**Files:**
- Modify: `check-production.js`
- Modify: `.github/workflows/qa.yml`

- [ ] **Step 1: Add image generation to check-production.js**

Add `nodeCommand("generate-share-images.js")` before `nodeCommand("generate-share-pages.js")`. Also add a `git diff --exit-code share` check (one already exists but confirm it covers the new PNG files).

Note: Image generation will be slow on the first run (generating 100+ PNGs). Add a `--skip-if-missing-deps` flag that skips image generation when `sharp` is not installed, similar to how render-smoke uses `--skip-if-missing`.

- [ ] **Step 2: Add npm install step to CI workflow**

In `.github/workflows/qa.yml`, add a `npm install` step before the production check. This installs `sharp` for the CI run.

```yaml
- name: Install dev dependencies
  run: npm install
```

- [ ] **Step 3: Add generated PNG files to git diff check**

Confirm that the `git diff --exit-code share` command in `check-production.js` covers binary PNG files. Git tracks PNGs as binary; `git diff --exit-code` will exit nonzero if any tracked PNG has changed content. This ensures generated images stay in sync with data changes.

---

### Task 4: Update README and CLAUDE.md

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document the image generation command in README**

Add a section or note to the "Deployable Files" section and the production check section explaining that `generate-share-images.js` generates per-chapter PNGs, and that these are committed to the repo.

- [ ] **Step 2: Update CLAUDE.md**

Remove the note about all share pages using the same generic image (no longer true). Update the "How to add a new chapter" steps to include running `node generate-share-images.js --slug {slug}` (single-chapter mode) before committing.

---

### QA checklist

After implementation:
- [ ] `node generate-share-images.js` generates `share/baltimore/og.png`
- [ ] `node generate-share-pages.js` uses that image in `share/baltimore/index.html`
- [ ] `git diff` shows both `og.png` and `index.html` changed for Baltimore
- [ ] `node check-production.js` passes end-to-end
- [ ] `node hosted-smoke.js` confirms live `share/baltimore/og.png` returns `image/png`
- [ ] Share the `share/baltimore/` URL in a social debugger tool and confirm the chapter-specific image appears
