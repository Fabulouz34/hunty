import type { Metadata } from "next";

/**
 * Embed layout — deliberately minimal.
 *
 * The embed page is rendered inside a third-party <iframe> so we:
 *   • skip the full app shell (nav, footer, providers)
 *   • add a responsive viewport meta tag
 *   • ensure the html/body fill the iframe container with no margin/padding
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function EmbedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      {/*
       * Next.js App Router does not forward a root layout's <html>/<body>
       * tags into a nested layout's output — each segment renders its own
       * tree.  We therefore set the bare minimum here for the embed shell.
       *
       * viewport meta is rendered by Next.js from the export below; we
       * add explicit CSS resets inline so the card fills the iframe with
       * no white-space artefacts regardless of host-page styles.
       */}
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={{ margin: 0, padding: 0, background: "transparent" }}>
        {children}
      </body>
    </html>
  );
}
