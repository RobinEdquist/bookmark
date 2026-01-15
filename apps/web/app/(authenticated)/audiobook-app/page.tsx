"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Smartphone, Apple, Headphones, Database, Server, AlertTriangle, QrCode, Camera, Settings, ExternalLink } from "lucide-react";
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
      <div className="mx-auto max-w-3xl space-y-6">
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
                <Apple className="h-6 w-6" />
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
                <Smartphone className="h-6 w-6" />
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
