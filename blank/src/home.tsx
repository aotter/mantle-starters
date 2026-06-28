import type { Child, FC } from "hono/jsx";
import { renderToString } from "hono/jsx/dom/server";
import { Bento02 } from "@/components/blocks/marketing/bento-02";
import { Contact02 } from "@/components/blocks/marketing/contact-02";
import { Content01 } from "@/components/blocks/marketing/content-01";
import { Cta02 } from "@/components/blocks/marketing/cta-02";
import { Faq02 } from "@/components/blocks/marketing/faq-02";
import { Features02 } from "@/components/blocks/marketing/features-02";
import { Footer02 } from "@/components/blocks/marketing/footer-02";
import { Hero02 } from "@/components/blocks/marketing/hero-02";
import { Metrics02 } from "@/components/blocks/marketing/metrics-02";
import { Nav02 } from "@/components/blocks/marketing/nav-02";
import { SocialProof02 } from "@/components/blocks/marketing/social-proof-02";
import { Testimonials02 } from "@/components/blocks/marketing/testimonials-02";
import { Button } from "@/components/ui/button";
import { DisplayCard } from "@/components/ui/display-card";
import {
  ChatIcon,
  CheckCircleIcon,
  ClockIcon,
  HandshakeIcon,
  LayoutIcon,
  MailIcon,
  MapPinIcon,
  ShieldIcon,
  SparklesIcon,
} from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { homeContent, type HomeField, type HomeItem, type HomeSection } from "./homeContent.js";
import { siteContent } from "./siteContent.js";

const archetype = "{{ARCHETYPE}}" as string;
const assetBuild = "mantle-starter-assets-20260628-theme-turnstile";
const asset = (path: string) => `${path}?v=${assetBuild}`;
const heroImage = {
  src: asset("/assets/mantle-ocean-hero.svg"),
  alt: "",
};
const themeBootScript = `(() => {
  try {
    const stored = localStorage.getItem("mantle-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", stored ? stored === "dark" : prefersDark);
  } catch {}
})();`;

type HomePageProps = {
  readonly turnstileSiteKey?: string;
};

const featureIcons: Record<string, FC<{ class?: string }>> = {
  chat: ChatIcon,
  check: CheckCircleIcon,
  handshake: HandshakeIcon,
  layout: LayoutIcon,
  shield: ShieldIcon,
  sparkles: SparklesIcon,
};

export function renderHome(options: HomePageProps = {}): string {
  return "<!doctype html>" + renderToString(<HomePage {...options} />);
}

function HomePage({ turnstileSiteKey }: HomePageProps) {
  const siteKey = turnstileSiteKey?.trim();
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="mantle:site" content="v1" />
        <meta name="mantle:archetype" content={archetype} />
        <title>{siteContent.brand}</title>
        <meta name="description" content={siteContent.description} />
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        {siteKey && (
          <script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js"
            async
            defer
          ></script>
        )}
        <link rel="stylesheet" href={asset("/assets/styles.css")} />
      </head>
      <body class="min-h-screen bg-background text-foreground antialiased">
        <Nav02
          logo={siteContent.brand}
          links={siteContent.navLinks.map((link) => ({ ...link }))}
          ctaText={siteContent.navAction.label}
          ctaHref={siteContent.navAction.href}
        />
        <main>{homeContent.sections.map((section, index) => renderSection(section, index, siteKey))}</main>
        <Footer02
          logo={{ text: siteContent.brand }}
          tagline={siteContent.footer.tagline}
          columns={siteContent.footer.columns.map((column) => ({
            title: column.title,
            links: column.links.map((link) => ({ ...link })),
          }))}
          socialLinks={siteContent.footer.socialLinks.map((link) => ({ ...link }))}
          copyright={`Copyright ${new Date().getFullYear()} ${siteContent.brand}.`}
          bottomLinks={siteContent.footer.bottomLinks.map((link) => ({ ...link }))}
        />
        <script type="module" src={asset("/assets/kiwa-home.js")} />
      </body>
    </html>
  );
}

function renderSection(section: HomeSection, index: number, turnstileSiteKey?: string): Child {
  const key = `${section.type}-${section.id ?? index}`;
  switch (section.type) {
    case "hero":
      return (
        <Hero02
          key={key}
          title={section.title}
          description={section.body}
          primaryCta={section.action}
          secondaryCta={section.secondaryAction}
          image={heroImage}
        />
      );
    case "socialProof":
      return (
        <SocialProof02
          key={key}
          title={section.title}
          logos={items(section).map((item) => ({
            name: item.title ?? item.name ?? "Logo",
            mark: item.mark ?? 1,
          }))}
        />
      );
    case "content":
      return withAnchor(
        section,
        key,
        <Content01
          eyebrow={section.eyebrow}
          title={section.title}
          description={section.body}
          paragraphs={items(section).map((item) => item.body ?? "").filter(Boolean)}
        />,
      );
    case "features":
      return withAnchor(
        section,
        key,
        <Features02
          eyebrow={section.eyebrow}
          title={section.title}
          description={section.body}
          features={items(section).map((item) => ({
            icon: featureIcon(item.icon),
            title: item.title ?? "Feature",
            description: item.body ?? "",
          }))}
        />,
      );
    case "bento": {
      const [mainItem, ...cardItems] = items(section);
      return withAnchor(
        section,
        key,
        <Bento02
          eyebrow={section.eyebrow}
          title={section.title}
          description={section.body}
          mainCard={{
            title: mainItem?.title ?? section.title,
            description: mainItem?.body ?? section.body ?? "",
          }}
          cards={cardItems.map((item) => ({
            title: item.title ?? "Detail",
            description: item.body ?? "",
          }))}
        />,
      );
    }
    case "metrics":
      return withAnchor(
        section,
        key,
        <Metrics02
          eyebrow={section.eyebrow}
          title={section.title}
          description={section.body}
          cta={section.action}
          metrics={items(section).map((item) => ({
            value: item.value ?? "",
            label: item.title ?? item.label ?? "",
          }))}
        />,
      );
    case "testimonials":
      return withAnchor(
        section,
        key,
        <Testimonials02
          eyebrow={section.eyebrow}
          title={section.title}
          description={section.body}
          testimonials={items(section).map((item) => ({
            quote: item.quote ?? item.body ?? "",
            author: {
              name: item.name ?? "Example Client",
              title: item.role ?? "Client",
              company: item.company ?? siteContent.brand,
            },
          }))}
        />,
      );
    case "faq":
      return withAnchor(
        section,
        key,
        <Faq02
          eyebrow={section.eyebrow}
          title={section.title}
          description={section.body}
          items={items(section).map((item) => ({
            question: item.title ?? "Question",
            answer: item.body ?? "",
          }))}
        />,
      );
    case "contact":
      return withAnchor(
        section,
        key,
        <Contact02
          eyebrow={section.eyebrow}
          title={section.title}
          description={section.body}
          items={items(section).map((item) => ({
            icon: contactIcon(item.icon),
            title: item.title ?? "Contact",
            description: item.body ?? "",
            value: item.value ?? "",
            href: item.href,
          }))}
          footerTitle={section.footerTitle}
          footerDescription={section.footerBody}
          footerCta={section.footerAction}
        />,
      );
    case "contactForm":
      return <ContactFormSection key={key} section={section} turnstileSiteKey={turnstileSiteKey} />;
    case "cta":
      return withAnchor(
        section,
        key,
        <Cta02
          eyebrow={section.eyebrow}
          title={section.title}
          description={section.body}
          primaryCta={section.action}
          secondaryCta={section.secondaryAction}
        />,
      );
  }
}

function ContactFormSection({
  section,
  turnstileSiteKey,
}: {
  readonly section: HomeSection;
  readonly turnstileSiteKey?: string;
}) {
  const fields = section.fields?.length ? section.fields : defaultContactFields;
  return (
    <section id={section.id} class="py-16 md:py-24">
      <div class="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <div class="flex flex-col justify-center gap-4">
          {section.eyebrow && (
            <p class="text-xs font-medium uppercase tracking-wide text-primary">
              {section.eyebrow}
            </p>
          )}
          <h2 class="text-3xl tracking-tight sm:text-4xl">{section.title}</h2>
          {section.body && (
            <p class="max-w-lg text-base text-foreground-muted">{section.body}</p>
          )}
          <div class="mt-2 flex flex-col gap-3 text-sm text-foreground-muted">
            {items(section).map((item, index) => (
              <div key={index} class="flex items-center gap-2">
                <InlineIcon name={item.icon} />
                <span>{item.body ?? item.title}</span>
              </div>
            ))}
          </div>
        </div>

        <DisplayCard class="p-6 sm:p-8">
          <form
            action={section.action?.href ?? "/api/contact"}
            method="post"
            class="flex flex-col gap-5"
            data-contact-form="true"
          >
            <div class="grid gap-5 sm:grid-cols-2">
              {fields.slice(0, 2).map((field) => (
                <FieldControl key={field.name} field={field} />
              ))}
            </div>
            {fields.slice(2).map((field) => (
              <FieldControl key={field.name} field={field} />
            ))}
            {turnstileSiteKey && (
              <div class="cf-turnstile" data-sitekey={turnstileSiteKey}></div>
            )}
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {section.footerBody && (
                <p class="text-sm text-foreground-muted">{section.footerBody}</p>
              )}
              <Button type="submit" class="w-full sm:w-auto">
                {section.action?.label ?? "Send message"}
              </Button>
            </div>
            <p
              class="text-sm text-foreground-muted data-[error=true]:text-destructive"
              data-contact-status
              hidden
              role="status"
              aria-live="polite"
            ></p>
          </form>
        </DisplayCard>
      </div>
    </section>
  );
}

function FieldControl({ field }: { readonly field: HomeField }) {
  return (
    <div class="flex flex-col gap-2">
      <Label for={`contact-${field.name}`}>{field.label}</Label>
      {field.multiline ? (
        <Textarea
          id={`contact-${field.name}`}
          name={field.name}
          placeholder={field.placeholder}
          class="min-h-32"
          required={field.required}
        />
      ) : (
        <Input
          id={`contact-${field.name}`}
          name={field.name}
          type={field.type ?? "text"}
          autocomplete={field.autocomplete}
          placeholder={field.placeholder}
          required={field.required}
        />
      )}
    </div>
  );
}

function InlineIcon({ name }: { readonly name?: string }) {
  if (name === "clock") return <ClockIcon class="size-4 text-foreground" />;
  if (name === "map") return <MapPinIcon class="size-4 text-foreground" />;
  return <MailIcon class="size-4 text-foreground" />;
}

function withAnchor(section: HomeSection, key: string, child: Child): Child {
  return section.id ? (
    <div key={key} id={section.id}>
      {child}
    </div>
  ) : (
    child
  );
}

function items(section: HomeSection): readonly HomeItem[] {
  return section.items ?? [];
}

function featureIcon(name: string | undefined): FC<{ class?: string }> {
  return featureIcons[name ?? "sparkles"] ?? SparklesIcon;
}

function contactIcon(name: string | undefined): "email" | "phone" | "location" {
  if (name === "phone") return "phone";
  if (name === "location") return "location";
  return "email";
}

const defaultContactFields: readonly HomeField[] = [
  { name: "name", label: "Name", type: "text", autocomplete: "name", required: true },
  { name: "email", label: "Email", type: "email", autocomplete: "email", required: true },
  { name: "message", label: "Message", required: true, multiline: true },
];
