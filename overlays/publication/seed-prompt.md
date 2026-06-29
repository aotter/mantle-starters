# Publication seed prompt

The homepage is seeded through `.mantle/overlays/publication/seed.json`:

- `site` controls nav/footer/brand metadata.
- `collections.page[0].sections` controls every visible homepage block.
- `collections.posts` gives the coding agent the first publication data
  shape to replace.

Create two short published posts and one draft for `{{BRAND}}` in the
canonical locale. One post should explain the site's purpose. One should
demonstrate a normal update/news entry. Keep copy short enough to inspect
in local preview.
