"use client";

import { Container } from "@/components/ui/primitives";

/** Route error boundary: never shows internal details to visitors. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Container className="py-24 text-center">
      <p className="font-display text-3xl text-forest-900">Something went wrong · کچھ غلط ہو گیا</p>
      <button type="button" onClick={reset} className="mt-6 rounded-full bg-forest-900 px-6 py-3 text-cream">Try again · دوبارہ کوشش کریں</button>
    </Container>
  );
}
