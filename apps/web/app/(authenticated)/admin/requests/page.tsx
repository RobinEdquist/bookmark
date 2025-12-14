"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/ui/tabs";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import {
  useAdminRequests,
  useApproveRequest,
  useRejectRequest,
  type RequestStatus,
} from "../../../../lib/use-requests";
import { AdminRequestsList } from "../../../../components/requests/admin-requests-list";
import { authClient } from "../../../../lib/auth-client";

export default function AdminRequestsPage() {
  const t = useTranslations("admin.requests");
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();

  const [activeTab, setActiveTab] = useState<RequestStatus | "all">("pending");

  const status = activeTab === "all" ? undefined : activeTab;
  const { data: requests, isLoading } = useAdminRequests(status);
  const { approveRequest, isApproving } = useApproveRequest();
  const { rejectRequest, isRejecting } = useRejectRequest();

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

  const pendingCount = requests?.filter((r) => r.status === "pending").length ?? 0;

  return (
    <div className="p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </header>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as RequestStatus | "all")}>
          <TabsList>
            <TabsTrigger value="pending">
              {t("tabs.pending")} {pendingCount > 0 && `(${pendingCount})`}
            </TabsTrigger>
            <TabsTrigger value="approved">{t("tabs.approved")}</TabsTrigger>
            <TabsTrigger value="downloading">{t("tabs.downloading")}</TabsTrigger>
            <TabsTrigger value="all">{t("tabs.all")}</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-6">
            <AdminRequestsList
              requests={requests ?? []}
              isLoading={isLoading}
              onApprove={approveRequest}
              onReject={(id, reason) => rejectRequest({ requestId: id, reason })}
              isApproving={isApproving}
              isRejecting={isRejecting}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
