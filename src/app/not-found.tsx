import { Compass } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ButtonLink, EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="status-page">
      <Link href="/" className="brand" aria-label="Standing, home">
        <Logo size={28} />
        Standing
      </Link>
      <EmptyState icon={Compass} title="This page doesn't exist" action={<ButtonLink href="/">Go to the home page</ButtonLink>}>
        The link may be old or mistyped. Nothing about your account has changed.
      </EmptyState>
    </main>
  );
}
