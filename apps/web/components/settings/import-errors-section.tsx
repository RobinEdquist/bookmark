"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/ui/collapsible";
import { useImportErrors } from "../../lib/use-import-errors";
import { ImportErrorCard } from "./import-error-card";

export function ImportErrorsSection() {
  const t = useTranslations("settings.libraries.importErrors");
  const { data, isLoading } = useImportErrors();

  const errorCount = data?.total ?? 0;

  return (
    <Collapsible className="rounded-lg border bg-card">
      <CollapsibleTrigger className="flex w-full items-center justify-between p-4 text-left hover:bg-accent/50 transition-colors rounded-lg">
        <div className="flex items-center gap-2">
          <AlertTriangle
            className={`h-4 w-4 ${errorCount > 0 ? "text-destructive" : "text-muted-foreground"}`}
          />
          <span className="font-medium">{t("title")}</span>
          <span
            className={`text-sm ${errorCount > 0 ? "text-destructive" : "text-muted-foreground"}`}
          >
            ({errorCount})
          </span>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-4 pb-4 space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : errorCount === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noErrors")}</p>
          ) : (
            data?.errors.map((error) => (
              <ImportErrorCard key={error.id} error={error} />
            ))
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
