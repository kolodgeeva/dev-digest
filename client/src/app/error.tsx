/* Route-segment error boundary: catches render/runtime crashes anywhere under
   the root layout that the page's own try/catch + query error states don't.
   Must be a Client Component (Next.js requirement). The per-page loading/error
   states (e.g. ErrorState for failed queries) still handle the expected cases;
   this is the last-resort net for the unexpected. */
"use client";

import { useEffect } from "react";
import { ErrorState } from "@devdigest/ui";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      fullScreen
      title="Something went wrong"
      body={error.message || "An unexpected error occurred. Try again."}
      onRetry={reset}
    />
  );
}
