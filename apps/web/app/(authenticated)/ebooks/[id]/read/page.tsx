"use client";

import { use } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

// The reader touches browser-only APIs (custom elements, pdf.js worker) at
// module scope, so it must never be server-rendered.
const ReaderShell = dynamic(
  () => import("../../../../../components/ebooks/reader/reader-shell"),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

export default function ReadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <ReaderShell ebookId={id} />;
}
