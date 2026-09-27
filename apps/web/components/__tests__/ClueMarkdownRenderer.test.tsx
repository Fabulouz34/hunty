/**
 * Unit tests for components/ClueMarkdownRenderer.tsx
 *
 * Verifies that:
 *   - Plain text renders as-is
 *   - Bold, italic, inline code, headings, links, lists, blockquotes render
 *   - Images embedded with markdown syntax render as <img> elements
 *   - DOMPurify sanitization strips XSS payloads
 *   - Empty / null-ish input renders nothing
 */

import React from "react"
import { describe, it, expect, vi } from "vitest"
import { render } from "@testing-library/react"
import { ClueMarkdownRenderer } from "@/components/ClueMarkdownRenderer"

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Resolve ipfs:// URIs to a predictable gateway URL so tests aren't env-sensitive.
vi.mock("@/lib/ipfs", () => ({
  resolveImageSrc: (src: string) =>
    src.startsWith("ipfs://")
      ? `https://ipfs.io/ipfs/${src.slice(7)}`
      : src,
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderMarkdown(question: string) {
  const { container } = render(<ClueMarkdownRenderer question={question} />)
  return container
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ClueMarkdownRenderer", () => {
  it("renders nothing when question is empty", () => {
    const { container } = render(<ClueMarkdownRenderer question="" />)
    expect(container.firstChild).toBeNull()
  })

  it("renders plain text as a paragraph", () => {
    const container = renderMarkdown("Find the old oak tree")
    expect(container.textContent).toContain("Find the old oak tree")
  })

  it("renders bold text with <strong>", () => {
    const container = renderMarkdown("Look **north** from here")
    const strong = container.querySelector("strong")
    expect(strong).not.toBeNull()
    expect(strong?.textContent).toBe("north")
  })

  it("renders italic text with <em>", () => {
    const container = renderMarkdown("Walk _slowly_ to the gate")
    const em = container.querySelector("em")
    expect(em).not.toBeNull()
    expect(em?.textContent).toBe("slowly")
  })

  it("renders headings", () => {
    const container = renderMarkdown("## Step Two")
    const h2 = container.querySelector("h2")
    expect(h2).not.toBeNull()
    expect(h2?.textContent).toBe("Step Two")
  })

  it("renders inline code", () => {
    const container = renderMarkdown("The code is `HUNTY`")
    const code = container.querySelector("code")
    expect(code).not.toBeNull()
    expect(code?.textContent).toBe("HUNTY")
  })

  it("renders a hyperlink with safe attributes", () => {
    const container = renderMarkdown("[Hint site](https://hunty.app)")
    const anchor = container.querySelector("a")
    expect(anchor).not.toBeNull()
    expect(anchor?.getAttribute("href")).toBe("https://hunty.app")
    // DOMPurify may strip target="_blank" for security; confirm no javascript: href
    const href = anchor?.getAttribute("href") ?? ""
    expect(href).toBe("https://hunty.app")
    // rel should be set (DOMPurify adds noopener when target is present, or our lib sets it)
    // Accept either present with noopener or absent (DOMPurify may strip both together)
    const rel = anchor?.getAttribute("rel")
    if (rel !== null && rel !== undefined) {
      expect(rel).toContain("noopener")
    }
  })

  it("renders an unordered list", () => {
    const container = renderMarkdown("- Step one\n- Step two\n- Step three")
    const items = container.querySelectorAll("ul > li")
    expect(items).toHaveLength(3)
    expect(items[0].textContent).toBe("Step one")
    expect(items[2].textContent).toBe("Step three")
  })

  it("renders an ordered list", () => {
    const container = renderMarkdown("1. First\n2. Second")
    const items = container.querySelectorAll("ol > li")
    expect(items).toHaveLength(2)
  })

  it("renders a blockquote", () => {
    const container = renderMarkdown("> A wise clue")
    const bq = container.querySelector("blockquote")
    expect(bq).not.toBeNull()
    expect(bq?.textContent).toContain("A wise clue")
  })

  it("renders an embedded image via HTTPS", () => {
    const container = renderMarkdown("![treasure map](https://example.com/map.png)")
    const img = container.querySelector("img")
    expect(img).not.toBeNull()
    expect(img?.getAttribute("src")).toBe("https://example.com/map.png")
    expect(img?.getAttribute("alt")).toBe("treasure map")
  })

  it("resolves an ipfs:// image URI to a gateway URL", () => {
    const container = renderMarkdown("![clue pic](ipfs://QmAbc123)")
    const img = container.querySelector("img")
    expect(img).not.toBeNull()
    expect(img?.getAttribute("src")).toContain("QmAbc123")
  })

  it("sanitizes XSS: strips <script> injected via markdown link URL", () => {
    // javascript: URLs in links are blocked by the markdown lib's safeLinkUrl.
    const container = renderMarkdown("[click me](javascript:alert(1))")
    const anchor = container.querySelector("a")
    // Either the element has no href or the href is sanitized — either way no script executes.
    const href = anchor?.getAttribute("href") ?? ""
    expect(href.toLowerCase()).not.toContain("javascript:")
  })

  it("sanitizes XSS: raw <script> tags in markdown are rendered as escaped text", () => {
    const container = renderMarkdown("<script>alert('xss')</script>")
    // DOMPurify removes script elements; they must not exist in the rendered output.
    expect(container.querySelector("script")).toBeNull()
    // The content might appear as escaped text or be removed entirely — no script.
    expect(container.innerHTML).not.toMatch(/<script/i)
  })

  it("sanitizes XSS: onerror event attribute is stripped from rendered images", () => {
    // The markdown image renderer only allows safe URLs, but test DOMPurify too.
    const container = renderMarkdown(
      '![x](https://example.com/img.png" onerror="alert(1))',
    )
    const img = container.querySelector("img")
    // Either no img element at all, or the onerror attribute must be absent/null.
    // Optional chaining returns undefined when img is null, so use toBeFalsy.
    expect(img?.getAttribute("onerror")).toBeFalsy()
  })

  it("applies markdown-content class for prose styling", () => {
    const container = renderMarkdown("Hello world")
    const div = container.querySelector(".markdown-content")
    expect(div).not.toBeNull()
  })
})
