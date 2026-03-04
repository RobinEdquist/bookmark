"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Smartphone, Headphones, Database, Server, AlertTriangle, QrCode, Camera, Settings, ExternalLink } from "lucide-react";

// Apple logo icon
function AppleLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 814 1000"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 781.5 0 648.5 0 522.5c0-203.3 132.1-311 262.4-311 69.1 0 126.7 45.3 170.1 45.3 41.4 0 106-47.3 185.2-47.3 29.9 0 137.4 2.6 208.4 99.4zM554.1 159.4c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" />
    </svg>
  );
}

// Android logo icon
function AndroidLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M17.523 15.341a.996.996 0 0 1-.996-.996V9.303a.996.996 0 1 1 1.992 0v5.042a.996.996 0 0 1-.996.996zm-11.046 0a.996.996 0 0 1-.996-.996V9.303a.996.996 0 1 1 1.992 0v5.042a.996.996 0 0 1-.996.996zm11.405-6.021c0-.107-.01-.213-.03-.316a4.463 4.463 0 0 0-1.527-2.907l.872-.873a.402.402 0 1 0-.568-.568l-.955.955a4.447 4.447 0 0 0-2.674-.89 4.447 4.447 0 0 0-2.674.89l-.955-.955a.402.402 0 0 0-.568.568l.872.873a4.463 4.463 0 0 0-1.527 2.907 1.02 1.02 0 0 0-.03.316v5.362c0 .553.448 1.001 1.001 1.001h7.762c.553 0 1.001-.448 1.001-1.001V9.32zm-7.924 1.187a.598.598 0 1 1 0-1.196.598.598 0 0 1 0 1.196zm4.084 0a.598.598 0 1 1 0-1.196.598.598 0 0 1 0 1.196z" />
      <path d="M7.958 16.317v3.68a1.001 1.001 0 0 0 1.001 1.001h1.197v2.004c0 .553.448 1.001 1.001 1.001h.797a1.001 1.001 0 0 0 1.001-1.001v-2.004h1.092v2.004a1.001 1.001 0 0 0 1.001 1.001h.797a1.001 1.001 0 0 0 1.001-1.001v-2.004h1.197a1.001 1.001 0 0 0 1.001-1.001v-3.68H7.958z" />
    </svg>
  );
}
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
import { useCreateApiKey, useMyApiKey } from "../../../lib/use-api-keys";

type Platform = "ios" | "android";
type SetupMethod = "qr" | "manual";

export default function AudiobookAppPage() {
  const t = useTranslations("audiobookApp");
  const tCommon = useTranslations("common");
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);
  const [setupMethod, setSetupMethod] = useState<SetupMethod>("qr");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

  const { data: existingApiKey } = useMyApiKey();
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

  // Build the QR code URL based on current location
  const qrCodeUrl = useMemo(() => {
    if (!serverDetails || !generatedKey) return null;

    return `happyaudio://bookmark/connect?protocol=${serverDetails.protocol}&host=${serverDetails.host}&port=${serverDetails.port}&key=${generatedKey}`;
  }, [serverDetails, generatedKey]);

  const handleGenerateQrCode = async () => {
    try {
      const result = await createApiKey.mutateAsync();
      setGeneratedKey(result.key);
      toast.success(t("connect.ios.keyGenerated"));
    } catch {
      toast.error(t("connect.ios.keyError"));
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

        {/* Happy Audio Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Headphones className="h-5 w-5" />
              {t("happyAudio.title")}
            </CardTitle>
            <CardDescription>{t("happyAudio.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("happyAudio.about")}
            </p>

            {/* Features */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-center gap-2 text-sm">
                <Server className="h-4 w-4 text-primary" />
                <span>{t("happyAudio.features.audiobookshelf")}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Server className="h-4 w-4 text-primary" />
                <span>{t("happyAudio.features.bookmark")}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Database className="h-4 w-4 text-primary" />
                <span>{t("happyAudio.features.localData")}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Platform Selection Card */}
        <Card>
          <CardHeader>
            <CardTitle>{t("connect.title")}</CardTitle>
            <CardDescription>{t("connect.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Platform buttons */}
            <div className="flex gap-3">
              <Button
                variant={selectedPlatform === "ios" ? "default" : "outline"}
                className={cn(
                  "flex-1 h-auto py-4 flex-col gap-2",
                  selectedPlatform === "ios" && "ring-2 ring-primary ring-offset-2"
                )}
                onClick={() => {
                  setSelectedPlatform("ios");
                  setGeneratedKey(null);
                  setSetupMethod("qr");
                }}
              >
                <AppleLogo className="h-6 w-6" />
                <span>iOS</span>
              </Button>
              <Button
                variant={selectedPlatform === "android" ? "default" : "outline"}
                className={cn(
                  "flex-1 h-auto py-4 flex-col gap-2",
                  selectedPlatform === "android" && "ring-2 ring-primary ring-offset-2"
                )}
                onClick={() => {
                  setSelectedPlatform("android");
                  setGeneratedKey(null);
                  setSetupMethod("qr");
                }}
              >
                <AndroidLogo className="h-6 w-6" />
                <span>Android</span>
              </Button>
            </div>

            {/* iOS Instructions */}
            {selectedPlatform === "ios" && (
              <div className="space-y-4">
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
                    {t("connect.ios.methods.qr")}
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
                    {t("connect.ios.methods.manual")}
                  </button>
                </div>

                {/* QR Code Setup */}
                {setupMethod === "qr" && (
                  <>
                    {!generatedKey ? (
                      <>
                        {/* Instructions */}
                        <div className="rounded-lg bg-muted/50 p-4 space-y-4">
                          <div className="flex items-start gap-3">
                            <div className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium shrink-0">
                              1
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm font-medium">{t("connect.ios.qr.step1.title")}</p>
                              <p className="text-sm text-muted-foreground">{t("connect.ios.qr.step1.description")}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <div className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium shrink-0">
                              2
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm font-medium">{t("connect.ios.qr.step2.title")}</p>
                              <p className="text-sm text-muted-foreground">{t("connect.ios.qr.step2.description")}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <div className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium shrink-0">
                              3
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm font-medium">{t("connect.ios.qr.step3.title")}</p>
                              <p className="text-sm text-muted-foreground">{t("connect.ios.qr.step3.description")}</p>
                            </div>
                          </div>
                        </div>

                        {/* Warning about breaking existing connections */}
                        {existingApiKey && (
                          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
                            <div className="flex items-start gap-3">
                              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                              <div className="space-y-1">
                                <p className="text-sm font-medium text-amber-600">{t("connect.ios.warning.title")}</p>
                                <p className="text-sm text-amber-600/80">{t("connect.ios.warning.description")}</p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Generate QR Code Button */}
                        <Button
                          onClick={handleGenerateQrCode}
                          disabled={createApiKey.isPending}
                          className="w-full"
                        >
                          <QrCode className="h-4 w-4 mr-2" />
                          {createApiKey.isPending
                            ? t("connect.ios.generating")
                            : existingApiKey
                              ? t("connect.ios.regenerateQr")
                              : t("connect.ios.generateQr")
                          }
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
                              {t("connect.ios.scanInstructions")}
                            </div>
                            <p className="text-xs text-muted-foreground max-w-xs">
                              {t("connect.ios.scanNote")}
                            </p>
                          </div>

                          {/* Open in App button for mobile users */}
                          <Button
                            asChild
                            className="w-full max-w-xs"
                          >
                            <a href={qrCodeUrl || "#"}>
                              <ExternalLink className="h-4 w-4 mr-2" />
                              {t("connect.ios.openInApp")}
                            </a>
                          </Button>

                          <p className="text-xs text-muted-foreground">
                            {t("connect.ios.openInAppNote")}
                          </p>

                          <Button
                            variant="outline"
                            onClick={handleResetQrCode}
                          >
                            {t("connect.ios.done")}
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
                      <div className="flex items-start gap-3">
                        <div className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium shrink-0">
                          1
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium">{t("connect.ios.manual.step1.title")}</p>
                          <p className="text-sm text-muted-foreground">{t("connect.ios.manual.step1.description")}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium shrink-0">
                          2
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium">{t("connect.ios.manual.step2.title")}</p>
                          <p className="text-sm text-muted-foreground">{t("connect.ios.manual.step2.description")}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium shrink-0">
                          3
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium">{t("connect.ios.manual.step3.title")}</p>
                          <p className="text-sm text-muted-foreground">{t("connect.ios.manual.step3.description")}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium shrink-0">
                          4
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium">{t("connect.ios.manual.step4.title")}</p>
                          <p className="text-sm text-muted-foreground">{t("connect.ios.manual.step4.description")}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium shrink-0">
                          5
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium">{t("connect.ios.manual.step5.title")}</p>
                          <p className="text-sm text-muted-foreground">{t("connect.ios.manual.step5.description")}</p>
                        </div>
                      </div>
                    </div>

                    {/* Server Details Card */}
                    {serverDetails && (
                      <div className="rounded-lg border p-4 space-y-3">
                        <p className="text-sm font-medium">{t("connect.ios.manual.serverDetails")}</p>
                        <div className="grid grid-cols-3 gap-3 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs">{t("connect.ios.manual.protocol")}</p>
                            <code className="font-mono bg-muted px-2 py-1 rounded text-xs">{serverDetails.protocol}</code>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">{t("connect.ios.manual.host")}</p>
                            <code className="font-mono bg-muted px-2 py-1 rounded text-xs">{serverDetails.host}</code>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">{t("connect.ios.manual.port")}</p>
                            <code className="font-mono bg-muted px-2 py-1 rounded text-xs">{serverDetails.port}</code>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Link to Preferences */}
                    <Button variant="outline" className="w-full" asChild>
                      <Link href="/preferences">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        {t("connect.ios.manual.goToPreferences")}
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Android Instructions - Coming Soon */}
            {selectedPlatform === "android" && (
              <div className="rounded-lg bg-muted/50 p-6 text-center">
                <p className="text-muted-foreground">
                  {t("connect.comingSoon")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
