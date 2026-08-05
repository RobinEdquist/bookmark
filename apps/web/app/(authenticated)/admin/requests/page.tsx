"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/ui/tabs";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import {
  useAdminRequests,
  useApproveRequest,
  useRejectRequest,
  useDeleteRequest,
} from "../../../../lib/use-requests";
import { AdminRequestsList } from "../../../../components/requests/admin-requests-list";
import { authClient } from "../../../../lib/auth-client";
import { useUrlTab } from "../../../../lib/use-url-tab";

const STATUS_TABS = [
  "pending",
  "approved",
  "downloading",
  "missing",
  "all",
] as const;
type StatusTab = (typeof STATUS_TABS)[number];

export default function AdminRequestsPage() {
  const t = useTranslations("admin.requests");
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();

  const [activeTab, setActiveTab] = useUrlTab<StatusTab>(
    "status",
    "pending",
    STATUS_TABS,
  );

  // "missing" cuts across statuses, so it filters on the missing flag instead
  const missingOnly = activeTab === "missing";
  const status =
    activeTab === "all" || missingOnly
      ? undefined
      : (activeTab as Exclude<StatusTab, "all" | "missing">);
  const { data: requests, isLoading } = useAdminRequests(status, missingOnly);
  // Own query so the tab count is there before the tab is opened; React Query
  // dedupes it against the list query while the Missing tab is active.
  const { data: missingRequests } = useAdminRequests(undefined, true);
  const { approveRequest, isApproving } = useApproveRequest();
  const { rejectRequest, isRejecting } = useRejectRequest();
  const { deleteRequest, isDeleting } = useDeleteRequest();

  const isAdmin = session?.user?.role === "admin";

  if (sessionPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="lg" className="text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    router.replace("/home");
    return null;
  }

  const pendingCount =
    requests?.filter((r) => r.status === "pending").length ?? 0;
  const missingCount = missingRequests?.length ?? 0;

  const handleDelete = async (id: string) => {
    try {
      await deleteRequest(id);
      toast.success(t("toast.deleted"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("toast.failed"));
    }
  };

  return (
    <div className="p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </header>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as StatusTab)}
        >
          <TabsList>
            <TabsTrigger value="pending">
              {t("tabs.pending")} {pendingCount > 0 && `(${pendingCount})`}
            </TabsTrigger>
            <TabsTrigger value="approved">{t("tabs.approved")}</TabsTrigger>
            <TabsTrigger value="downloading">
              {t("tabs.downloading")}
            </TabsTrigger>
            <TabsTrigger value="missing">
              {t("tabs.missing")} {missingCount > 0 && `(${missingCount})`}
            </TabsTrigger>
            <TabsTrigger value="all">{t("tabs.all")}</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-6">
            <AdminRequestsList
              requests={requests ?? []}
              isLoading={isLoading}
              onApprove={approveRequest}
              onReject={(id, reason) =>
                rejectRequest({ requestId: id, reason })
              }
              onDelete={handleDelete}
              isApproving={isApproving}
              isRejecting={isRejecting}
              isDeleting={isDeleting}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
