"use client";

import { ReactNode } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { X, Check } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Card } from "@repo/ui/components/ui/card";
import { useCancelRestore, useRestoreSession } from "../../../../lib/use-restore";
import { toast } from "sonner";

interface RestoreLayoutProps {
  children: ReactNode;
}

interface Step {
  id: string;
  name: string;
  path: string;
}

const STEPS: Step[] = [
  { id: "upload", name: "Upload", path: "/settings/restore/upload" },
  { id: "library", name: "Select Library", path: "/settings/restore/library" },
  { id: "paths", name: "Path Mapping", path: "/settings/restore/paths" },
  { id: "users", name: "User Mapping", path: "/settings/restore/users" },
  { id: "options", name: "Options", path: "/settings/restore/options" },
  { id: "preview", name: "Preview", path: "/settings/restore/preview" },
  { id: "import", name: "Import", path: "/settings/restore/import" },
];

function getStepIndex(pathname: string): number {
  const index = STEPS.findIndex((step) => pathname.includes(step.id));
  return index >= 0 ? index : 0;
}

function getStepStatus(
  stepIndex: number,
  currentStepIndex: number,
): "complete" | "current" | "upcoming" {
  if (stepIndex < currentStepIndex) return "complete";
  if (stepIndex === currentStepIndex) return "current";
  return "upcoming";
}

export default function RestoreLayout({ children }: RestoreLayoutProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const t = useTranslations("settings.restore");
  const sessionId = searchParams.get("session");

  const { data: session } = useRestoreSession(sessionId);
  const cancelRestore = useCancelRestore();

  // Get current step based on URL
  const currentStepIndex = getStepIndex(pathname);

  const handleCancel = async () => {
    if (!sessionId) {
      router.push("/settings");
      return;
    }

    try {
      await cancelRestore.mutateAsync(sessionId);
      toast.success(t("wizard.cancelSuccess"));
      router.push("/settings");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("wizard.cancelError"),
      );
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {t("wizard.title")}
            </h1>
            <p className="text-muted-foreground">{t("wizard.description")}</p>
          </div>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={cancelRestore.isPending}
          >
            <X className="mr-2 h-4 w-4" />
            {t("wizard.cancel")}
          </Button>
        </div>

        {/* Step Indicator */}
        <Card className="p-6">
          <nav aria-label="Progress">
            <ol className="flex items-center justify-between">
              {STEPS.map((step, index) => {
                const status = getStepStatus(index, currentStepIndex);
                const isClickable = index < currentStepIndex;

                return (
                  <li
                    key={step.id}
                    className="relative flex flex-col items-center"
                  >
                    {/* Connector Line */}
                    {index < STEPS.length - 1 && (
                      <div
                        className={`absolute left-1/2 top-5 hidden h-0.5 w-full sm:block ${
                          status === "complete"
                            ? "bg-primary"
                            : "bg-muted"
                        }`}
                        style={{ marginLeft: "50%" }}
                      />
                    )}

                    {/* Step Circle */}
                    <button
                      type="button"
                      onClick={() => {
                        if (isClickable && sessionId) {
                          router.push(`${step.path}?session=${sessionId}`);
                        }
                      }}
                      disabled={!isClickable}
                      className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors ${
                        status === "complete"
                          ? "border-primary bg-primary text-primary-foreground"
                          : status === "current"
                            ? "border-primary bg-background text-primary"
                            : "border-muted bg-background text-muted-foreground"
                      } ${isClickable ? "cursor-pointer hover:border-primary" : "cursor-not-allowed"}`}
                    >
                      {status === "complete" ? (
                        <Check className="h-5 w-5" />
                      ) : (
                        <span className="text-sm font-semibold">
                          {index + 1}
                        </span>
                      )}
                    </button>

                    {/* Step Label */}
                    <span
                      className={`mt-2 text-xs font-medium ${
                        status === "current"
                          ? "text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {step.name}
                    </span>
                  </li>
                );
              })}
            </ol>
          </nav>
        </Card>

        {/* Content */}
        <div className="min-h-[400px]">{children}</div>

        {/* Session Info (Debug) */}
        {session && process.env.NODE_ENV === "development" && (
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">
              Session: {session.id} | State: {session.state} | Progress:{" "}
              {session.processedItems}/{session.totalItems}
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
