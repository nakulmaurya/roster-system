# Recorded product walkthrough

`../public/walkthrough.mp4` is a captioned236.2second (3:56) recording of the actual deployed browser application, using fictional isolated demo data. It has no voiceover and does not impersonate the applicant. A reviewer can also use the live app directly.

The recording shows genuine unresolved staffing constraints rather than silently altering eligibility or requirements to claim success. Full valid publication with realistic30-person staffing is separately covered by the final public acceptance case.

## Chapters

- 00:00 — Roster Studio | A real, database-backed operations planning workspace.
- 00:12 — Try demo creates an isolated PostgreSQL workspace with 30 fictional employees.
- 00:32 — Calendars are month-aware: February 2028 includes leap day.
- 00:48 — Brand view distinguishes operating calendars from employee schedules.
- 01:04 — Person view shows working days, time off and individual allocation.
- 01:18 — Pod view groups resources under operational leads.
- 01:30 — Process view includes bundled services that cover that process.
- 01:46 — Eligibility is explicit. The scheduler never invents authorization.
- 02:04 — Services expose operating calendars, staffing, timed shifts and timezone.
- 02:22 — Catalog management supports people, brands, processes, pods and leads.
- 02:38 — Simulate a real sole-primary absence after generation.
- 02:54 — Coverage is revalidated immediately. Mandatory gaps block publication.
- 03:12 — The assignment inspector explains eligibility and available replacements.
- 03:30 — Humans authorize changes; automatic repair uses eligible resources only.
- 03:44 — Assessment demo | Server persistence, validated changes, explicit limitations.

## Validation

All 15 captured scene states were visually inspected. Caption sizing was corrected to a separate 100px footer; representative final encoded frames were inspected. Full MP4 decode returned no errors. External HTTPS download matched the release bytes; browser playback/seek checks are retained in release evidence. The applicant should review and optionally narrate it before submission. Hosting shares the temporary assessment domain, so a durable video upload is recommended with the GitHub submission.

## Locally narrated edition

`../public/walkthrough-narrated.mp4` adds English narration generated on the VM with Kokoro-82M, voice `af_heart`, CPU only, in a separate environment. Three preset-voice auditions were generated; no voice cloning was used. Speech is aligned to15 scene windows, at natural speed 1.0 with no cuts or overlap; two passages were shortened and regenerated. The original video stream is byte-for-byte unchanged.

The narrated edition passed full decode, bounded audio level checks, scene timing, external-download hash comparison and browser playback. These are technical checks, not an independent human listening or pronunciation review. See `verification/narration/` and `../tools/narration/transcript.md`.
