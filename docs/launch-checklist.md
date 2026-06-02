# JSU/NCSY Wrapped Launch Checklist

Use this as the final go/no-go checklist before sending Wrapped links beyond the pilot group.

## Preflight

- Run `node check-production.js` locally from the repo root.
- Confirm GitHub Actions QA is green for the latest pushed commit.
- Confirm GitHub Pages deployment is green for the same commit.
- Run `node hosted-smoke.js` after Pages finishes deploying.
- Confirm the shared cache token is current across README snippets, `index.html`, `embed-example.html`, `builder.html`, `cta-prefill-smoke.html`, `cta-link-smoke.html`, `wrapped-builder.js`, `wordpress-inline-embed.html`, and hosted JSON/CSS/JS URLs.
- If you changed JS, CSS, data, config, or share pages for reviewers, run `node bump-cache-token.js jsuw-prod-YYYYMMDDx`, then rerun `node check-production.js`.

## WordPress

- Confirm the public page is the intended no-header/no-footer page or approved template.
- Confirm the page uses the current embed snippet from `README.md` or the current `wordpress-inline-embed.html`.
- Confirm JSON/config/share assets are loading from GitHub Pages or another public static host.
- Confirm the page does not add theme CSS that clips the mobile story viewport.
- Confirm privacy/cookie links are present through the site wrapper, Osano, or the page footer plan.
- Open the WordPress page on mobile and desktop and verify the story fills the mobile viewport cleanly.

## Gravity Forms

- Confirm the final-card CTA opens the intended Gravity Forms panel or direct destination.
- Confirm hidden/context fields exist for chapter name, region, scope type, scope slug, scope name, program, variant, year label, and Wrapped URL where useful.
- Confirm the widget pre-populates those fields when the CTA opens the form.
- Submit one test entry from a chapter link and confirm the receiving staff can see the chapter/region/source context.
- If using the staff builder pilot form, confirm the `wrapped_submission` textarea is present and accepts pasted JSON from the builder clipboard flow.

## Analytics

- Confirm GTM or the Google tag is installed by the host site, not by the widget.
- In GTM Preview, confirm `jsu_wrapped_story_view`, `jsu_wrapped_card_view`, and `jsu_wrapped_card_engagement` fire.
- In GA4 DebugView, confirm events arrive for property `G-Y3LLF5KQ23`.
- Confirm custom dimensions/metrics from `analytics-gtm-setup.md` are registered or queued for reporting.
- Confirm teen proof-of-concept pages remain `noindex,nofollow` and are not included in public reporting until privacy review is complete.

## Social Preview

- Confirm the main social title format is `JSU/NCSY Wrapped - [Chapter or Scope Name]`.
- Open at least one generated share page, such as `/share/baltimore/`, and confirm Open Graph and Twitter metadata are present.
- Confirm the share preview image uses the intended `assets/wrapped-social-preview.png` or updated campaign image.
- Confirm the in-story share button points at generated share pages when `data-share-base` is configured.
- Confirm a test share opens the intended interactive chapter, region, or program story after redirect.

## Staff Pilot

- Send staff `docs/pilot-staff-builder-guide.md`, not the full production docs.
- For maintainers, use `docs/staff-submission-intake.md` to create the review form and process returned JSON.
- Generate staff builder links from **Reviewer setup** so `review_email`, `review_url`, chapter, scope, and variant are carried correctly.
- Ask pilot staff to make small, reviewable edits rather than full rewrites.
- Put returned JSON or Gravity Forms exports in ignored `staff-submissions/`.
- Run `node review-builder-submissions.js staff-submissions wrapped-config-2026.json` before merging.
- Dry-run each merge before writing to `wrapped-config-2026.json`.
- Rerun `node check-production.js` after every accepted submission batch.

## Go/No-Go

Go only when all of these are true:

- Public chapter pages render from JSON/config, not hardcoded data.
- The no-parameter page lets users find chapters by region.
- Mobile layout is fullscreen or close to fullscreen and has no clipped controls.
- Final card share/download output includes logo, key stats, and non-overlapping copy.
- CTA destination works and captures chapter context.
- Social previews have crawler-readable metadata.
- GA4/GTM events are visible in live debug tools.
- Staff have a clear owner for form replies and follow-up.
- Teen mode is either hidden/test-only or has completed data, consent, and privacy review.

No-go triggers:

- Any `undefined`, `null`, `NaN`, missing logo, clipped number, or overlapping final-card text appears in a public story or download.
- `node check-production.js` fails.
- GitHub Pages is serving stale JS/CSS/JSON after a cache-token bump.
- The CTA form cannot receive or route submissions.
- Analytics cannot distinguish chapter, region, scope, or variant.
