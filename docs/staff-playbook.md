# JSU/NCSY Wrapped Staff Playbook

This playbook is for staff using Wrapped as a relationship and momentum tool. It should not live inside the public experience; keep the widget focused and use this as the rollout guide behind the scenes.

## Launch Goals

Use Wrapped to create three concrete outcomes:

- Help chapter staff celebrate teens, schools, advisors, parents, and donors with a polished recap.
- Turn positive attention into next-step interest through the final CTA and Gravity Form.
- Give regional and national teams a measurable way to see which chapters, variants, and audiences are engaging.

Success is not just views. A strong rollout produces shares, replies, form submissions, sponsor conversations, and staff follow-up.

## Audience Paths

Use one default chapter link for broad celebration, then create or link variants only when there is a clear audience reason.

- Chapter Staff: Share the default chapter Wrapped with advisors, teen leaders, school contacts, and families. Add a short personal note, not only the link.
- Regional Staff: Use region-filtered home links to help staff find their chapter, compare momentum across chapters, and spot chapters that need follow-up support.
- Donors and Board Members: Use donor/recruitment variants when copy should emphasize what support made possible and what next year's investment can power.
- Teen Test Version: Keep teen mode clearly labeled as proof of concept until real teen-level data, consent, and privacy review are ready. The public test URL is intentionally marked noindex.

## CTA

The final card should invite action, not only sharing. Recommended CTA language:

```text
Build next year's story
```

or:

```text
Get involved next year
```

Point the CTA to the embedded Gravity Form panel when the widget is hosted on WordPress. Use a direct CTA URL only when the next step lives on a separate page. The widget pre-populates chapter context where possible, so staff should review submissions with the chapter, region, and URL/source information intact.

Good CTA destinations:

- teen leadership or club interest
- parent/community support
- sponsor or donor interest
- staff follow-up for a stronger 2026-2027 launch

Avoid CTAs that only say "learn more" unless there is a real follow-up workflow behind them.

## Outreach

Send Wrapped in waves instead of one blast.

1. Internal preview: regional directors and chapter staff check the numbers, logo, CTA, and final card.
2. Chapter launch: staff send personal links to advisors, teen leaders, and engaged parents.
3. Social push: post the final card or screenshot with a direct link and a local caption.
4. Donor follow-up: use a donor variant or personalized email framing the same numbers as impact.
5. Re-engagement: follow up with everyone who submitted the form or replied with interest.

Suggested staff copy:

```text
We pulled together a quick Wrapped-style recap of what JSU/NCSY made happen this year in [Chapter]. It is a fun read, but also a real picture of the momentum teens built together.

[Link]

If you want to help build next year's story, use the form at the end and we will follow up.
```

## Variants

Use variants sparingly. A variant should exist when the audience needs different framing, not just because the builder can make one.

Good variant reasons:

- donor recap
- school partner recap
- teen leader recruitment
- parent/community support
- regional campaign or Shabbaton follow-up

Keep shared metrics and persona labels consistent across variants. If a metric or persona correction is needed, use the builder's correction flow so generated copy, final card, analytics, and downloads stay aligned.

Choose the smallest scope that fits the audience:

- Chapter scope for one local chapter's public recap.
- Region scope when every chapter in a region should inherit the same CTA, logo choice, or custom screen.
- Program scope when a cross-region effort, Shabbaton series, donor campaign, or program category needs shared framing across chapters.

For pilot staff who should not edit GitHub directly, ask them to fill in the builder's submission info fields, then use **Open email draft**, **Copy submission**, or **Download submission**. That review payload is intentionally smaller than the full config export: it includes the submitter name/email/note, the active chapter, region, or program scope, the variant if one is selected, a change summary, and the exact `merge_path` where the reviewed patch belongs in `wrapped-config-2026.json`.

Send pilot users `docs/pilot-staff-builder-guide.md` with their builder link. It is the short staff-facing version of this workflow.

Use **Open email draft** when staff are sending the JSON straight back to the maintainer; it copies the submission JSON first, then opens a short email note. The draft usually includes the submission JSON automatically; if the edit packet is too large for a reliable email link, staff should paste the copied JSON before sending or use **Download submission**. To make that easy for a pilot group, distribute a pre-addressed builder link with `review_email`, for example `builder.html?review_email=wrapped-review@example.org`. If you create a separate intake form, add `review_url` to the builder link; **Open review form** copies the same submission JSON, opens that form, and appends lightweight context such as `wrapped_scope`, `wrapped_slug`, `wrapped_variant`, and `wrapped_preview`. Staff still need to paste the copied JSON into the form. Use **Copy submission** when staff will paste the JSON into Slack, Teams, or a Gravity Form review field. Use **Download submission** when attaching a file is easier.

The builder blocks no-change review packets. Staff should make at least one copy, metric, CTA, logo, palette, hide/show, or custom-screen change before sending a submission back.

Do not commit downloaded staff submission JSON. These files can include submitter name, email, and reviewer notes; keep them local, in email/Slack, or in an ignored `staff-submissions/` folder while reviewing.

After review, merge a submitted file locally with:

```bash
node review-builder-submissions.js staff-submissions wrapped-config-2026.json
node merge-builder-submission.js path/to/staff-submission.json wrapped-config-2026.json --dry-run
node merge-builder-submission.js path/to/staff-submission.json wrapped-config-2026.json
```

If several staff send JSON back, put the files in an ignored local `staff-submissions/` folder and run `review-builder-submissions.js` first. It validates every file without writing to the deployable config and prints a quick valid/invalid summary with submitter details. Then use the merge dry run on the specific file you want to accept. It validates the packet and prints the submitter, reviewer note, preview URL, and change summary without writing to the deployable config. Then run the real merge, the normal QA gate, and commit/push the updated config.

The merge helper only accepts builder-generated scope or variant paths and validates the resulting config against the current Wrapped data before writing. If it reports validation errors, do not hand-edit around them; fix the submission in the builder or adjust the source data/config intentionally, then rerun the merge.

## Measurement

Review the analytics after launch in three layers:

- Reach: `jsu_wrapped_story_view`, chapter/region scope, and variant usage.
- Engagement: card views, card duration, story completion, autoplay, sound toggles.
- Action: share clicks, download clicks, CTA clicks, and Gravity Form submissions.

Watch for chapters with strong views but low CTA clicks. Those likely need stronger staff follow-up or more specific CTA copy.

Watch for chapters with low views but strong completion. Those likely need better distribution, not a better Wrapped.

## Staff Follow-Up

Every form submission should get a human response. Suggested routing:

- Chapter interest: local chapter staff or regional JSU director.
- Parent/community support: regional development or engagement lead.
- Donor/sponsor interest: development staff.
- School contact: regional director or school-facing staff.

Use the widget prefill to avoid asking the person to repeat context they already came from. The form can receive chapter, region, story scope, program/campaign, variant/version, year, and Wrapped URL fields when those hidden fields exist in Gravity Forms.

## Review Before Sharing

Before a chapter link goes public, check:

- correct chapter and region
- correct JSU or NCSY logo
- final card has no overlapping text
- CTA opens the intended Gravity Form or destination
- share/download image includes the logo and key stats
- no missing numbers, `undefined`, `null`, or stale placeholder text
- analytics events are visible in GTM Preview or GA4 DebugView for the page

When in doubt, fix the data or config first. Do not ask staff to explain around broken numbers in public copy.
