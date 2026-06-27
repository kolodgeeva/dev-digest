/* Last-resort boundary for errors thrown in the ROOT layout itself (where the
   normal error.tsx can't render because it lives inside that layout). Must
   render its own <html>/<body> and be a Client Component. */
"use client";

import { ErrorState } from "@devdigest/ui";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" data-theme="dark">
      <body>
        <ErrorState
          fullScreen
          title="Something went wrong"
          body={error.message || "The app failed to load. Try again."}
          onRetry={reset}
        />
      </body>
    </html>
  );
}
