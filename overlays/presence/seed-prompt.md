# Presence seed prompt

Create short homepage copy for `{{BRAND}}` in the canonical locale.
Keep the first screen useful without requiring images. The homepage is
seeded through `.mantle/overlays/presence/seed.json`: `site` controls
nav/footer/brand metadata, and `collections.page[0].sections` controls
every visible homepage section. The result should fit the `page` Schema
with one `home` page. Keep the homepage as an ordered `sections` array
using these section types when they are useful:
hero, socialProof, content, features, bento, metrics, testimonials, faq,
contact, form, contactForm, and cta. Prefer `form`; `contactForm` is kept
as a compatibility alias.

Also create one sample `contact` draft that demonstrates the expected
message shape. Keep visitor-facing copy separate from handoff/setup
instructions, and keep all copy easy to replace by the site owner.
