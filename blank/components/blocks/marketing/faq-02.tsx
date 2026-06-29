import type { FC } from 'hono/jsx'
import { cn } from '@/lib/utils'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

type FaqItem = {
  question: string
  answer: string
}

type Faq02Props = {
  eyebrow?: string
  title?: string
  description?: string
  items?: FaqItem[]
  showHeader?: boolean
  class?: string
}

export const Faq02: FC<Faq02Props> = ({
  eyebrow,
  title = '',
  description,
  items = [],
  showHeader = true,
  class: className,
}) => {
  const mid = Math.ceil(items.length / 2)
  const leftItems = items.slice(0, mid)
  const rightItems = items.slice(mid)

  return (
    <section class={cn('py-16 md:py-24', className)}>
      <div class="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        {showHeader && (
          <div class="mx-auto max-w-2xl text-center">
            <div class="flex flex-col gap-3">
              {eyebrow && (
                <p class="text-xs font-medium uppercase tracking-wide text-primary">
                  {eyebrow}
                </p>
              )}
              <h2 class="text-3xl tracking-tight text-foreground sm:text-4xl">
                {title}
              </h2>
            </div>
            {description && (
              <p class="mx-auto mt-4 max-w-lg text-base text-foreground-muted">
                {description}
              </p>
            )}
          </div>
        )}

        <div class={cn('grid gap-8 lg:grid-cols-2 lg:gap-12', showHeader && 'mt-12')}>
          <Accordion type="single">
            {leftItems.map((item, index) => (
              <AccordionItem key={index} value={`faq-left-${index}`}>
                <AccordionTrigger class="text-left text-base">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent>
                  <p class="text-foreground-muted">{item.answer}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <Accordion type="single">
            {rightItems.map((item, index) => (
              <AccordionItem key={index} value={`faq-right-${index}`}>
                <AccordionTrigger class="text-left text-base">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent>
                  <p class="text-foreground-muted">{item.answer}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  )
}

export default Faq02
