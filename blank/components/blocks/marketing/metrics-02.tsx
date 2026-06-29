import type { FC } from 'hono/jsx'
import { cn } from '@/lib/utils'
import { getButtonClasses } from '@/components/ui/button'

type Metric = {
  value: string
  label: string
}

type Metrics02Props = {
  eyebrow?: string
  title?: string
  description?: string
  cta?: {
    label: string
    href: string
  }
  metrics?: Metric[]
  showHeader?: boolean
  class?: string
}

export const Metrics02: FC<Metrics02Props> = ({
  eyebrow,
  title = '',
  description,
  cta,
  metrics = [],
  showHeader = true,
  class: className,
}) => (
  <section class={cn('py-16 md:py-24', className)}>
    <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
      <div class="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
        {showHeader && (
          <div class="flex flex-col gap-4">
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
            {description && (
              <p class="max-w-lg text-base text-foreground-muted">
                {description}
              </p>
            )}
            {cta && (
              <div class="mt-4">
                <a href={cta.href} class={getButtonClasses('outline')}>
                  {cta.label}
                </a>
              </div>
            )}
          </div>
        )}
        <div class="grid grid-cols-2 gap-x-12 gap-y-8">
          {metrics.map((metric) => (
            <div key={metric.label} class="border-l border-border pl-6">
              <div class="text-3xl font-semibold tracking-tight text-foreground">
                {metric.value}
              </div>
              <div class="mt-2 text-sm font-medium text-foreground">
                {metric.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
)

export default Metrics02
