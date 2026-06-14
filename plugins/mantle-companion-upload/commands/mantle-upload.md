# Upload a file to Mantle

Use the `mantle-companion-upload` MCP tool to upload a local image file
into the connected Mantle site.

Ask for only the missing values:

- local file path
- upload purpose, such as `post-cover`, `product-cover`, or
  `product-image`
- alt text, when the asset is an image

Do not ask the user to paste image bytes or base64. Call the bundled MCP
tool with the local file path and metadata. The tool will request a
Mantle upload session, PUT bytes to signed URLs, then commit and return
the `asset.id` plus preview URLs.

If the tool says the Worker origin or Staff MCP bearer is missing, ask
the operator to provide `MANTLE_WORKER_ORIGIN` / `MANTLE_STAFF_BEARER`
or pass `workerOrigin` / `staffBearer` to the tool. Do not fall back to
base64-in-MCP.
