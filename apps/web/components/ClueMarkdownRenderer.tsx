/**
 * ClueMarkdownRenderer
 *
 * Renders a clue question (markdown string) as sanitized HTML on the web,
 * matching the feature set of the mobile ClueMarkdownRenderer:
 *   - Bold / italic
 *   - Inline code
 *   - Fenced code blocks
 *   - Hyperlinks (safe href, opens in new tab)
 *   - Images embedded via IPFS or HTTPS (resolved through the IPFS gateway)
 *   - Unordered / ordered lists
 *   - Blockquotes
 *   - Headings
 *
 * All output passes through DOMPurify via {@link renderMarkdown} before it
 * reaches the DOM, so it is safe to use with `dangerouslySetInnerHTML`.
 */

import { cn } from "@/lib/utils"
import { MarkdownContent } from "@/components/MarkdownContent"

interface ClueMarkdownRendererProps {
  /** Raw markdown string (clue.question). */
  question: string
  className?: string
}

export function ClueMarkdownRenderer({
  question,
  className,
}: ClueMarkdownRendererProps) {
  if (!question) return null

  return (
    <MarkdownContent
      markdown={question}
      className={cn(
        // Base text style matching the PreviewClueCard / PlayGame question style
        "text-slate-800 dark:text-slate-100 text-base font-medium leading-relaxed",
        className,
      )}
    />
  )
}

export default ClueMarkdownRenderer
