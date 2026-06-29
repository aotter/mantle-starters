export type SiteAction = {
  readonly label: string;
  readonly href: string;
};

export type SiteContent = {
  readonly brand: string;
  readonly description: string;
  readonly navLinks: readonly SiteAction[];
  readonly navAction?: SiteAction;
  readonly footer: {
    readonly tagline?: string;
    readonly copyright?: string;
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
  readonly step?: string;
  readonly options?: readonly {
    readonly label: string;
    readonly value: string;
    readonly body?: string;
  }[];
  readonly when?: HomeCondition;
};

export type HomeCondition = {
  readonly field: string;
  readonly equals?: string;
  readonly oneOf?: readonly string[];
};

export type HomeStep = {
  readonly id: string;
  readonly title: string;
  readonly body?: string;
};

export type HomeResult = {
  readonly key: string;
  readonly title: string;
  readonly body?: string;
  readonly when?: HomeCondition;
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
    | "form"
    | "intake"
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
  readonly steps?: readonly HomeStep[];
  readonly results?: readonly HomeResult[];
};

export type HomeContent = {
  readonly sections: readonly HomeSection[];
};
