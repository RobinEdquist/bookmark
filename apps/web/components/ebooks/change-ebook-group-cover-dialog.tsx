"use client";

import { useTranslations } from "next-intl";
import {
  ChangeCoverDialog as SharedChangeCoverDialog,
  type ChangeCoverDialogTranslations,
} from "../common/change-cover-dialog";
import { queryKeys } from "../../lib/query-keys";

export function ChangeEbookGroupCoverDialog({
  groupId,
  groupName,
  currentCoverUrl,
  open,
  onOpenChange,
}: {
  groupId: string;
  groupName: string;
  currentCoverUrl: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("ebooks.changeCover");
  const translations: ChangeCoverDialogTranslations = {
    title: t("title"),
    description: t("description", { title: groupName }),
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
      entityId={groupId}
      entityTitle={groupName}
      currentCoverUrl={currentCoverUrl}
      open={open}
      onOpenChange={onOpenChange}
      mediaType="ebook"
      uploadConfig={{
        apiPath: "ebooks/groups",
        queryKeys: {
          all: queryKeys.ebooks.all,
          detail: queryKeys.ebooks.groupDetail,
        },
      }}
      translations={translations}
    />
  );
}
