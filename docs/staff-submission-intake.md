# Staff Submission Intake Setup

Use this when you invite pilot staff to customize Wrapped stories without giving them GitHub access.

## Recommended Pilot Flow

1. Create one dedicated intake form, for example **Wrapped Builder Submission**.
2. Send staff a builder link that includes `review_url`.
3. Staff make edits in `builder.html`, fill in their name/email, and click **Open review form**.
4. The builder opens the form with short context in the URL and copies the submission JSON to the clipboard.
5. Staff submit the form. If the JSON field is empty, they paste the copied JSON before submitting.
6. Export the form entries as JSON, save them in an ignored local folder such as `staff-submissions/`, review, merge, run QA, and push.

Keep **Open email draft**, **Copy submission**, and **Download submission** as backups for locked-down browsers, oversized URLs, or staff who are more comfortable attaching a file.

## Gravity Forms Fields

Create a simple form with these fields:

- Name
- Email
- Chapter or scope name
- Region
- Variant or version
- Preview URL
- Reviewer note
- Submission JSON

For the context fields, enable dynamic population where available and use parameter names that match the builder:

```text
wrapped_scope
wrapped_slug
wrapped_name
wrapped_region
wrapped_variant
wrapped_preview
wrapped_submission
```

Make **Submission JSON** a paragraph/textarea field with the parameter name `wrapped_submission`. Do not depend on URL prefill for the full JSON packet; it can be too long for reliable browser/server handling. Staff should paste the copied JSON into this field when it is blank. This is the only required field for automated merging, but name/email and preview URL make review much easier.

The public final-card CTA can use the same pattern for a simpler interest form. Set `cta_href` to the Gravity Forms page URL; the widget will append short context params like `wrapped_chapter_slug`, `wrapped_chapter`, `wrapped_region`, `wrapped_variant`, `wrapped_year`, and `wrapped_url`. Keep any actual submission JSON in a textarea or upload flow, not in the URL.

Do not pass the full story JSON, config JSON, metrics object, or builder submission packet in a query string. GitHub Pages can host the public static JSON/config files, while `ncsy.org` hosts the Gravity Forms page or panel and receives only short `wrapped_*` context fields.

## Staff Builder Link

After the form is live, create a pilot link from the builder:

1. Open `builder.html`.
2. Pick the default region, chapter, scope, and version you want staff to start from.
3. Open **Reviewer setup**.
4. Add your review email and the form URL.
5. Click **Copy staff link**.

The copied URL will look like this:

```text
https://stsimon-ncsy.github.io/jsu-wrapped-widget/builder.html?chapter=baltimore&review_email=wrapped-review@example.org&review_url=https%3A%2F%2Fncsy.org%2Fwrapped-review%2F
```

You can send different starting links to different staff members. They can still change region/chapter inside the builder.

## Message To Staff

```text
Hi,

We are piloting a JSU/NCSY Wrapped customizer for a few chapters and regions.

Please use this link:
[builder link]

Pick your chapter, make only the edits you want reviewed, add your name/email in Submission info, then click Open review form. The builder should copy the submission JSON automatically. If the form's Submission JSON field is blank, paste what was copied before submitting.

Good edits: local copy tweaks, logo choice, CTA, metric corrections, hiding non-essential screens, or one custom screen. Please do not add private teen information.
```

## Reviewing Returned Submissions

If staff submit through Gravity Forms, export entries as JSON. Save the export or individual JSON files locally under:

```text
staff-submissions/
```

That folder and common submission filenames are ignored by git. Do not commit staff submission files because they include staff names/emails and reviewer notes.

Review the batch:

```bash
node review-builder-submissions.js staff-submissions wrapped-config-2026.json
```

For each valid item, the script prints a dry-run merge command. Run that command first:

```bash
node merge-builder-submission.js path/to/submission.json wrapped-config-2026.json --dry-run
```

If the dry run looks right, rerun without `--dry-run`:

```bash
node merge-builder-submission.js path/to/submission.json wrapped-config-2026.json
```

For a Gravity Forms export containing many entries, the printed dry-run command may include `--entry 2`. Keep that flag when merging the real entry.

After merging reviewed submissions:

```bash
node check-production.js
git status -sb
```

Then commit and push the updated config and generated share pages.

## Review Rules

- Reject no-change submissions.
- Reject submissions without staff name and email.
- Reject submissions with private teen information.
- Prefer metric corrections in the builder's stat fields instead of hardcoded numbers in text.
- Ask staff to resubmit from the builder instead of hand-editing submission JSON.
- Merge only after the dry run confirms the target scope, variant, preview URL, and change summary.
