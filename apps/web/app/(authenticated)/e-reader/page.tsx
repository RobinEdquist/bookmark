"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Check, TabletSmartphone, Smartphone, BookOpen, Key, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Button } from "@repo/ui/components/ui/button";

export default function EReaderPage() {
  const t = useTranslations("eReader");
  const [copied, setCopied] = useState(false);

  const opdsUrl = typeof window !== "undefined" ? `${window.location.origin}/api/ebooks/opds` : "/api/ebooks/opds";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(opdsUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success(t("urlCopied"));
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <TabletSmartphone className="h-8 w-8" />
            {t("title")}
          </h1>
          <p className="text-muted-foreground mt-2">{t("description")}</p>
        </header>

        {/* Learn More - What is OPDS */}
        <Card>
          <CardHeader>
            <CardTitle>{t("learnMore.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              {t("learnMore.description")}
            </p>
            <Button variant="outline" asChild>
              <a
                href="https://opds.io/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2"
              >
                {t("learnMore.link")}
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </CardContent>
        </Card>

        {/* OPDS URL Card */}
        <Card>
          <CardHeader>
            <CardTitle>{t("feedUrl.title")}</CardTitle>
            <CardDescription>{t("feedUrl.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-2">
              <code className="flex-1 text-sm bg-muted px-4 py-3 rounded-lg break-all font-mono">
                {opdsUrl}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
                title={t("feedUrl.copy")}
                className="shrink-0"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Authentication Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              {t("auth.title")}
            </CardTitle>
            <CardDescription>{t("auth.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium shrink-0">
                  1
                </div>
                <p className="text-sm">{t("auth.step1")}</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium shrink-0">
                  2
                </div>
                <p className="text-sm">{t("auth.step2")}</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium shrink-0">
                  3
                </div>
                <p className="text-sm">{t("auth.step3")}</p>
              </div>
            </div>
            <Button variant="outline" asChild>
              <a href="/preferences">
                {t("auth.goToPreferences")}
              </a>
            </Button>
          </CardContent>
        </Card>

        {/* Setup Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>{t("setup.title")}</CardTitle>
            <CardDescription>{t("setup.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Kindle */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <TabletSmartphone className="h-4 w-4" />
                {t("setup.kindle.title")}
              </h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground ml-6">
                <li>{t("setup.kindle.step1")}</li>
                <li>{t("setup.kindle.step2")}</li>
                <li>{t("setup.kindle.step3")}</li>
                <li>{t("setup.kindle.step4")}</li>
              </ol>
            </div>

            {/* Kobo */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                {t("setup.kobo.title")}
              </h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground ml-6">
                <li>{t("setup.kobo.step1")}</li>
                <li>{t("setup.kobo.step2")}</li>
                <li>{t("setup.kobo.step3")}</li>
                <li>{t("setup.kobo.step4")}</li>
              </ol>
            </div>

            {/* iOS */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Smartphone className="h-4 w-4" />
                {t("setup.ios.title")}
              </h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground ml-6">
                <li>{t("setup.ios.step1")}</li>
                <li>{t("setup.ios.step2")}</li>
                <li>{t("setup.ios.step3")}</li>
                <li>{t("setup.ios.step4")}</li>
              </ol>
            </div>

            {/* Android */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Smartphone className="h-4 w-4" />
                {t("setup.android.title")}
              </h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground ml-6">
                <li>{t("setup.android.step1")}</li>
                <li>{t("setup.android.step2")}</li>
                <li>{t("setup.android.step3")}</li>
                <li>{t("setup.android.step4")}</li>
              </ol>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
