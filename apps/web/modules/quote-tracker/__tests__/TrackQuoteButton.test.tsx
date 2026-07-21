import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TrackQuoteButton } from "../TrackQuoteButton";

function openModal() {
  fireEvent.click(
    screen.getByRole("button", { name: "Track ServiceM8 quote" }),
  );
}

describe("TrackQuoteButton", () => {
  it("opens the modal with a job id field when clicked", () => {
    render(<TrackQuoteButton action={vi.fn()} />);

    expect(screen.queryByLabelText("Job ID")).not.toBeInTheDocument();
    openModal();
    expect(screen.getByLabelText("Job ID")).toBeInTheDocument();
  });

  it("shows the link, client name and address on success", async () => {
    const action = vi.fn().mockResolvedValue({
      ok: true,
      link: "https://quotes-worker.example/q/AB12CD34",
      clientName: "Acme Ltd",
      jobAddress: "12 Glass St",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    render(<TrackQuoteButton action={action} />);

    openModal();
    fireEvent.change(screen.getByLabelText("Job ID"), {
      target: { value: "R260210" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start tracking" }));

    await waitFor(() =>
      expect(screen.getByText("Tracking link ready")).toBeInTheDocument(),
    );
    expect(action).toHaveBeenCalledWith("R260210");
    expect(screen.getByText("Acme Ltd")).toBeInTheDocument();
    expect(screen.getByText("12 Glass St")).toBeInTheDocument();
    expect(
      screen.getByText("https://quotes-worker.example/q/AB12CD34"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  it("shows the backend error message and keeps the field editable", async () => {
    const action = vi.fn().mockResolvedValue({
      ok: false,
      message: "No matching ServiceM8 job found.",
    });
    render(<TrackQuoteButton action={action} />);

    openModal();
    fireEvent.change(screen.getByLabelText("Job ID"), {
      target: { value: "R999999" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start tracking" }));

    await waitFor(() =>
      expect(
        screen.getByText("No matching ServiceM8 job found."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Job ID")).toHaveValue("R999999");
  });

  it("closes the modal when Done is clicked", async () => {
    const action = vi.fn().mockResolvedValue({
      ok: true,
      link: "https://quotes-worker.example/q/AB12CD34",
      clientName: "Acme Ltd",
      jobAddress: "12 Glass St",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    render(<TrackQuoteButton action={action} />);

    openModal();
    fireEvent.change(screen.getByLabelText("Job ID"), {
      target: { value: "R260210" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start tracking" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByLabelText("Job ID")).not.toBeInTheDocument();
  });

  it("recovers after an error: editing and resubmitting can succeed", async () => {
    const action = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        message: "No matching ServiceM8 job found.",
      })
      .mockResolvedValueOnce({
        ok: true,
        link: "https://quotes-worker.example/q/AB12CD34",
        clientName: "Acme Ltd",
        jobAddress: "12 Glass St",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
    render(<TrackQuoteButton action={action} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Track ServiceM8 quote" }),
    );
    fireEvent.change(screen.getByLabelText("Job ID"), {
      target: { value: "R999999" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start tracking" }));
    await waitFor(() =>
      expect(
        screen.getByText("No matching ServiceM8 job found."),
      ).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText("Job ID"), {
      target: { value: "R260210" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start tracking" }));
    await waitFor(() =>
      expect(screen.getByText("Tracking link ready")).toBeInTheDocument(),
    );
    expect(
      screen.queryByText("No matching ServiceM8 job found."),
    ).not.toBeInTheDocument();
  });

  it("shows a generic message when the action throws", async () => {
    const action = vi.fn().mockRejectedValue(new Error("network down"));
    render(<TrackQuoteButton action={action} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Track ServiceM8 quote" }),
    );
    fireEvent.change(screen.getByLabelText("Job ID"), {
      target: { value: "R260210" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start tracking" }));

    await waitFor(() =>
      expect(
        screen.getByText("Something went wrong. Please try again."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Job ID")).toHaveValue("R260210");
  });

  it("shows the existing link when a live quote already exists", async () => {
    const action = vi.fn().mockResolvedValue({
      ok: false,
      message: "A live tracked quote already exists for this job.",
      link: "https://quotes-worker.example/q/EXISTING1",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    render(<TrackQuoteButton action={action} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Track ServiceM8 quote" }),
    );
    fireEvent.change(screen.getByLabelText("Job ID"), {
      target: { value: "R260210" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start tracking" }));

    await waitFor(() =>
      expect(
        screen.getByText("A live tracked quote already exists for this job."),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText("https://quotes-worker.example/q/EXISTING1"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });
});
