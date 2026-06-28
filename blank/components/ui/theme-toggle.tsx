import type { FC } from "hono/jsx";
import { cn } from "@/lib/utils";
import { getButtonClasses } from "@/components/ui/button";
import { MoonIcon, SunIcon } from "@/components/ui/icon";

type ThemeToggleProps = {
  showLabel?: boolean;
  class?: string;
};

export const ThemeToggle: FC<ThemeToggleProps> = ({
  showLabel = false,
  class: className,
}) => (
  <button
    type="button"
    data-theme-toggle
    data-theme="light"
    aria-label="Toggle color theme"
    aria-pressed="false"
    class={cn(getButtonClasses("ghost", showLabel ? "sm" : "iconSm"), className)}
  >
    <MoonIcon data-theme-icon="moon" class="size-4" />
    <SunIcon data-theme-icon="sun" class="size-4" />
    {showLabel && <span data-theme-label>Dark mode</span>}
  </button>
);
