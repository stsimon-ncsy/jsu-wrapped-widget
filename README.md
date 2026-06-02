# JSU/NCSY Wrapped

Static, embeddable Wrapped-style stories for JSU/NCSY chapters, regions, programs, and a guarded teen proof of concept.

The production path is intentionally lightweight: no backend, no build step, and no login required for the public widget. GitHub Pages can host the static assets, while WordPress can embed the same widget on `ncsy.org`.

## Production Hosting Map

- NCSY.org is the canonical public Wrapped page.
- GitHub Pages is the static asset/data host for widget files, JSON/config, generated share pages, and images unless those files move to NCSY.org.
- Gravity Forms handles only the final CTA/contact capture, either as an embedded same-page panel or a separate NCSY.org form page.

## Public URLs

- GitHub Pages preview: `https://stsimon-ncsy.github.io/jsu-wrapped-widget/`
- Chapter story: `https://stsimon-ncsy.github.io/jsu-wrapped-widget/?chapter=baltimore`
- Chapter variant: `https://stsimon-ncsy.github.io/jsu-wrapped-widget/?chapter=baltimore&variant=donor-recap`
- Builder: `https://stsimon-ncsy.github.io/jsu-wrapped-widget/builder.html`

Social scrapers should use the generated static share pages under `share/`, for example:

```text
https://stsimon-ncsy.github.io/jsu-wrapped-widget/share/baltimore/
```

## Deployable Files

The public widget is driven by these files:

- `jsu-wrapped.js` - renderer, story logic, analytics hooks, share/download, CTA prefill
- `jsu-wrapped.css` - scoped widget styles under `#jsu-wrapped`
- `sample-wrapped-2026.json` - chapter, region, and program story data
- `sample-teen-wrapped-2026.json` - teen proof-of-concept data
- `wrapped-config-2026.json` - copy, brand, CTA, variant, and custom-screen overrides
- `share/` - generated crawler-readable social preview pages
- `wordpress-inline-embed.html` - self-contained WordPress handoff HTML

## WordPress Embed

For a normal HTML block that loads assets from GitHub Pages:

```html
<div
  id="jsu-wrapped"
  data-year="2026"
  data-source="https://stsimon-ncsy.github.io/jsu-wrapped-widget/sample-wrapped-2026.json?v=jsuw-prod-20260602a"
  data-config-source="https://stsimon-ncsy.github.io/jsu-wrapped-widget/wrapped-config-2026.json?v=jsuw-prod-20260602a"
  data-teen-source="https://stsimon-ncsy.github.io/jsu-wrapped-widget/sample-teen-wrapped-2026.json?v=jsuw-prod-20260602a"
  data-share-base="https://stsimon-ncsy.github.io/jsu-wrapped-widget/share/"
  data-cta-label="Get involved next year"
  data-cta-target="#jsuw-wrapped-interest"
></div>

<link rel="stylesheet" href="https://stsimon-ncsy.github.io/jsu-wrapped-widget/jsu-wrapped.css?v=jsuw-prod-20260602a">
<script src="https://stsimon-ncsy.github.io/jsu-wrapped-widget/jsu-wrapped.js?v=jsuw-prod-20260602a"></script>
```

Use `wordpress-inline-embed.html` when the page template works better with a self-contained inline block.

Bump the shared cache token whenever the hosted JS, CSS, data, or config URLs need to force-refresh for staff or public reviewers:

```bash
node bump-cache-token.js jsuw-prod-YYYYMMDDx
node check-production.js
```

## Builder Workflow

Pilot staff can use `builder.html` to preview chapter, region, program, and variant changes without editing GitHub directly.

Builder is an internal staff tool. It is public only because GitHub Pages is static hosting, so `builder.html` is marked `noindex,nofollow` and should not be promoted as a public landing page.

1. Pick the region, chapter, edit scope, and version.
2. Adjust generated screens, metrics, custom screens, brand, or CTA.
3. Fill in the required submission info fields with your name and email, plus an optional reviewer note.
4. Click **Open review form** when a review form link is provided. The builder copies the smaller JSON first and passes only short context fields in the form URL. Paste the copied JSON into the form if the textarea is blank. Use **Open email draft** as the fallback, or use **Copy submission** / **Download submission** for Slack, Teams, locked-down browsers, or oversized packets.
5. Send that submission JSON to the repo maintainer for review.

To prefill the email recipient for pilot staff, set `data-review-email` on the `#wrapped-builder` element in `builder.html`, or send staff a pre-addressed builder link with `review_email`:

```text
https://stsimon-ncsy.github.io/jsu-wrapped-widget/builder.html?review_email=wrapped-review@example.org
```

The builder also has a collapsed **Reviewer setup** helper in Submission info. Enter the review email and optional review form URL there, then click **Copy staff link**. The copied link preserves the current region, chapter, scope, and version so pilot staff can land on the right starting point and send the smaller submission JSON back to the right place.

To send staff to a separate intake form after copying the submission JSON, set `data-review-url` on `#wrapped-builder` or add `review_url` to the builder link:

```text
https://stsimon-ncsy.github.io/jsu-wrapped-widget/builder.html?review_email=wrapped-review@example.org&review_url=https%3A%2F%2Fncsy.org%2Fwrapped-review%2F
```

The builder passes only short context fields such as `wrapped_scope`, `wrapped_slug`, `wrapped_variant`, and `wrapped_preview` to the form URL. It does not put the full submission JSON in the URL because those packets can be too long for reliable browser/server handling. Configure the Gravity Forms textarea as `wrapped_submission` for pasted JSON and exported entries, and keep the builder's clipboard copy and download options as fallbacks for locked-down browsers.

Review form URLs must use `https://`, `http://`, `/`, `./`, or `../` links. Unsafe schemes are ignored by the builder.

For a pilot group, use `docs/staff-submission-intake.md` to set up a dedicated Gravity Forms intake, generate the right staff links, and process returned JSON exports.

For final-card CTAs, use `cta_target` when the button should open an embedded form panel such as `#jsuw-wrapped-interest`, or `cta_href` when it should navigate to a safe direct URL such as `https://ncsy.org/ncsy-wrapped/` or `/ncsy-wrapped/`.

Do not commit downloaded staff submission JSON. These files include submitter name and email, and can include reviewer notes; keep them local, in email/Slack, or in an ignored `staff-submissions/` folder while reviewing.

To merge a reviewed staff submission locally:

```bash
node review-builder-submissions.js staff-submissions wrapped-config-2026.json
node merge-builder-submission.js path/to/submission.json wrapped-config-2026.json --dry-run
node merge-builder-submission.js path/to/submission.json wrapped-config-2026.json
node merge-builder-submission.js path/to/export.json wrapped-config-2026.json --entry 2 --dry-run
node check-production.js
```

Use `review-builder-submissions.js` when a pilot wave sends multiple JSON files back. It scans a local ignored folder such as `staff-submissions/`, validates every packet without writing config, prints submitter details and change summaries, and exits nonzero if any file is invalid. The review and merge helpers accept direct builder submission JSON, a Gravity Forms-style entry JSON object containing the builder packet in `wrapped_submission`, or a single exported JSON array of entries. Each valid review item prints a ready-to-run **Dry run:** command. If the review label is an array entry such as `export.json[2]`, that command includes `--entry 2`. The dry run validates the submission and prints the submitter, reviewer note, preview URL, and change summary without writing to `wrapped-config-2026.json`. The merge helper only accepts builder-generated scope or variant paths and validates the resulting config against the current JSON data before writing. Invalid submissions are rejected without changing `wrapped-config-2026.json`.

## Production Check

Before pushing, copying to WordPress, or trusting GitHub Pages for a launch preview, run:

```bash
node check-production.js
```

That command syncs the inline WordPress handoff, regenerates static share pages, syntax-checks scripts, validates data/config, runs the smoke suite, checks generated-file drift, and catches whitespace errors. GitHub Actions runs the same command on push and pull request, then installs Chrome and runs the render smoke without the local `--skip-if-missing` escape hatch.

After pushing to GitHub Pages, run the hosted smoke check to confirm the live static files, builder script, WordPress inline embed, noindex QA pages, teen proof-of-concept JSON, Baltimore share metadata, and social preview image are being served:

```bash
node hosted-smoke.js
```

Use `--base` when testing a fork, preview host, or WordPress-hosted copy. The default GitHub Pages check also confirms the hosted JSON files send `Access-Control-Allow-Origin` for an `https://ncsy.org` WordPress embed, because browser `fetch()` needs CORS when the public page shell lives on NCSY.org and JSON stays on GitHub Pages. Use `--require-cors --origin https://ncsy.org` for another cross-origin static asset host, or `--skip-cors` for a same-origin WordPress-hosted copy.

After the WordPress page is pasted and published, run the live WordPress shell smoke:

```bash
node wordpress-smoke.js --url "https://ncsy.org/ncsy-wrapped/?chapter=baltimore"
```

That check verifies the WordPress page has the widget container, hosted or inline widget CSS/JS, hosted JSON/config URLs, generated share-page base, final-card CTA target or URL, matching Gravity Forms/context panel when `data-cta-target` is used, privacy/cookie affordance, and basic JSU/NCSY Wrapped social title, `og:type`, `og:site_name`, `og:description`, `twitter:description`, image markup, `og:image:secure_url`, and `twitter:image:alt`.

If the live WordPress page is stale, print one compact copy-ready update packet:

```bash
node wordpress-smoke.js --url "https://ncsy.org/ncsy-wrapped/?chapter=baltimore" --fix-packet
```

If the final CTA should link to a separate Gravity Forms page instead of an embedded same-page panel, include the clean form URL:

```bash
node wordpress-smoke.js --url "https://ncsy.org/ncsy-wrapped/?chapter=baltimore" --fix-packet --cta-href "https://ncsy.org/wrapped-interest/"
```

After that separate form page is published, check the destination itself:

```bash
node wordpress-smoke.js --url "https://ncsy.org/ncsy-wrapped/?chapter=baltimore" --cta-href "https://ncsy.org/wrapped-interest/" --check-cta-destination
```

That destination check fetches the Gravity Forms page and confirms it is HTML with the hidden/context fields the widget pre-populates.

The packet includes the current replacement `#jsu-wrapped` tag, exact page/social title, suggested canonical/social URLs, `og:type`, `og:site_name`, `og:title`, `twitter:title`, `og:description`, `twitter:description`, `og:image`, `og:image:secure_url`, `twitter:image`, `og:image:alt`, `twitter:image:alt`, large-card metadata, and the follow-up smoke command.

For a local render check on machines with Chrome or Edge installed, run:

```bash
node render-smoke.js --skip-if-missing
```

This serves the static files locally and confirms the chapter picker, Baltimore story, CTA form prefill page, CTA link prefill page, analytics dataLayer page, and builder render real DOM in mobile and desktop headless viewports. `node check-production.js` runs the same render smoke with `--skip-if-missing`, so it remains dependency-free on minimal machines.

## Documentation

- `docs/production-readiness.md` - technical production notes, URL patterns, QA expectations, CSS isolation, social sharing, WordPress embed details
- `docs/launch-checklist.md` - final go/no-go checklist for WordPress, Gravity Forms, analytics, social preview, and staff pilot launch
- `docs/data-contract.md` - JSON and config contract for story data, overrides, custom screens, and privacy boundaries
- `docs/staff-playbook.md` - rollout strategy, CTA guidance, variant usage, staff follow-up, analytics review
- `docs/staff-submission-intake.md` - maintainer setup for Gravity Forms or email-based staff builder submissions
- `docs/pilot-staff-builder-guide.md` - short sendable guide for pilot staff returning builder submission JSON
- `analytics-gtm-setup.md` - GA4/GTM event setup notes

Teen mode remains a proof of concept and is marked `noindex,nofollow` until real teen-level data, consent, and privacy review are ready. The production validator rejects teen ID/contact fields and obvious email or phone values in teen data.
