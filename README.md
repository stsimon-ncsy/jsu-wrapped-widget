# JSU/NCSY Wrapped

Static, embeddable Wrapped-style stories for JSU/NCSY chapters, regions, programs, and a guarded teen proof of concept.

The production path is intentionally lightweight: no backend, no build step, and no login required for the public widget. GitHub Pages can host the static assets, while WordPress can embed the same widget on `ncsy.org`.

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
  data-source="https://stsimon-ncsy.github.io/jsu-wrapped-widget/sample-wrapped-2026.json?v=jsuw-prod-20260601f"
  data-config-source="https://stsimon-ncsy.github.io/jsu-wrapped-widget/wrapped-config-2026.json?v=jsuw-prod-20260601f"
  data-teen-source="https://stsimon-ncsy.github.io/jsu-wrapped-widget/sample-teen-wrapped-2026.json?v=jsuw-prod-20260601f"
  data-share-base="https://stsimon-ncsy.github.io/jsu-wrapped-widget/share/"
  data-cta-label="Get involved next year"
  data-cta-target="#jsuw-wrapped-interest"
></div>

<link rel="stylesheet" href="https://stsimon-ncsy.github.io/jsu-wrapped-widget/jsu-wrapped.css?v=jsuw-prod-20260601f">
<script src="https://stsimon-ncsy.github.io/jsu-wrapped-widget/jsu-wrapped.js?v=jsuw-prod-20260601f"></script>
```

Use `wordpress-inline-embed.html` when the page template works better with a self-contained inline block.

Bump the shared cache token in this pasteable snippet whenever the hosted JS, CSS, data, or config URLs need to force-refresh for staff or public reviewers.

## Builder Workflow

Pilot staff can use `builder.html` to preview chapter, region, program, and variant changes without editing GitHub directly.

Builder is an internal staff tool. It is public only because GitHub Pages is static hosting, so `builder.html` is marked `noindex,nofollow` and should not be promoted as a public landing page.

1. Pick the region, chapter, edit scope, and version.
2. Adjust generated screens, metrics, custom screens, brand, or CTA.
3. Fill in the submission info fields.
4. Click **Open email draft** to copy the smaller JSON and start a review email, click **Copy submission** to paste it into email, Slack, or a review form, or click **Download submission** to attach it as a file.
5. Send that submission JSON to the repo maintainer for review.

To prefill the email recipient for pilot staff, set `data-review-email` on the `#wrapped-builder` element in `builder.html`, or send staff a pre-addressed builder link with `review_email`:

```text
https://stsimon-ncsy.github.io/jsu-wrapped-widget/builder.html?review_email=wrapped-review@example.org
```

Do not commit downloaded staff submission JSON. These files can include submitter name, email, and reviewer notes; keep them local, in email/Slack, or in an ignored `staff-submissions/` folder while reviewing.

To merge a reviewed staff submission locally:

```bash
node merge-builder-submission.js path/to/submission.json wrapped-config-2026.json
node check-production.js
```

The merge helper only accepts builder-generated scope or variant paths and validates the resulting config against the current JSON data before writing. Invalid submissions are rejected without changing `wrapped-config-2026.json`.

## Production Check

Before pushing, copying to WordPress, or trusting GitHub Pages for a launch preview, run:

```bash
node check-production.js
```

That command syncs the inline WordPress handoff, regenerates static share pages, syntax-checks scripts, validates data/config, runs the smoke suite, checks generated-file drift, and catches whitespace errors. GitHub Actions runs the same command on push and pull request.

## Documentation

- `docs/production-readiness.md` - technical production notes, URL patterns, QA expectations, CSS isolation, social sharing, WordPress embed details
- `docs/staff-playbook.md` - rollout strategy, CTA guidance, variant usage, staff follow-up, analytics review
- `analytics-gtm-setup.md` - GA4/GTM event setup notes

Teen mode remains a proof of concept and is marked `noindex,nofollow` until real teen-level data, consent, and privacy review are ready. The production validator rejects teen ID/contact fields and obvious email or phone values in teen data.
