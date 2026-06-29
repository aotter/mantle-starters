# Intake handoff

Use this when the launch type intent is `intake`.

The generated site already includes:

- a seeded visitor-facing page;
- a multi-step branching intake section;
- an `intake-submissions` Schema;
- `/api/intake` for public submissions;
- optional Turnstile verification when Landing provisions keys;
- a stub notification handler for Cloudflare Email Service.

First useful follow-up:

1. Replace the seeded RSVP questions with the owner's real intake.
2. Keep the first version flat and reviewable in Mantle.
3. Add scoring, routing, or member login only after the owner confirms
   those requirements.
