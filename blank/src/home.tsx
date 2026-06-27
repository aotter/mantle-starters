import { renderToString } from "hono/jsx/dom/server";
import { Badge } from "@/components/ui/badge";
import { getButtonClasses } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const archetype = "{{ARCHETYPE}}" as string;
const brand = "{{BRAND}}";
const description =
  "{{DESCRIPTION}}".trim() || "A blank Mantle site is live and ready for the next overlay.";

const sections = [
  {
    title: "Intro",
    body: "A concise opening for who you are and what people can do here.",
  },
  {
    title: "Proof",
    body: "A place for services, work, values, or other useful proof points.",
  },
  {
    title: "Contact",
    body: "A simple path for visitors to start a conversation.",
  },
];

export function renderHome(): string {
  return "<!doctype html>" + renderToString(<HomePage />);
}

function HomePage() {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="mantle:site" content="v1" />
        <title>{brand}</title>
        <link rel="stylesheet" href="/assets/styles.css" />
      </head>
      <body class="min-h-screen bg-background text-foreground antialiased">
        <main class="min-h-screen">
          <section class="py-24 sm:py-32">
            <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <div class="mx-auto flex max-w-2xl flex-col items-center gap-6 text-center">
                <Badge variant="outline">
                  {archetypeLabel(archetype)}
                </Badge>
                <h1 class="max-w-2xl break-words text-4xl font-semibold tracking-normal sm:text-5xl lg:text-6xl">
                  A clear home for {brand}
                </h1>
                <p class="max-w-xl break-words text-lg leading-8 text-foreground-muted">
                  {description}
                </p>
                <div class="mt-2 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
                  <a class={cn(getButtonClasses("default"), "w-full sm:w-auto")} href="#contact">
                    Start a conversation
                  </a>
                  <a class={cn(getButtonClasses("ghost"), "w-full sm:w-auto")} href="#about">
                    Learn more
                  </a>
                </div>
              </div>
            </div>
          </section>

          <section id="about" class="border-y border-border bg-background-subtle py-16">
            <div class="mx-auto grid max-w-6xl gap-4 px-4 sm:px-6 md:grid-cols-3 lg:px-8">
              {sections.map((section) => (
                <Card class="min-w-0 border border-border" key={section.title}>
                  <CardHeader>
                    <CardTitle class="text-base">{section.title}</CardTitle>
                    <CardDescription>{section.body}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </section>

          <section id="contact" class="py-16">
            <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <Card class="min-w-0 border border-border">
                <CardHeader>
                  <Badge variant="outline" class="mb-2">
                    Ready
                  </Badge>
                  <CardTitle class="text-2xl tracking-normal">
                    Contact flow is ready for your overlay.
                  </CardTitle>
                  <CardDescription class="max-w-2xl">
                    The generated repo includes the presence manifest and contact handler shape.
                    Your coding agent can replace this placeholder with the final copy, fields, and delivery setup.
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}

function archetypeLabel(value: string): string {
  return value === "blank" ? "Mantle" : value.charAt(0).toUpperCase() + value.slice(1);
}
