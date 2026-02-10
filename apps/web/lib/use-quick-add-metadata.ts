"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { queryKeys } from "./query-keys";
import { useMyPermissions } from "./use-users";
import { useUpdateAudiobook, type AudiobookDetail } from "./use-audiobooks";
import { useUpdateEbook, type EbookDetail } from "./use-ebooks";

type MediaType = "audiobook" | "ebook";

export function useQuickAddMetadata(mediaType: MediaType, mediaId: string) {
  const t = useTranslations("common.quickAdd");
  const queryClient = useQueryClient();
  const { data: permissions } = useMyPermissions();
  const updateAudiobook = useUpdateAudiobook();
  const updateEbook = useUpdateEbook();

  const canEdit = permissions?.canEditMetadata ?? false;
  const isPending = updateAudiobook.isPending || updateEbook.isPending;

  const getMediaDetail = useCallback(() => {
    if (mediaType === "audiobook") {
      return queryClient.getQueryData<AudiobookDetail>(
        queryKeys.audiobooks.detail(mediaId)
      );
    }
    return queryClient.getQueryData<EbookDetail>(
      queryKeys.ebooks.detail(mediaId)
    );
  }, [queryClient, mediaType, mediaId]);

  const addAsGenre = useCallback(
    async (name: string) => {
      const detail = getMediaDetail();
      if (!detail) return;

      const existingNames = detail.genres.map((g) => g.name);
      if (existingNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
        toast.info(t("alreadyExists", { name, type: "genre" }));
        return;
      }

      const newGenreNames = [...existingNames, name];

      try {
        if (mediaType === "audiobook") {
          await updateAudiobook.mutateAsync({
            id: mediaId,
            data: { genreNames: newGenreNames },
          });
        } else {
          await updateEbook.mutateAsync({
            id: mediaId,
            data: { genreNames: newGenreNames },
          });
        }
        toast.success(t("added", { name, type: "genre" }));
      } catch {
        toast.error(t("addFailed", { name }));
      }
    },
    [getMediaDetail, mediaType, mediaId, updateAudiobook, updateEbook, t]
  );

  const addAsTag = useCallback(
    async (name: string) => {
      const detail = getMediaDetail();
      if (!detail) return;

      const existingNames = detail.tags.map((tag) => tag.name);
      if (existingNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
        toast.info(t("alreadyExists", { name, type: "tag" }));
        return;
      }

      const newTagNames = [...existingNames, name];

      try {
        if (mediaType === "audiobook") {
          await updateAudiobook.mutateAsync({
            id: mediaId,
            data: { tagNames: newTagNames },
          });
        } else {
          await updateEbook.mutateAsync({
            id: mediaId,
            data: { tagNames: newTagNames },
          });
        }
        toast.success(t("added", { name, type: "tag" }));
      } catch {
        toast.error(t("addFailed", { name }));
      }
    },
    [getMediaDetail, mediaType, mediaId, updateAudiobook, updateEbook, t]
  );

  const removeGenre = useCallback(
    async (name: string) => {
      const detail = getMediaDetail();
      if (!detail) return;

      const newGenreNames = detail.genres
        .map((g) => g.name)
        .filter((n) => n.toLowerCase() !== name.toLowerCase());

      try {
        if (mediaType === "audiobook") {
          await updateAudiobook.mutateAsync({
            id: mediaId,
            data: { genreNames: newGenreNames },
          });
        } else {
          await updateEbook.mutateAsync({
            id: mediaId,
            data: { genreNames: newGenreNames },
          });
        }
        toast.success(t("removed", { name, type: "genre" }));
      } catch {
        toast.error(t("removeFailed", { name }));
      }
    },
    [getMediaDetail, mediaType, mediaId, updateAudiobook, updateEbook, t]
  );

  const removeTag = useCallback(
    async (name: string) => {
      const detail = getMediaDetail();
      if (!detail) return;

      const newTagNames = detail.tags
        .map((tag) => tag.name)
        .filter((n) => n.toLowerCase() !== name.toLowerCase());

      try {
        if (mediaType === "audiobook") {
          await updateAudiobook.mutateAsync({
            id: mediaId,
            data: { tagNames: newTagNames },
          });
        } else {
          await updateEbook.mutateAsync({
            id: mediaId,
            data: { tagNames: newTagNames },
          });
        }
        toast.success(t("removed", { name, type: "tag" }));
      } catch {
        toast.error(t("removeFailed", { name }));
      }
    },
    [getMediaDetail, mediaType, mediaId, updateAudiobook, updateEbook, t]
  );

  return { addAsGenre, addAsTag, removeGenre, removeTag, canEdit, isPending };
}
