"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Main restore page - redirects to the first step (upload)
 */
export default function RestorePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/settings/restore/upload");
  }, [router]);

  return null;
}
