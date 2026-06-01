# JSU/NCSY Wrapped Pilot Staff Builder Guide

Use this guide when you are invited to test the Wrapped builder. The goal is to help us review real local edits without giving everyone GitHub access.

## Builder Link

Use the builder link your reviewer sends you. It may look like this:

```text
https://stsimon-ncsy.github.io/jsu-wrapped-widget/builder.html?review_email=wrapped-review@example.org
```

The `review_email` part pre-addresses the email draft so your submission goes back to the right reviewer.

Some links may also include `review_url`. If they do, the builder will show an **Open review form** option after it copies your submission JSON.

Reviewers can create this link from the builder by opening **Reviewer setup**, entering the review email and optional form URL, and clicking **Copy staff link**.

## What To Do

1. Pick your region and chapter.
2. Pick the edit scope. Use **This chapter** unless your reviewer specifically asks you to test a region or program default.
3. Make only the changes you want reviewed.
4. Fill in Submission info with your name and email. Add a short reviewer note if there is anything specific to check.
5. Use **Open email draft**, **Open review form** if it is available, **Copy submission**, or **Download submission**.

The preview updates as you work. Click a screen in the editor to jump the preview to that screen.

## What To Edit

Good pilot edits:

- correct a stat that looks wrong
- adjust a headline or subtext for local tone
- choose JSU or NCSY logo
- choose a palette
- update the final CTA, either with an embedded form selector or a direct URL
- add one custom text, metric, or media screen
- create a duplicate version for a donor, parent, school partner, or recruitment audience

Avoid changing everything at once. Smaller submissions are easier to review and merge.

## How To Send It Back

Recommended path:

1. Click **Open email draft**.
2. The builder copies the submission JSON to your clipboard.
3. Check the email draft. Most small submissions are included automatically.
4. If the JSON is not already in the draft, paste the copied JSON into the email before sending.

Other options:

- Use **Copy submission** if you want to paste into Slack, Teams, or a review form.
- Use **Open review form** if your reviewer gave you a form link. The builder copies the submission JSON first. Many small submissions are also filled into the form automatically; if the JSON field is blank, paste the copied JSON before sending.
- Use **Download submission** if attaching a file is easier.
- If you are unsure, download the submission file and send that file to your reviewer.

## Unsafe URLs

If the builder warns about an unsafe direct CTA URL or custom media image URL, fix it before sending. Use `https://`, `http://`, a site path that starts with `/`, or a relative path that starts with `./` or `../`.

## What Not To Send

Do not use Copy JSON unless your reviewer specifically asks for the full config export. For pilot review, the smaller submission JSON is the right file.

Do not edit the submission JSON by hand. If you notice a typo after exporting, fix it in the builder and send a new submission.

Do not send a no-change submission. The builder will ask you to make at least one change before sending.

Do not remove your contact info from the submission. The builder and review tools require name and email so the maintainer can follow up if something needs clarification.

## Quick Message Template

```text
Hi,

I tested the Wrapped builder for [chapter or audience].

What I changed:
- [short summary]

What I want reviewed:
- [anything the reviewer should double-check]

I pasted or attached the builder submission JSON below.
```

## Privacy Note

The submission includes your name, email, reviewer note, selected chapter or scope, preview URL, and the changes you made. Do not include private teen information or unrelated notes in the builder fields.
