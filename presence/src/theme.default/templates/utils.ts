import { marked } from "marked";

const MARKDOWN_OPTIONS = { gfm: true, breaks: false } as const;

export function renderMarkdown(body: string | undefined): string {
  if (!body) return "";
  return marked.parse(body, MARKDOWN_OPTIONS) as string;
}
