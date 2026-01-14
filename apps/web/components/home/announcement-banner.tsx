"use client";

import { useTranslations } from "next-intl";
import { X, Megaphone } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  useActiveAnnouncements,
  useDismissAnnouncement,
  type Announcement,
} from "../../lib/use-announcements";

interface AnnouncementItemProps {
  announcement: Announcement;
  onDismiss: (id: string) => void;
  isDismissing: boolean;
}

function AnnouncementItem({
  announcement,
  onDismiss,
  isDismissing,
}: AnnouncementItemProps) {
  const t = useTranslations("home.announcement");

  return (
    <div className="relative rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Megaphone className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold">{announcement.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
            {announcement.message}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDismiss(announcement.id)}
          disabled={isDismissing}
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">{t("dismiss")}</span>
        </Button>
      </div>
    </div>
  );
}

export function AnnouncementBanner() {
  const { data: announcements, isLoading } = useActiveAnnouncements();
  const { mutate: dismiss, isPending: isDismissing } = useDismissAnnouncement();

  const handleDismiss = (id: string) => {
    dismiss(id);
  };

  if (isLoading || !announcements || announcements.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {announcements.map((announcement) => (
        <AnnouncementItem
          key={announcement.id}
          announcement={announcement}
          onDismiss={handleDismiss}
          isDismissing={isDismissing}
        />
      ))}
    </div>
  );
}
