# Presence overlay

Use this when the launch type intent is `presence`.

First useful shape:

- keep `page` as the public homepage content Schema;
- expose the homepage content at `/api/views/home`;
- keep `contact` as the only capture Schema;
- submit messages through `POST /api/contact`;
- let `contact-notify` call the `notify-contact` stub after create.

The notification stub is intentionally best-effort. Configure Cloudflare
Email Service and the `EMAIL` send binding only when the site owner wants
email alerts. Use `mantle:theme` for visual override after the content
model works.
