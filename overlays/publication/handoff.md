# Publication overlay

Use this when the launch type intent is `publication`.

First useful shape:

- keep the public homepage driven by
  `.mantle/overlays/publication/seed.json`;
- use `site` for nav/footer/brand metadata and
  `collections.page[0].sections` for every visible homepage block;
- keep `posts` as the core Schema;
- expose `published-posts` at `/api/views/published-posts`;
- replace the seeded publication cards and posts before adding custom
  archive/detail routes.

Use `mantle:theme` for brand and Kiwa layout polish after the content
model works.

Do not restore the old publication-specific starter or `theme.default`
path. Publication now grows from the same blank Kiwa runtime as presence
and intake.
