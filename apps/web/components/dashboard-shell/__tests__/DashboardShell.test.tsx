import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  DashboardShell,
  type DashboardNavigationEntry,
} from "../DashboardShell";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("next/link", () => ({
  default: ({
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}));

const navigation: DashboardNavigationEntry[] = [
  { kind: "link", id: "dashboard", label: "Dashboard", href: "/" },
  {
    kind: "group",
    id: "lead-intake",
    label: "Lead Intake",
    items: [
      { id: "lead-form", name: "Form", href: "/lead-intake" },
      { id: "lead-list", name: "List", href: "/leads" },
    ],
  },
];

describe("DashboardShell", () => {
  it("links the Royal Glass logo externally and keeps the product name concise", () => {
    render(
      <DashboardShell
        navigation={navigation}
        user={{ name: "Roxy Huang", role: "admin" }}
        signOutControl={<button type="button">Sign out</button>}
      >
        <h1>Dashboard content</h1>
      </DashboardShell>,
    );

    expect(
      screen.getByRole("link", { name: "Visit Royal Glass website" }),
    ).toHaveAttribute("href", "https://royalglass.co.nz");
    expect(screen.getAllByText("RG Tools").length).toBeGreaterThan(0);
    expect(screen.queryByText("Operations")).not.toBeInTheDocument();
    expect(screen.getByText("Appearance")).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Appearance" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
  });

  it("lets a desktop user collapse and expand the permission-filtered navigation", async () => {
    const user = userEvent.setup();
    render(
      <DashboardShell
        navigation={navigation}
        user={{ name: "Roxy Huang", role: "admin" }}
        signOutControl={<button type="button">Sign out</button>}
      >
        <h1>Dashboard content</h1>
      </DashboardShell>,
    );

    const collapse = screen.getByRole("button", {
      name: "Collapse navigation",
    });
    expect(collapse).toHaveAttribute("aria-expanded", "true");

    await act(async () => user.click(collapse));

    expect(
      screen.getByRole("button", { name: "Expand navigation" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("heading", { name: "Dashboard content" }),
    ).toBeInTheDocument();
  });

  it("expands a navigation group without rendering links the server did not provide", async () => {
    const user = userEvent.setup();
    render(
      <DashboardShell
        navigation={navigation}
        user={{ name: "Roxy Huang", role: "admin" }}
        signOutControl={<button type="button">Sign out</button>}
      >
        <h1>Dashboard content</h1>
      </DashboardShell>,
    );

    expect(
      screen.queryByRole("link", { name: "Administration" }),
    ).not.toBeInTheDocument();
    const leadIntake = screen.getByRole("button", { name: "Lead Intake" });
    expect(leadIntake).toHaveAttribute("aria-expanded", "false");

    await act(async () => user.click(leadIntake));

    expect(leadIntake).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Form" })).toHaveAttribute(
      "href",
      "/lead-intake",
    );
    expect(screen.getByRole("link", { name: "List" })).toHaveAttribute(
      "href",
      "/leads",
    );
  });

  it("opens and dismisses the mobile navigation with Escape", async () => {
    const user = userEvent.setup();
    render(
      <DashboardShell
        navigation={navigation}
        user={{ name: "Roxy Huang", role: "admin" }}
        signOutControl={<button type="button">Sign out</button>}
      >
        <h1>Dashboard content</h1>
      </DashboardShell>,
    );

    const openNavigation = screen.getByRole("button", {
      name: "Open navigation",
    });
    expect(openNavigation).toHaveAttribute("aria-expanded", "false");

    await act(async () => user.click(openNavigation));
    expect(openNavigation).toHaveAttribute("aria-expanded", "true");

    await act(async () => user.keyboard("{Escape}"));
    expect(openNavigation).toHaveAttribute("aria-expanded", "false");
  });
});
