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

const archetype = "{{ARCHETYPE}}" as string;
const brand = "{{BRAND}}";
const description =
  "{{DESCRIPTION}}".trim() ||
  "A focused web presence for services, proof, and simple contact.";

const navLinks = [
  { label: "About", href: "#about" },
  { label: "Services", href: "#services" },
  { label: "Work", href: "#work" },
  { label: "Contact", href: "#contact" },
];

const proofLogos = [
  { name: "Studio", mark: 1 as const },
  { name: "Clients", mark: 2 as const },
  { name: "Partners", mark: 3 as const },
  { name: "Press", mark: 4 as const },
];

const serviceFeatures = [
  {
    icon: LayoutIcon,
    title: "Clear pages",
    description: "Present who you are, what you do, and how visitors should move next.",
  },
  {
    icon: SparklesIcon,
    title: "Useful first impression",
    description: "Give first-time visitors enough context to trust the next click.",
  },
  {
    icon: ChatIcon,
    title: "Contact ready",
    description: "Capture inquiries through the Mantle contact trigger and handler path.",
  },
  {
    icon: HandshakeIcon,
    title: "Proof of work",
    description: "Make services, outcomes, testimonials, and working style easy to scan.",
  },
  {
    icon: ShieldIcon,
    title: "Clean handoff",
    description: "Keep content, manifest, and feature boundaries simple for the coding agent.",
  },
  {
    icon: CheckCircleIcon,
    title: "Deployable base",
    description: "Start from a working Worker site before adding type-specific overlays.",
  },
];

const testimonials = [
  {
    quote: "The page made the offer obvious and gave prospects a direct way to reach us.",
    author: {
      name: "Mia Chen",
      title: "Founder",
      company: "Northline Studio",
    },
  },
  {
    quote: "It felt like a proper first version: focused, useful, and ready to iterate.",
    author: {
      name: "Alex Rivera",
      title: "Creative Lead",
      company: "Field Notes Co.",
    },
  },
  {
    quote: "The structure was simple enough for our agent to customize without fighting it.",
    author: {
      name: "Sam Patel",
      title: "Operator",
      company: "Harbor Desk",
    },
  },
];

const faqs = [
  {
    question: "What should I change first?",
    answer:
      "Start with the page sections and contact copy. The generated manifest and feature files already describe the intended presence shape.",
  },
  {
    question: "Where does the contact form go?",
    answer:
      "The form posts to /api/contact. The presence overlay includes the trigger, contact schema, and notification handler stub.",
  },
  {
    question: "Can this become a richer site?",
    answer:
      "Yes. Keep this blank base, then let the coding agent apply the selected type overlay and theme changes in one deterministic pass.",
  },
  {
    question: "Do I need Cloudflare setup now?",
    answer:
      "The site can deploy first. If you add Turnstile, R2, or email delivery, your agent should guide you through Wrangler or the Cloudflare connector.",
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
        <meta name="mantle:archetype" content={archetype} />
        <title>{brand}</title>
        <meta name="description" content={description} />
        <link rel="stylesheet" href="/assets/styles.css" />
      </head>
      <body class="min-h-screen bg-background text-foreground antialiased">
        <Nav02
          logo={brand}
          links={navLinks}
          ctaText="Start a conversation"
          ctaHref="#contact"
        />
        <main>
          <Hero02
            title={`A useful web presence for ${brand}`}
            description={description}
            primaryCta={{ label: "Start a conversation", href: "#contact" }}
            secondaryCta={{ label: "See the work", href: "#work" }}
          />

          <SocialProof02
            title="A first site shaped for clients, collaborators, and serious inquiries."
            logos={proofLogos}
          />

          <div id="about">
            <Content01
              eyebrow="About"
              title={`${brand} is ready for a clearer first impression`}
              description="Use this generated page as the stable base before your coding agent applies the selected overlay."
              paragraphs={[
                "This starter keeps the launch path small: a deployable Mantle site, a public home page, and the manifest facts needed for the next agent handoff.",
                "Replace the seed copy with your real positioning, then refine layout, visuals, and data-driven sections from the generated repo.",
              ]}
            />
          </div>

          <div id="services">
            <Features02
              eyebrow="Services"
              title="A practical structure for a presence site"
              description="The first version should help visitors understand the offer, trust the work, and know how to reach you."
              features={serviceFeatures}
            />
          </div>

          <div id="work">
            <Bento02
              eyebrow="Work"
              title="Show enough substance before the custom design pass"
              description="These sections are seed content, not a permanent theme. Your agent can replace them without changing the provisioning contract."
              mainCard={{
                title: "Homepage narrative",
                description:
                  "Hero, proof, services, contact, and FAQ are present from the first deploy.",
              }}
              cards={[
                {
                  title: "Overlay boundary",
                  description:
                    "Type-specific content should be applied as a feature overlay on top of the blank base.",
                },
                {
                  title: "Clean theme handoff",
                  description:
                    "Visual overrides belong in user land after the deterministic bundle is working.",
                },
              ]}
            />
          </div>

          <Metrics02
            eyebrow="Signals"
            title="Enough content to avoid an empty first deploy"
            description="The generated site gives the next coding agent real sections to edit instead of a blank canvas."
            cta={{ label: "Open contact", href: "#contact" }}
            metrics={[
              { value: "4", label: "Atoms described" },
              { value: "1", label: "Public home view" },
              { value: "1", label: "Contact trigger" },
              { value: "0", label: "Custom theme layers" },
            ]}
          />

          <Testimonials02
            eyebrow="Proof"
            title="Seed examples for social proof"
            description="Swap these with real quotes, partners, or results once the site is cloned."
            testimonials={testimonials}
          />

          <Faq02
            eyebrow="FAQ"
            title="What the generated repo is ready for"
            description="Keep the first provision deterministic, then let the coding agent customize the site in repo."
            items={faqs}
          />

          <Contact02
            eyebrow="Contact"
            title="Give visitors a direct next step"
            description="Use the form below or replace these contact details with your preferred channels."
            items={[
              {
                icon: "email",
                title: "Email",
                description: "Route this to your real inbox during setup.",
                value: "hello@example.com",
                href: "mailto:hello@example.com",
              },
              {
                icon: "phone",
                title: "Response",
                description: "Set a realistic expectation for new inquiries.",
                value: "Within one business day",
              },
              {
                icon: "location",
                title: "Location",
                description: "Keep this broad if the site is remote-first.",
                value: "Remote-friendly",
              },
            ]}
            footerTitle="Need email delivery?"
            footerDescription="The notification handler is a stub so your coding agent can connect Cloudflare Email Routing or another provider."
            footerCta={{ label: "Send a message", href: "#contact-form" }}
          />

          <ContactForm />

          <Cta02
            eyebrow="Next"
            title={`Make ${brand} yours from the generated repo`}
            description="Clone the repo, apply the selected overlay, replace the seed content, and push. Cloudflare Workers CI can take it from there."
            primaryCta={{ label: "Start contact", href: "#contact" }}
            secondaryCta={{ label: "Review sections", href: "#about" }}
          />
        </main>
        <Footer02
          logo={{ text: brand }}
          tagline="A Mantle site generated with Kiwa UI blocks and ready for the next overlay."
          columns={[
            {
              title: "Site",
              links: [
                { label: "About", href: "#about" },
                { label: "Services", href: "#services" },
                { label: "Work", href: "#work" },
                { label: "Contact", href: "#contact" },
              ],
            },
            {
              title: "Setup",
              links: [
                { label: "Manifest", href: "/api/views/home" },
                { label: "Admin", href: "/admin" },
                { label: "MCP", href: "/mcp" },
              ],
            },
          ]}
          socialLinks={[
            { name: "GitHub", href: "https://github.com", icon: "github" },
          ]}
          copyright={`© ${new Date().getFullYear()} ${brand}.`}
          bottomLinks={[{ label: "Contact", href: "#contact" }]}
        />
        <script type="module" src="/assets/kiwa-home.js" />
      </body>
    </html>
  );
}

function ContactForm() {
  return (
    <section id="contact-form" class="py-16 md:py-24">
      <div class="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <div class="flex flex-col justify-center gap-4">
          <p class="text-xs font-medium uppercase tracking-wide text-primary">
            Inquiry
          </p>
          <h2 class="text-3xl tracking-tight sm:text-4xl">
            Send a concise message
          </h2>
          <p class="max-w-lg text-base text-foreground-muted">
            This form posts to the presence contact trigger. Configure real email delivery after
            cloning the generated repo.
          </p>
          <div class="mt-2 flex flex-col gap-3 text-sm text-foreground-muted">
            <div class="flex items-center gap-2">
              <MailIcon class="size-4 text-foreground" />
              <span>POST /api/contact</span>
            </div>
            <div class="flex items-center gap-2">
              <ClockIcon class="size-4 text-foreground" />
              <span>Notification handler stub included</span>
            </div>
            <div class="flex items-center gap-2">
              <MapPinIcon class="size-4 text-foreground" />
              <span>Replace seed details in user land</span>
            </div>
          </div>
        </div>

        <DisplayCard class="p-6 sm:p-8">
          <form action="/api/contact" method="post" class="flex flex-col gap-5">
            <div class="grid gap-5 sm:grid-cols-2">
              <div class="flex flex-col gap-2">
                <Label for="contact-name">Name</Label>
                <Input
                  id="contact-name"
                  name="name"
                  type="text"
                  autocomplete="name"
                  placeholder="Your name"
                  required
                />
              </div>
              <div class="flex flex-col gap-2">
                <Label for="contact-email">Email</Label>
                <Input
                  id="contact-email"
                  name="email"
                  type="email"
                  autocomplete="email"
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>
            <div class="flex flex-col gap-2">
              <Label for="contact-message">Message</Label>
              <Textarea
                id="contact-message"
                name="message"
                placeholder="Tell us what you want to build."
                class="min-h-32"
                required
              />
            </div>
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p class="text-sm text-foreground-muted">
                The first version stores the message; email delivery is configured separately.
              </p>
              <Button type="submit" class="w-full sm:w-auto">
                Send message
              </Button>
            </div>
          </form>
        </DisplayCard>
      </div>
    </section>
  );
}
