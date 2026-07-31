"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ReaderWorkspace } from "@/components/reader-workspace";

export default function ReaderPage() {
  const params = useParams<{ id: string }>();
  return (
    <AppShell readerMode>
      <ReaderWorkspace sourceId={params.id} />
    </AppShell>
  );
}
