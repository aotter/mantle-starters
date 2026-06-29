import type { FC } from 'hono/jsx'
import { cn } from '@/lib/utils'
import { getButtonClasses } from '@/components/ui/button'
import { MenuIcon, XIcon } from '@/components/ui/icon'
import { ThemeToggle } from '@/components/ui/theme-toggle'

type NavLink = {
  label: string
  href: string
}

type Nav02Props = {
  logo?: string
  logoHref?: string
  links?: NavLink[]
  loginText?: string
  loginHref?: string
  ctaText?: string
  ctaHref?: string
  class?: string
}

export const Nav02: FC<Nav02Props> = ({
  logo = '',
  logoHref = '/',
  links = [],
  loginText,
  loginHref = '#',
  ctaText,
  ctaHref = '#',
  class: className,
}) => (
  <nav data-site-nav class={cn('border-b border-b-border-subtle bg-background', className)}>
    <div data-site-nav-inner class="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
      <div class="flex items-center gap-8">
        <a href={logoHref} data-site-nav-logo class="text-lg font-semibold tracking-tight text-foreground">
          {logo}
        </a>
        <div class="hidden items-center gap-1 lg:flex">
          {links.map((link) => (
            <a
              href={link.href}
              class="inline-flex h-8 items-center rounded-lg px-3 text-sm font-medium text-foreground-muted transition-colors hover:bg-secondary hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>

      <div class="flex items-center gap-3">
        <div class="hidden items-center gap-3 lg:flex">
          {loginText && (
            <a href={loginHref} class={getButtonClasses('ghost', 'sm')}>
              {loginText}
            </a>
          )}
          {ctaText && (
            <a href={ctaHref} class={getButtonClasses('default', 'sm')}>
              {ctaText}
            </a>
          )}
          <ThemeToggle />
        </div>

        <button
          data-mobile-nav-trigger
          class={cn(getButtonClasses('ghost', 'iconSm'), 'group lg:hidden')}
          aria-controls="mobile-navigation"
          aria-expanded="false"
          aria-label="Open navigation"
        >
          <MenuIcon class="size-4 group-aria-expanded:hidden" />
          <XIcon class="hidden size-4 group-aria-expanded:block" />
        </button>
      </div>
    </div>

    <div
      id="mobile-navigation"
      data-mobile-nav
      data-sheet
      data-sheet-side="right"
      data-state="closed"
      class="fixed inset-0 z-50 lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Navigation"
    >
      <button
        data-sheet-overlay
        data-mobile-nav-close="true"
        class="fixed inset-0 bg-background/80 backdrop-blur-sm"
        aria-label="Close navigation"
      />
      <div
        data-sheet-content
        class="fixed inset-y-0 right-0 flex h-dvh w-80 max-w-[calc(100vw-2rem)] flex-col border-l border-border-subtle bg-background p-4 shadow-xl"
      >
        <div class="flex h-10 items-center justify-between gap-4">
          <a href={logoHref} data-mobile-nav-close="true" class="text-base font-semibold tracking-tight text-foreground">
            {logo}
          </a>
          <button
            data-mobile-nav-close="true"
            class={getButtonClasses('ghost', 'iconSm')}
            aria-label="Close navigation"
          >
            <XIcon class="size-4" />
          </button>
        </div>

        <div class="mt-8 flex flex-col gap-1">
          {links.map((link) => (
            <a
              href={link.href}
              data-mobile-nav-close="true"
              data-mobile-nav-link
              class="flex min-h-11 items-center rounded-lg px-3 text-base font-medium text-foreground transition-colors hover:bg-muted"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div class="mt-auto flex flex-col gap-2 pt-8">
          <ThemeToggle showLabel class="w-full" />
          {loginText && (
            <a href={loginHref} data-mobile-nav-close="true" class={cn(getButtonClasses('ghost', 'sm'), 'w-full')}>
              {loginText}
            </a>
          )}
          {ctaText && (
            <a href={ctaHref} data-mobile-nav-close="true" class={cn(getButtonClasses('default', 'sm'), 'w-full')}>
              {ctaText}
            </a>
          )}
        </div>
      </div>
    </div>
  </nav>
)

export default Nav02
