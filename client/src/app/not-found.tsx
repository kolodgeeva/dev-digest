/* Global 404 — shown for unmatched URLs and explicit notFound() calls.
   Server Component; uses a plain Link (no event handlers) so it stays static. */
import Link from "next/link";
import { EmptyState } from "@devdigest/ui";
import { routes } from "@/lib/routes";

export default function NotFound() {
  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <EmptyState
          icon="Search"
          title="Page not found"
          body="The page you're looking for doesn't exist or has moved."
        />
        <Link href={routes.home()} style={{ color: "var(--accent)", fontSize: 14, fontWeight: 600 }}>
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
