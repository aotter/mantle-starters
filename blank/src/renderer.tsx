import { jsxRenderer } from "hono/jsx-renderer";
import { asset } from "./web/assets.js";
import { siteContent } from "./web/content/siteContent.js";

const archetype = "{{ARCHETYPE}}" as string;
const themeBootScript = `(() => {
  try {
    const stored = localStorage.getItem("mantle-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", stored ? stored === "dark" : prefersDark);
  } catch {}
})();`;

export const renderer = jsxRenderer(({ children }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="mantle:site" content="v1" />
      <meta name="mantle:archetype" content={archetype} />
      <title>{siteContent.brand}</title>
      <meta name="description" content={siteContent.description} />
      <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      <link rel="stylesheet" href={asset("/assets/styles.css")} />
    </head>
    <body class="min-h-screen bg-background text-foreground antialiased">
      {children}
      <script type="module" src={asset("/assets/kiwa-home.js")} />
    </body>
  </html>
));
