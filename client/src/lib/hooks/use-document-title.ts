/* Sets the browser tab title from a client route view. Pages here are Client
   Components, so Next's generateMetadata (server-only) isn't available — this is
   the client-side equivalent. Pass a falsy value while data is still loading to
   keep the current title; restores the previous title on unmount. */
"use client";

import { useEffect } from "react";

const SUFFIX = "DevDigest";

export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return;
    const prev = document.title;
    document.title = `${title} · ${SUFFIX}`;
    return () => {
      document.title = prev;
    };
  }, [title]);
}
