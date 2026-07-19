"use client";

import { useFormStatus } from "react-dom";
import { PrecisionButton } from "@/components/precision-ui/PrecisionUI";

export function QuoteMovementRefreshButton() {
  const { pending } = useFormStatus();

  return (
    <PrecisionButton type="submit" disabled={pending}>
      {pending && (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      <span role={pending ? "status" : undefined}>
        {pending ? "Refreshing..." : "Refresh now"}
      </span>
    </PrecisionButton>
  );
}
