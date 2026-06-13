"use client";

import { useTranslations } from "next-intl";
import {
  ChangeCoverDialog as SharedChangeCoverDialog,
  type ChangeCoverDialogTranslations,
} from "../common/change-cover-dialog";
import { queryKeys } from "../../lib/query-keys";

interface ChangeComicSeriesCoverDialogProps {
  seriesId: string;
  seriesTitle: string;
  currentCoverUrl: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangeComicSeriesCoverDialog({
  seriesId,
  seriesTitle,
  currentCoverUrl,
  open,
  onOpenChange,
}: ChangeComicSeriesCoverDialogProps) {
  const t = useTranslations("comics.changeCover");

  const translations: ChangeCoverDialogTranslations = {
    title: t("title"),
    description: t("description", { title: seriesTitle }),
    tabs: {
      upload: t("tabs.upload"),
      url: t("tabs.url"),
    },
    upload: {
      dropzone: t("upload.dropzone"),
      formats: t("upload.formats"),
    },
    url: {
      label: t("url.label"),
      placeholder: t("url.placeholder"),
      preview: t("url.preview"),
    },
    errors: {
      invalidType: t("errors.invalidType"),
      tooLarge: t("errors.tooLarge"),
      invalidUrl: t("errors.invalidUrl"),
      loadFailed: t("errors.loadFailed"),
      failed: t("errors.failed"),
    },
    success: t("success"),
    cancel: t("cancel"),
    save: t("save"),
    saving: t("saving"),
  };

  return (
    <SharedChangeCoverDialog
      entityId={seriesId}
      entityTitle={seriesTitle}
      currentCoverUrl={currentCoverUrl}
      open={open}
      onOpenChange={onOpenChange}
      mediaType="comic"
      uploadConfig={{
        apiPath: "comics/series",
        queryKeys: {
          all: queryKeys.comics.all,
          detail: queryKeys.comics.seriesDetail,
        },
      }}
      translations={translations}
    />
  );
}
