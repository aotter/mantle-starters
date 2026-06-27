import { siteContent } from "./siteContent.js";

const { brand, description } = siteContent;

export type HomeAction = {
  readonly label: string;
  readonly href: string;
};

export type HomeItem = {
  readonly title?: string;
  readonly body?: string;
  readonly label?: string;
  readonly href?: string;
  readonly value?: string;
  readonly icon?: string;
  readonly quote?: string;
  readonly name?: string;
  readonly role?: string;
  readonly company?: string;
  readonly mark?: 1 | 2 | 3 | 4 | 5 | 6;
};

export type HomeField = {
  readonly name: string;
  readonly label: string;
  readonly type?: string;
  readonly placeholder?: string;
  readonly autocomplete?: string;
  readonly required?: boolean;
  readonly multiline?: boolean;
};

export type HomeSection = {
  readonly type:
    | "hero"
    | "socialProof"
    | "content"
    | "features"
    | "bento"
    | "metrics"
    | "testimonials"
    | "faq"
    | "contact"
    | "contactForm"
    | "cta";
  readonly id?: string;
  readonly eyebrow?: string;
  readonly title: string;
  readonly body?: string;
  readonly action?: HomeAction;
  readonly secondaryAction?: HomeAction;
  readonly footerTitle?: string;
  readonly footerBody?: string;
  readonly footerAction?: HomeAction;
  readonly items?: readonly HomeItem[];
  readonly fields?: readonly HomeField[];
};

export type HomeContent = {
  readonly sections: readonly HomeSection[];
};

export const homeContent: HomeContent = {
  sections: [
    {
      type: "hero",
      title: `A useful web presence for ${brand}`,
      body: description,
      action: { label: "Start a conversation", href: "#contact" },
      secondaryAction: { label: "See the work", href: "#work" },
    },
    {
      type: "socialProof",
      title: "A first site shaped for clients, collaborators, and serious inquiries.",
      items: [
        { title: "Studio", mark: 1 },
        { title: "Clients", mark: 2 },
        { title: "Partners", mark: 3 },
        { title: "Press", mark: 4 },
      ],
    },
    {
      type: "content",
      id: "about",
      eyebrow: "About",
      title: `${brand} gives visitors a clear first impression`,
      body: "A concise home base for the work, the people it serves, and the next step.",
      items: [
        {
          body: `${brand} explains the offer in plain language so visitors can decide quickly whether it fits their needs.`,
        },
        {
          body: "The first version stays small: a strong opening, proof points, useful services, and a direct way to start a conversation.",
        },
      ],
    },
    {
      type: "features",
      id: "services",
      eyebrow: "Services",
      title: "What this site makes easy to understand",
      body: "A presence site should help visitors understand the offer, trust the work, and know how to reach you.",
      items: [
        {
          icon: "layout",
          title: "Clear pages",
          body: "Present who you are, what you do, and how visitors should move next.",
        },
        {
          icon: "sparkles",
          title: "Useful first impression",
          body: "Give first-time visitors enough context to trust the next click.",
        },
        {
          icon: "chat",
          title: "Contact ready",
          body: "Capture serious inquiries through a simple contact path.",
        },
        {
          icon: "handshake",
          title: "Proof of work",
          body: "Make services, outcomes, testimonials, and working style easy to scan.",
        },
        {
          icon: "shield",
          title: "Focused trust",
          body: "Answer the questions a serious visitor has before reaching out.",
        },
        {
          icon: "check",
          title: "Easy to update",
          body: "Keep the first structure simple enough to edit as the business changes.",
        },
      ],
    },
    {
      type: "bento",
      id: "work",
      eyebrow: "Work",
      title: "Enough substance before the custom design pass",
      body: "Use these sections to show a real first version with the site's own proof, examples, and visuals.",
      items: [
        {
          title: "Homepage narrative",
          body: "Hero, proof, services, contact, and FAQ give visitors a complete first visit.",
        },
        {
          title: "Service snapshot",
          body: "A compact place to explain the main offer and ideal audience.",
        },
        {
          title: "Proof snapshot",
          body: "A starter area for quotes, partners, outcomes, or recent work.",
        },
      ],
    },
    {
      type: "metrics",
      eyebrow: "Signals",
      title: "A first visit that does not feel empty",
      body: "The page starts with practical sections ready for real details.",
      action: { label: "Open contact", href: "#contact" },
      items: [
        { value: "1", title: "Clear home" },
        { value: "4", title: "Useful sections" },
        { value: "3", title: "Contact fields" },
        { value: "1", title: "Direct next step" },
      ],
    },
    {
      type: "testimonials",
      eyebrow: "Proof",
      title: "Examples of useful social proof",
      body: "Use this area for real quotes, partner names, outcomes, or recent work.",
      items: [
        {
          quote: "The page made the offer obvious and gave prospects a direct way to reach us.",
          name: "Mia Chen",
          role: "Founder",
          company: "Northline Studio",
        },
        {
          quote: "It felt like a proper first version: focused, useful, and ready to iterate.",
          name: "Alex Rivera",
          role: "Creative Lead",
          company: "Field Notes Co.",
        },
        {
          quote: "The structure was simple enough to customize without fighting the page.",
          name: "Sam Patel",
          role: "Operator",
          company: "Harbor Desk",
        },
      ],
    },
    {
      type: "faq",
      eyebrow: "FAQ",
      title: "Questions visitors often ask first",
      body: "Keep answers short, concrete, and specific to the site's real details.",
      items: [
        {
          title: "What kind of work fits best?",
          body: `${brand} is best for focused projects where the next step can be explained clearly before a call.`,
        },
        {
          title: "How quickly can someone get a response?",
          body: "Set a realistic expectation here, then route the contact form to the right inbox.",
        },
        {
          title: "Where should proof or examples go?",
          body: "Use the work section for a small set of examples, outcomes, partner logos, or quotes.",
        },
        {
          title: "Can the site grow later?",
          body: "Yes. Start with the core presence page, then add deeper pages or workflows when they are needed.",
        },
      ],
    },
    {
      type: "contact",
      id: "contact",
      eyebrow: "Contact",
      title: "Give visitors a direct next step",
      body: "Use the form below or list the preferred contact channels.",
      footerTitle: "Prefer a short brief?",
      footerBody: "Share the goal, timeline, and best reply email so the first response has the right context.",
      footerAction: { label: "Send a message", href: "#contact-form" },
      items: [
        {
          icon: "email",
          title: "Email",
          body: "Use the best reply address for new inquiries.",
          value: "hello@example.com",
          href: "mailto:hello@example.com",
        },
        {
          icon: "phone",
          title: "Response",
          body: "Set a realistic expectation for new inquiries.",
          value: "Within one business day",
        },
        {
          icon: "location",
          title: "Location",
          body: "Keep this broad if the site is remote-first.",
          value: "Remote-friendly",
        },
      ],
    },
    {
      type: "contactForm",
      id: "contact-form",
      eyebrow: "Inquiry",
      title: "Send a concise message",
      body: "Tell us what you want to build, who it is for, and the best way to reply.",
      footerBody: "The first version stores the message. Connect real email delivery when the site is ready.",
      action: { label: "Send message", href: "/api/contact" },
      items: [
        { icon: "mail", body: "Name, email, and message" },
        { icon: "clock", body: "A short note is enough for the first reply" },
        { icon: "map", body: "Add the best contact guidance for this team" },
      ],
      fields: [
        {
          name: "name",
          label: "Name",
          type: "text",
          autocomplete: "name",
          placeholder: "Your name",
          required: true,
        },
        {
          name: "email",
          label: "Email",
          type: "email",
          autocomplete: "email",
          placeholder: "you@example.com",
          required: true,
        },
        {
          name: "message",
          label: "Message",
          placeholder: "Tell us what you want to build.",
          required: true,
          multiline: true,
        },
      ],
    },
    {
      type: "cta",
      eyebrow: "Next",
      title: `Make ${brand} easier to understand`,
      body: "Use this page as a starting point, then add real positioning, examples, and contact details.",
      action: { label: "Start contact", href: "#contact" },
      secondaryAction: { label: "Review sections", href: "#about" },
    },
  ],
};
