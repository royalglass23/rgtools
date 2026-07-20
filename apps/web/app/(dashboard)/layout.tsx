import {
  DashboardShell,
  type DashboardNavigationEntry,
} from "@/components/dashboard-shell/DashboardShell";
import { getAccessibleModules } from "@/lib/access-db";
import {
  buildDashboardNavigation,
  type DashboardNavItem,
} from "@/lib/admin-navigation";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { signOutAction } from "./actions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const accessibleModules = await getAccessibleModules(session.user.id);
  const {
    primaryModules,
    leadIntakeItems,
    quoteTrackerItems,
    clientsItems,
    psGeneratorItems,
    workOrderItems,
    adminItems,
  } = buildDashboardNavigation(accessibleModules, {
    isAdmin: session.user.role === "admin",
    showWorkOrderNavigation: true,
  });
  const navigation: DashboardNavigationEntry[] = [
    { kind: "link", id: "dashboard", label: "Dashboard", href: "/" },
    ...navigationGroup("lead-intake", "Lead Intake", leadIntakeItems),
    ...primaryModules
      .filter((module) => module.slug !== "leads")
      .map((module) => ({
        kind: "link" as const,
        id: module.id,
        label: module.name,
        href: `/${module.slug}`,
      })),
    ...navigationGroup("quote-tracker", "Quotes", quoteTrackerItems),
    ...navigationGroup("work-order", "Work Orders", workOrderItems),
    ...navigationGroup("clients", "Clients", clientsItems),
    ...navigationGroup("ps-generator", "PS Generator", psGeneratorItems),
    ...navigationGroup("admin", "Admin", adminItems),
  ];

  return (
    <DashboardShell
      navigation={navigation}
      user={{ name: session.user.name, role: session.user.role }}
      signOutControl={
        <form action={signOutAction}>
          <button type="submit">Sign out</button>
        </form>
      }
    >
      {children}
    </DashboardShell>
  );
}

function navigationGroup(id: string, label: string, items: DashboardNavItem[]) {
  if (items.length === 0) return [];

  return [{ kind: "group" as const, id, label, items }];
}
