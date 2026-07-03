import type { Child, FC } from "hono/jsx";
import { Bento02 } from "@/components/blocks/marketing/bento-02";
import { Contact02 } from "@/components/blocks/marketing/contact-02";
import { Content01 } from "@/components/blocks/marketing/content-01";
import { Cta02 } from "@/components/blocks/marketing/cta-02";
import { Faq02 } from "@/components/blocks/marketing/faq-02";
import { Features02 } from "@/components/blocks/marketing/features-02";
import { Hero02 } from "@/components/blocks/marketing/hero-02";
import { Metrics02 } from "@/components/blocks/marketing/metrics-02";
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
import { asset } from "../assets.js";
import type {
  HomeCondition,
  HomeField,
  HomeItem,
  HomeResult,
  HomeSection,
  HomeStep,
} from "../content/types.js";

const heroImage = {
  src: asset("/assets/mantle-ocean-hero-light.svg"),
  alt: "",
};

const featureIcons: Record<string, FC<{ class?: string }>> = {
  chat: ChatIcon,
  check: CheckCircleIcon,
  handshake: HandshakeIcon,
  layout: LayoutIcon,
  shield: ShieldIcon,
  sparkles: SparklesIcon,
};

export function renderSection(section: HomeSection, index: number, turnstileSiteKey?: string): Child {
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
          class="mantle-social-proof"
          title={section.title}
          logos={items(section).map((item) => ({
            name: item.title ?? item.name ?? "",
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
            title: item.title ?? "",
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
            title: item.title ?? "",
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
              name: item.name ?? "",
              title: item.role ?? "",
              company: item.company ?? "",
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
            question: item.title ?? "",
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
            title: item.title ?? "",
            description: item.body ?? "",
            value: item.value ?? "",
            href: item.href,
          }))}
          footerTitle={section.footerTitle}
          footerDescription={section.footerBody}
          footerCta={section.footerAction}
        />,
      );
    case "form":
      return <FormSection key={key} section={section} turnstileSiteKey={turnstileSiteKey} />;
    case "intake":
      return <IntakeSection key={key} section={section} turnstileSiteKey={turnstileSiteKey} />;
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

function FormSection({
  section,
  turnstileSiteKey,
}: {
  readonly section: HomeSection;
  readonly turnstileSiteKey?: string;
}) {
  const fields = section.fields ?? [];
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
            action={section.action?.href ?? ""}
            method="post"
            class="flex flex-col gap-5"
            data-contact-form="true"
            data-mantle-form="true"
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
              {section.action?.label && (
                <Button type="submit" class="w-full sm:w-auto">{section.action.label}</Button>
              )}
            </div>
            <p
              class="text-sm text-foreground-muted data-[error=true]:text-destructive"
              data-contact-status
              data-mantle-form-status
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

function IntakeSection({
  section,
  turnstileSiteKey,
}: {
  readonly section: HomeSection;
  readonly turnstileSiteKey?: string;
}) {
  const steps = section.steps?.length ? section.steps : [{
    id: "intake",
    title: section.title,
    body: section.body,
  }];
  const fields = section.fields ?? [];
  return (
    <section id={section.id} class="py-16 md:py-24">
      <div class="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.82fr_1.18fr] lg:px-8">
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
          <div class="mt-2 grid gap-3">
            {steps.map((step, index) => (
              <div key={step.id} class="flex gap-3 text-sm text-foreground-muted">
                <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">
                  {index + 1}
                </span>
                <span>
                  <strong class="block text-foreground">{step.title}</strong>
                  {step.body}
                </span>
              </div>
            ))}
          </div>
        </div>

        <DisplayCard class="p-6 sm:p-8" data-intake-root="true">
          <form
            action={section.action?.href ?? ""}
            method="post"
            class="grid gap-6"
            data-intake-form="true"
            data-mantle-form="true"
          >
            <input
              type="hidden"
              name="resultKey"
              value={section.results?.[0]?.key ?? "submitted"}
              data-intake-result-key
            />
            <p class="text-sm font-medium text-primary" data-intake-progress>
              Step 1 of {steps.length}
            </p>
            {steps.map((step, index) => (
              <div data-intake-step-panel data-step-id={step.id} hidden={index !== 0}>
                <div class="grid gap-2">
                  <h3 class="text-xl tracking-tight">{step.title}</h3>
                  {step.body && <p class="text-sm text-foreground-muted">{step.body}</p>}
                </div>
                <div class="mt-5 grid gap-5">
                  {fieldsForStep(fields, steps, step).map((field) => (
                    <FieldControl key={field.name} field={field} />
                  ))}
                </div>
              </div>
            ))}
            {turnstileSiteKey && (
              <div class="cf-turnstile" data-sitekey={turnstileSiteKey}></div>
            )}
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button type="button" variant="outline" class="w-full sm:w-auto" data-intake-prev>
                Back
              </Button>
              <Button type="button" class="w-full sm:w-auto" data-intake-next>
                Next
              </Button>
              <Button type="submit" class="w-full sm:w-auto" data-intake-submit hidden>
                {section.action?.label ?? "Submit"}
              </Button>
            </div>
            <p
              class="text-sm text-foreground-muted data-[error=true]:text-destructive"
              data-mantle-form-status
              hidden
              role="status"
              aria-live="polite"
            ></p>
            <div class="grid gap-3" data-intake-results hidden>
              {results(section).map((result) => (
                <div
                  class="rounded-xl border border-border-subtle bg-muted p-4"
                  data-intake-result={result.key}
                  data-intake-when-field={result.when?.field}
                  data-intake-when-value={conditionValue(result.when)}
                  hidden
                >
                  <strong class="block text-foreground">{result.title}</strong>
                  {result.body && <p class="mt-1 text-sm text-foreground-muted">{result.body}</p>}
                </div>
              ))}
            </div>
          </form>
        </DisplayCard>
      </div>
    </section>
  );
}

function FieldControl({ field }: { readonly field: HomeField }) {
  const controlId = `field-${field.name}`;
  return (
    <div
      class="flex flex-col gap-2"
      data-intake-field={field.name}
      data-intake-step={field.step}
      data-intake-when-field={field.when?.field}
      data-intake-when-value={conditionValue(field.when)}
    >
      <Label for={controlId}>{field.label}</Label>
      {field.options?.length ? (
        <div class="grid gap-2">
          {field.options.map((option, index) => (
            <label class="flex gap-3 rounded-lg border border-border-subtle bg-background p-3 text-sm">
              <input
                id={`${controlId}-${index}`}
                class="mt-1"
                type="radio"
                name={field.name}
                value={option.value}
                required={field.required}
              />
              <span>
                <span class="block font-medium text-foreground">{option.label}</span>
                {option.body && <span class="block text-foreground-muted">{option.body}</span>}
              </span>
            </label>
          ))}
        </div>
      ) : field.multiline ? (
        <Textarea
          id={controlId}
          name={field.name}
          placeholder={field.placeholder}
          class="min-h-32"
          required={field.required}
        />
      ) : (
        <Input
          id={controlId}
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

function fieldsForStep(
  fields: readonly HomeField[],
  steps: readonly HomeStep[],
  step: HomeStep,
): readonly HomeField[] {
  const firstStepId = steps[0]?.id ?? step.id;
  return fields.filter((field) => (field.step ?? firstStepId) === step.id);
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

function results(section: HomeSection): readonly HomeResult[] {
  return section.results ?? [];
}

function conditionValue(condition: HomeCondition | undefined): string | undefined {
  if (!condition) return undefined;
  return (condition.oneOf ?? (condition.equals ? [condition.equals] : [])).join("|");
}

function featureIcon(name: string | undefined): FC<{ class?: string }> {
  return featureIcons[name ?? "sparkles"] ?? SparklesIcon;
}

function contactIcon(name: string | undefined): "email" | "phone" | "location" {
  if (name === "phone") return "phone";
  if (name === "location") return "location";
  return "email";
}
