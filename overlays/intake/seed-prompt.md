# Intake seed prompt

Create short homepage copy for `{{BRAND}}` in the canonical locale. Keep
the homepage visitor-facing: explain the intake, then drive to one
multi-step branching form.

The homepage is seeded through `.mantle/overlays/intake/seed.json`:
`site` controls nav/footer/brand metadata, and
`collections.page[0].sections` controls every visible homepage section.
Use `intake` for the main form section. Keep fields flat enough to store
directly in the `intake-submissions` Schema.

Use the RSVP/application shape unless the owner asks for quiz scoring:
name, email, one decision question, conditional follow-up fields, and
result copy keyed by the decision answer.

Also create one sample `intake-submissions` draft that demonstrates the
expected response shape. Keep visitor-facing copy separate from
handoff/setup instructions, and keep all copy easy to replace by the
site owner.
