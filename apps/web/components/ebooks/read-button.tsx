"use client";

import { useState } from "react";
import { BookOpen } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui/components/ui/tooltip";
import { EpubReader } from "./epub-reader";
import { useEbookProgress } from "../../lib/use-ebook-progress";
import { useTranslations } from "next-intl";

interface ReadButtonProps {
  ebookId: string;
  ebookTitle: string;
  format: string;
}

// TODO: Re-enable once epub iframe sandbox/scripting issues are resolved
export function ReadButton(_props: ReadButtonProps) {
  return null;
}
