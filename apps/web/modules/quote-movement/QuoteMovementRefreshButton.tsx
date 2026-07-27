"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PrecisionButton } from "@/components/precision-ui/PrecisionUI";

export function QuoteMovementRefreshButton({
  action,
  refreshPending,
  automatic = false,
}: {
  action: () => Promise<{ status: "requested" | "already_pending" }>;
  refreshPending: boolean;
  automatic?: boolean;
}) {
  const router = useRouter();
  const automaticRequested = useRef(false);
  const [requestPending, setRequestPending] = useState(false);
  const pending = requestPending || refreshPending;
  const requestRefresh = useCallback(async () => {
    if (pending) return;
    setRequestPending(true);
    try {
      await action();
      router.refresh();
    } finally {
      setRequestPending(false);
    }
  }, [action, pending, router]);

  useEffect(() => {
    if (!automatic || refreshPending || automaticRequested.current) return;
    automaticRequested.current = true;
    void requestRefresh();
  }, [automatic, refreshPending, requestRefresh]);

  useEffect(() => {
    if (!refreshPending) return;
    const interval = window.setInterval(() => router.refresh(), 2_000);
    return () => window.clearInterval(interval);
  }, [refreshPending, router]);

  const label = refreshPending
    ? "Refresh pending"
    : requestPending
      ? "Requesting refresh"
      : "Refresh now";

  return (
    <PrecisionButton
      type="button"
      aria-label={label}
      disabled={pending}
      onClick={requestRefresh}
    >
      {pending && (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      <span role={pending ? "status" : undefined}>{label}</span>
    </PrecisionButton>
  );
}
