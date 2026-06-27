export type SiteAction = {
  readonly label: string;
  readonly href: string;
};

export type SiteContent = {
  readonly brand: string;
  readonly description: string;
  readonly navLinks: readonly SiteAction[];
  readonly navAction: SiteAction;
  readonly footer: {
    readonly tagline: string;
    readonly columns: readonly {
      readonly title: string;
      readonly links: readonly SiteAction[];
    }[];
    readonly socialLinks: readonly {
      readonly name: string;
      readonly href: string;
      readonly icon: "github" | "linkedin" | "instagram" | "facebook" | "youtube" | "x";
    }[];
    readonly bottomLinks: readonly SiteAction[];
  };
};

export const siteContent: SiteContent = {
  brand: "{{BRAND}}",
  description:
    "{{DESCRIPTION}}".trim() ||
    "A focused studio helping visitors understand the work and get in touch.",
  navLinks: [
    { label: "About", href: "#about" },
    { label: "Services", href: "#services" },
    { label: "Work", href: "#work" },
    { label: "Contact", href: "#contact" },
  ],
  navAction: { label: "Start a conversation", href: "#contact" },
  footer: {
    tagline: "A focused web presence ready for real content, proof, and contact details.",
    columns: [
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
        title: "Contact",
        links: [
          { label: "Email", href: "mailto:hello@example.com" },
          { label: "Inquiry form", href: "#contact-form" },
        ],
      },
    ],
    socialLinks: [{ name: "GitHub", href: "https://github.com", icon: "github" }],
    bottomLinks: [{ label: "Contact", href: "#contact" }],
  },
};
