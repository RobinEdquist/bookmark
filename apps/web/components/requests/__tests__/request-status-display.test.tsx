import { describe, it, expect, vi } from "vitest";
import { render, screen } from "../../../__test-utils__/render";
import { MyRequestsList } from "../my-requests-list";
import { AdminRequestsList } from "../admin-requests-list";
import type { RequestResponse } from "../../../lib/use-requests";

const request: RequestResponse = {
  id: "request-1",
  userId: "user-1",
  userEmail: "user@test.com",
  status: "pending",
  torrentId: null,
  bookKey: "book-key",
  languageNames: ["English"],
  approvedAt: null,
  lastSearchAt: "2026-10-01T12:00:00.000Z",
  nextSearchAt: "2026-10-03T12:00:00.000Z",
  releaseDate: null,
  searchError: "Prior failure",
  title: "The Book",
  author: "An Author",
  narrator: null,
  series: null,
  description: null,
  coverUrl: null,
  contentType: "audiobook",
  rejectionReason: null,
  torrentMissingSince: null,
  libraryItemId: null,
  libraryItemType: null,
  supporterCount: 0,
  isSupporter: false,
  autoApprovedByUserId: null,
  autoApprovedByEmail: null,
  createdAt: "2026-10-01T12:00:00.000Z",
  updatedAt: "2026-10-01T12:00:00.000Z",
};

function admin(row: RequestResponse) {
  return (
    <AdminRequestsList
      requests={[row]}
      isLoading={false}
      onApprove={vi.fn()}
      onReject={vi.fn()}
      onDelete={vi.fn()}
      onRecheck={vi.fn()}
      isRechecking={false}
      isApproving={false}
      isRejecting={false}
      isDeleting={false}
    />
  );
}

describe("Request status display", () => {
  it.each(["pending", "waiting"] as const)(
    "shows availability scheduling for a %s book",
    (status) => {
      render(
        <MyRequestsList
          requests={[{ ...request, status }]}
          isLoading={false}
        />,
      );
      expect(screen.getByText("wanted.waitingDescription")).toBeInTheDocument();
      expect(screen.getByText(/^wanted.nextCheck/)).toBeInTheDocument();
    },
  );

  it.each(["rejected", "complete", "approved", "downloading"] as const)(
    "does not promise searching for a %s book with old scheduling data",
    (status) => {
      render(
        <MyRequestsList
          requests={[{ ...request, status }]}
          isLoading={false}
        />,
      );
      expect(
        screen.queryByText("wanted.waitingDescription"),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/^wanted.nextCheck/)).not.toBeInTheDocument();
    },
  );

  it("shows each admin search detail once", () => {
    render(admin(request));
    expect(screen.getAllByText("recheck.failed")).toHaveLength(1);
    expect(screen.getAllByText(/^recheck.lastCheck/)).toHaveLength(1);
    expect(screen.getAllByText(/^recheck.nextCheck/)).toHaveLength(1);
    expect(screen.getAllByText("English")).toHaveLength(1);
  });

  it("hides admin retry and next-check copy for a rejected book", () => {
    render(admin({ ...request, status: "rejected" }));
    expect(screen.queryByText("recheck.failed")).not.toBeInTheDocument();
    expect(screen.queryByText(/^recheck.nextCheck/)).not.toBeInTheDocument();
    expect(screen.getByText("status.rejected")).toBeInTheDocument();
  });
});
