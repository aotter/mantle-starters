import { renderToString } from "hono/jsx/dom/server";
import { Badge } from "@/components/ui/badge";
import { getButtonClasses } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const archetype = "{{ARCHETYPE}}" as string;
const brand = "{{BRAND}}";
const description =
  "{{DESCRIPTION}}".trim() || "A blank Mantle site is live and ready for the next overlay.";

const cards = [
  {
    title: "A focused introduction",
    body: "A short opening makes the work and audience easy to understand.",
  },
  {
    title: "Useful proof points",
    body: "Simple sections can show services, values, or recent work.",
  },
  {
    title: "A clear next step",
    body: "Visitors should know exactly how to start a conversation.",
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
      <body class="overflow-x-hidden bg-background text-foreground">
        <main class="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 overflow-x-hidden px-6 py-12 sm:py-16">
          <section class="grid min-w-0 gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div class="min-w-0 space-y-6">
              <Badge variant={archetype === "presence" ? "default" : "outline"}>
                {archetypeLabel(archetype)}
              </Badge>
              <div class="space-y-4">
                <h1 class="max-w-3xl break-words text-4xl font-semibold leading-tight tracking-normal text-foreground sm:text-6xl">
                  A clear home for {brand}
                </h1>
                <p class="max-w-2xl break-words text-lg leading-8 text-foreground-muted">
                  {description}
                </p>
              </div>
              <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <a class={cn(getButtonClasses("default", "lg"), "w-full sm:w-auto")} href="#contact">
                  Start a conversation
                </a>
                <a class={cn(getButtonClasses("outline", "lg"), "w-full sm:w-auto")} href="#about">
                  Learn more
                </a>
              </div>
            </div>
            <Card class="min-w-0 border border-border shadow-sm">
              <CardHeader>
                <CardTitle>At a glance</CardTitle>
                <CardDescription>
                  Simple starter copy gives the first deploy a real shape.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl class="grid gap-4 text-sm">
                  <HomeFact label="Purpose" value={description} />
                  <HomeFact label="Type" value={archetypeLabel(archetype)} />
                  <HomeFact label="Next step" value="Start a conversation" />
                </dl>
              </CardContent>
            </Card>
          </section>

          <section id="about" class="grid gap-4 md:grid-cols-3">
            {cards.map((card) => (
              <Card class="min-w-0 border border-border" key={card.title}>
                <CardHeader>
                  <CardTitle class="text-base">{card.title}</CardTitle>
                  <CardDescription>{card.body}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </section>

          <section id="contact" class="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <Badge variant="outline-primary">Contact</Badge>
              <h2 class="mt-4 text-2xl font-semibold tracking-normal text-foreground">
                Make the next step obvious.
              </h2>
              <p class="mt-3 max-w-xl leading-7 text-foreground-muted">
                Share a name, email, and short message so the team can follow up
                with the right context.
              </p>
            </div>
            <Card class="min-w-0 border border-border">
              <CardContent class="grid gap-4 pt-6">
                <FakeField label="Name" value="Alex Visitor" />
                <FakeField label="Email" value="alex@example.com" />
                <FakeField label="Message" value={`I would like to learn more about ${brand}.`} multiline />
              </CardContent>
            </Card>
          </section>
        </main>
      </body>
    </html>
  );
}

function HomeFact(props: { label: string; value?: string }) {
  return (
    <div class="grid gap-1">
      <dt class="text-foreground-muted">{props.label}</dt>
      <dd class="break-words text-foreground">{props.value}</dd>
    </div>
  );
}

function FakeField(props: { label: string; value: string; multiline?: boolean }) {
  return (
    <div class="grid gap-2">
      <span class="text-sm font-medium text-foreground">{props.label}</span>
      <div
        class={cn(
          "rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground-muted",
          props.multiline && "min-h-24",
        )}
      >
        {props.value}
      </div>
    </div>
  );
}

function archetypeLabel(value: string): string {
  return value === "blank" ? "Mantle" : value.charAt(0).toUpperCase() + value.slice(1);
}
