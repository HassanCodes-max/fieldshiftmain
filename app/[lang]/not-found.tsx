import Link from "next/link";
import { Container } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <Container className="py-24 text-center">
      <p className="font-display text-6xl text-forest-900">404</p>
      <p className="mt-3 text-lg text-ink-600">This page does not exist. · یہ صفحہ موجود نہیں۔</p>
      <Link href="/" className="mt-6 inline-block rounded-full bg-forest-900 px-6 py-3 text-cream">Field Shift</Link>
    </Container>
  );
}
