import type { FC } from 'hono/jsx'
import { cn } from '@/lib/utils'
import { getButtonClasses } from '@/components/ui/button'
import { DisplayCard } from '@/components/ui/display-card'

type Cta02Props = {
  eyebrow?: string
  title?: string
  description?: string
  primaryCta?: {
    label: string
    href: string
  }
  secondaryCta?: {
    label: string
    href: string
  }
  class?: string
}

export const Cta02: FC<Cta02Props> = ({
  eyebrow,
  title = '',
  description,
  primaryCta,
  secondaryCta,
  class: className,
}) => (
  <section class={cn('py-16 md:py-24', className)}>
    <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
      <DisplayCard class="p-8 sm:p-10">
        <div class="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-16">
          <div class="flex flex-col gap-3">
            {eyebrow && (
              <p class="text-xs font-medium uppercase tracking-wide text-primary">
                {eyebrow}
              </p>
            )}
            <h2 class="text-3xl tracking-tight sm:text-4xl">
              {title}
            </h2>
          </div>
          <div class="flex flex-col gap-6">
            {description && (
              <p class="text-base text-foreground-muted">
                {description}
              </p>
            )}
            {(primaryCta || secondaryCta) && (
              <div class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
                {primaryCta && (
                  <a
                    href={primaryCta.href}
                    class={cn(getButtonClasses('default'), 'w-full sm:w-auto')}
                  >
                    {primaryCta.label}
                  </a>
                )}
                {secondaryCta && (
                  <a
                    href={secondaryCta.href}
                    class={cn(getButtonClasses('outline'), 'w-full sm:w-auto')}
                  >
                    {secondaryCta.label}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </DisplayCard>
    </div>
  </section>
)

export default Cta02
