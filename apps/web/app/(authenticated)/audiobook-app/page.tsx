"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Smartphone, AlertTriangle, QrCode, Camera, Settings, ExternalLink } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Button } from "@repo/ui/components/ui/button";
import { cn } from "@repo/ui/lib/utils";
import { useCreateApiKey, useMyApiKeys, MAX_API_KEYS, ApiKeyLimitError } from "../../../lib/use-api-keys";

type SetupMethod = "qr" | "manual";

export default function AudiobookAppPage() {
  const t = useTranslations("audiobookApp");
  const tCommon = useTranslations("common");
  const [setupMethod, setSetupMethod] = useState<SetupMethod>("qr");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

  const { data: apiKeys } = useMyApiKeys();
  const atLimit = (apiKeys?.length ?? 0) >= MAX_API_KEYS;
  const createApiKey = useCreateApiKey();

  // Get server connection details
  const serverDetails = useMemo(() => {
    if (typeof window === "undefined") return null;

    const url = new URL(window.location.href);
    const protocol = url.protocol.replace(":", "");
    const host = url.hostname;
    const port = url.port || (protocol === "https" ? "443" : "80");

    return { protocol, host, port };
  }, []);

  // Bookmark deeplink: scheme `bookmark`, host `setup`, with the server URL
  // and key as query params. SetupViewModel.onDeeplink pre-fills both fields
  // from this format (DeeplinkParser.kt:8-16). Works on both iOS and Android.
  const serverUrl = useMemo(() => {
    if (!serverDetails) return null;
    const { protocol, host, port } = serverDetails;
    const isStandardPort =
      (protocol === "https" && port === "443") ||
      (protocol === "http" && port === "80");
    return `${protocol}://${host}${isStandardPort ? "" : `:${port}`}`;
  }, [serverDetails]);

  const qrCodeUrl = useMemo(() => {
    if (!serverUrl || !generatedKey) return null;
    return `bookmark://setup?server=${encodeURIComponent(serverUrl)}&key=${encodeURIComponent(generatedKey)}`;
  }, [serverUrl, generatedKey]);

  const handleGenerateQrCode = async () => {
    try {
      const result = await createApiKey.mutateAsync({});
      setGeneratedKey(result.key);
      toast.success(t("connect.app.keyGenerated"));
    } catch (error) {
      toast.error(
        error instanceof ApiKeyLimitError
          ? t("connect.app.keyLimitError")
          : t("connect.app.keyError"),
      );
    }
  };

  const handleResetQrCode = () => {
    setGeneratedKey(null);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Smartphone className="h-8 w-8" />
            {tCommon("nav.audiobookApp")}
          </h1>
          <p className="text-muted-foreground mt-2">
            {t("description")}
          </p>
        </header>

        {/* Connect Card */}
        <Card>
          <CardHeader>
            <CardTitle>{t("connect.title")}</CardTitle>
            <CardDescription>{t("connect.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Setup method toggle */}
            <div className="flex rounded-lg bg-muted p-1">
              <button
                onClick={() => {
                  setSetupMethod("qr");
                  setGeneratedKey(null);
                }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  setupMethod === "qr"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <QrCode className="h-4 w-4" />
                {t("connect.app.methods.qr")}
              </button>
              <button
                onClick={() => {
                  setSetupMethod("manual");
                  setGeneratedKey(null);
                }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  setupMethod === "manual"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Settings className="h-4 w-4" />
                {t("connect.app.methods.manual")}
              </button>
            </div>

            {/* QR Code Setup */}
            {setupMethod === "qr" && (
              <>
                {!generatedKey ? (
                  <>
                    {/* Instructions */}
                    <div className="rounded-lg bg-muted/50 p-4 space-y-4">
                      {(["step1", "step2", "step3"] as const).map((stepKey, i) => (
                        <div key={stepKey} className="flex items-start gap-3">
                          <div className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium shrink-0">
                            {i + 1}
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-medium">{t(`connect.app.qr.${stepKey}.title`)}</p>
                            <p className="text-sm text-muted-foreground">{t(`connect.app.qr.${stepKey}.description`)}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Notice when the API key cap is reached */}
                    {atLimit && (
                      <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-amber-600">{t("connect.app.limitReached.title")}</p>
                            <p className="text-sm text-amber-600/80">{t("connect.app.limitReached.description", { max: MAX_API_KEYS })}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Generate QR Code Button */}
                    <Button
                      onClick={handleGenerateQrCode}
                      disabled={createApiKey.isPending || atLimit}
                      className="w-full"
                    >
                      <QrCode className="h-4 w-4 mr-2" />
                      {createApiKey.isPending
                        ? t("connect.app.generating")
                        : t("connect.app.generateQr")}
                    </Button>
                  </>
                ) : (
                  <>
                    {/* QR Code Display */}
                    <div className="flex flex-col items-center space-y-4">
                      <div className="bg-white p-4 rounded-lg">
                        <QRCodeSVG
                          value={qrCodeUrl || ""}
                          size={200}
                          level="M"
                        />
                      </div>
                      <div className="text-center space-y-2">
                        <div className="flex items-center justify-center gap-2 text-sm font-medium">
                          <Camera className="h-4 w-4" />
                          {t("connect.app.scanInstructions")}
                        </div>
                        <p className="text-xs text-muted-foreground max-w-xs">
                          {t("connect.app.scanNote")}
                        </p>
                      </div>

                      {/* Open in App button for mobile users */}
                      <Button
                        asChild
                        className="w-full max-w-xs"
                      >
                        <a href={qrCodeUrl || "#"}>
                          <ExternalLink className="h-4 w-4 mr-2" />
                          {t("connect.app.openInApp")}
                        </a>
                      </Button>

                      <p className="text-xs text-muted-foreground">
                        {t("connect.app.openInAppNote")}
                      </p>

                      <Button
                        variant="outline"
                        onClick={handleResetQrCode}
                      >
                        {t("connect.app.done")}
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}

            {/* Manual Setup */}
            {setupMethod === "manual" && (
              <div className="space-y-4">
                {/* Instructions */}
                <div className="rounded-lg bg-muted/50 p-4 space-y-4">
                  {(["step1", "step2", "step3", "step4", "step5"] as const).map((stepKey, i) => (
                    <div key={stepKey} className="flex items-start gap-3">
                      <div className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium shrink-0">
                        {i + 1}
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{t(`connect.app.manual.${stepKey}.title`)}</p>
                        <p className="text-sm text-muted-foreground">{t(`connect.app.manual.${stepKey}.description`)}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Server URL Card — Bookmark's setup screen takes the full
                    URL in one field, so we surface it pre-assembled rather
                    than splitting protocol/host/port. */}
                {serverUrl && (
                  <div className="rounded-lg border p-4 space-y-2">
                    <p className="text-sm font-medium">{t("connect.app.manual.serverDetails")}</p>
                    <code className="block font-mono bg-muted px-3 py-2 rounded text-xs break-all">
                      {serverUrl}
                    </code>
                  </div>
                )}

                {/* Link to Preferences */}
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/preferences">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    {t("connect.app.manual.goToPreferences")}
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
