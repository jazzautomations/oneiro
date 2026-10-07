"use client";

// @/app/diary/page.tsx
// "O diário" — the dreamer's personal collection of kept worlds, read as a
// constellation (see <DiaryGallery/>, which owns all the data + the view).
// This page is only the chrome: a thin dreamy header and a gold CTA back into
// the capture flow at "/".

import DiaryGallery from "@/components/DiaryGallery";
import { Button } from "@/components/ui";

export default function DiaryPage(): React.JSX.Element {
  return (
    <main className="relative flex min-h-full flex-1 flex-col px-4 pb-24 pt-[calc(env(safe-area-inset-top)+2rem)] sm:px-8">
      <div className="mx-auto w-full max-w-6xl">
        {/* Header */}
        <header className="flex flex-col gap-6 border-b border-hairline pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="glow-text font-display text-4xl font-light leading-[1.05] sm:text-6xl">
              O diário dos sonhos
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-mist">
              Cada noite que você guardou é um ponto neste céu — percorra a
              constelação e toque num deles para atravessá-lo de novo.
            </p>
          </div>

          <Button href="/create" className="shrink-0 self-start sm:self-auto">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="h-4 w-4"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Sonhar um novo
          </Button>
        </header>

        {/* The collection */}
        <DiaryGallery title={null} className="mt-10" />
      </div>
    </main>
  );
}
