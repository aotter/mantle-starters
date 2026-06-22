# Publication overlay

Use this when the launch type intent is `publication`.

First useful shape:

- keep `posts` as the core Schema;
- expose `published-posts` at `/api/views/published-posts`;
- add only the public route/layout needed to show a post list and one
  post detail page;
- seed one draft and one published example through Staff MCP.

Use `mantle:theme` for brand and Kiwa layout polish after the content
model works.
