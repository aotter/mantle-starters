export const assetBuild = "mantle-starter-assets-20260629-theme-svg";

export function asset(path: string): string {
  return `${path}?v=${assetBuild}`;
}
