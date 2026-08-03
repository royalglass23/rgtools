"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ThemeControl } from "@/components/theme/ThemeControl";
import styles from "./DashboardShell.module.css";

export interface DashboardNavigationItem {
  id: string;
  name: string;
  href: string;
}

export type DashboardNavigationEntry =
  | {
      kind: "link";
      id: string;
      label: string;
      href: string;
    }
  | {
      kind: "group";
      id: string;
      label: string;
      items: DashboardNavigationItem[];
    };

interface DashboardShellProps {
  navigation: DashboardNavigationEntry[];
  user: {
    name?: string | null;
    role?: string | null;
  };
  signOutControl: ReactNode;
  children: ReactNode;
}

export function DashboardShell({
  navigation,
  user,
  signOutControl,
  children,
}: DashboardShellProps) {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(
    () =>
      navigation.find(
        (entry) => entry.kind === "group" && groupIsActive(entry, pathname),
      )?.id ?? null,
  );

  useEffect(() => {
    if (previousPathname.current === pathname) return;

    previousPathname.current = pathname;
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen]);

  function toggleGroup(
    entry: Extract<DashboardNavigationEntry, { kind: "group" }>,
  ) {
    if (collapsed) {
      setCollapsed(false);
      setOpenGroup(entry.id);
      return;
    }

    setOpenGroup((current) => (current === entry.id ? null : entry.id));
  }

  return (
    <div className={styles.shell} data-collapsed={collapsed || undefined}>
      <div
        className={styles.scrim}
        data-open={mobileOpen || undefined}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={styles.sidebar}
        data-mobile-open={mobileOpen || undefined}
      >
        <div className={styles.brandRow}>
          <div className={styles.brand}>
            <a
              href="https://royalglass.co.nz"
              className={styles.logoLink}
              aria-label="Visit Royal Glass website"
              target="_blank"
              rel="noreferrer"
            >
              <Image
                src="/royal-glass-logo-white.png"
                alt="Royal Glass"
                width={300}
                height={144}
                priority
                unoptimized
                className={styles.logo}
              />
            </a>
            <Link
              href="/"
              className={styles.brandName}
              aria-label="RG Tools dashboard home"
            >
              RG Tools
            </Link>
          </div>
          <button
            type="button"
            className={styles.desktopCollapse}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((current) => !current)}
          >
            <Icon name={collapsed ? "panel-open" : "panel-close"} />
          </button>
          <button
            type="button"
            className={styles.mobileClose}
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          >
            <Icon name="close" />
          </button>
        </div>

        <nav className={styles.navigation} aria-label="Main navigation">
          <span className={styles.navigationLabel}>Workspace</span>
          <div className={styles.navigationEntries}>
            {navigation.map((entry) => {
              if (entry.kind === "link") {
                const active = routeIsActive(entry.href, pathname);
                return (
                  <Link
                    key={entry.id}
                    href={entry.href}
                    className={styles.navigationLink}
                    data-active={active || undefined}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? entry.label : undefined}
                  >
                    <span className={styles.navigationIcon} aria-hidden="true">
                      <Icon name={iconForEntry(entry.id)} />
                    </span>
                    <span className={styles.navigationText}>{entry.label}</span>
                  </Link>
                );
              }

              const active = groupIsActive(entry, pathname);
              const expanded = openGroup === entry.id && !collapsed;
              return (
                <div
                  key={entry.id}
                  className={styles.navigationGroup}
                  data-active={active || undefined}
                >
                  <button
                    type="button"
                    className={styles.navigationLink}
                    aria-expanded={expanded}
                    aria-controls={`navigation-group-${entry.id}`}
                    title={collapsed ? entry.label : undefined}
                    onClick={() => toggleGroup(entry)}
                  >
                    <span className={styles.navigationIcon} aria-hidden="true">
                      <Icon name={iconForEntry(entry.id)} />
                    </span>
                    <span className={styles.navigationText}>{entry.label}</span>
                    <span
                      className={styles.chevron}
                      data-expanded={expanded || undefined}
                      aria-hidden="true"
                    >
                      <Icon name="chevron" />
                    </span>
                  </button>
                  <div
                    id={`navigation-group-${entry.id}`}
                    className={styles.subNavigation}
                    hidden={!expanded}
                  >
                    {entry.items.map((item) => {
                      const itemActive = routeIsActive(item.href, pathname);
                      return (
                        <Link
                          key={item.id}
                          href={item.href}
                          className={styles.subNavigationLink}
                          data-active={itemActive || undefined}
                          aria-current={itemActive ? "page" : undefined}
                        >
                          {item.name}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </nav>

        <div className={styles.account}>
          <div className={styles.accountIdentity}>
            <div className={styles.avatar} aria-hidden="true">
              {initialsFor(user.name)}
            </div>
            <div className={styles.accountCopy}>
              <strong>{user.name || "RG Tools user"}</strong>
              <span>
                {user.role === "admin" ? "Administrator" : "Team member"}
              </span>
            </div>
            <div className={styles.signOut}>{signOutControl}</div>
          </div>
          <div className={styles.appearance}>
            <span className={styles.appearanceLabel}>Appearance</span>
            <ThemeControl />
          </div>
        </div>
      </aside>

      <div className={styles.pageColumn}>
        <header className={styles.mobileHeader}>
          <button
            type="button"
            className={styles.mobileMenu}
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <Icon name="menu" />
          </button>
          <Link
            href="/"
            className={styles.mobileBrand}
            aria-label="Royal Glass tools home"
          >
            <span className={styles.mobileMark}>RG</span>
            <span>RG Tools</span>
          </Link>
          <div className={styles.mobileAvatar}>{initialsFor(user.name)}</div>
        </header>
        <main className={styles.main} data-precision-scope>
          {children}
        </main>
      </div>
    </div>
  );
}

function routeIsActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function groupIsActive(
  entry: Extract<DashboardNavigationEntry, { kind: "group" }>,
  pathname: string,
) {
  return entry.items.some((item) => routeIsActive(item.href, pathname));
}

function initialsFor(name?: string | null) {
  if (!name?.trim()) return "RG";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

type IconName =
  | "dashboard"
  | "lead-intake"
  | "quote-tracker"
  | "work-order"
  | "ps-generator"
  | "clients"
  | "admin"
  | "module"
  | "chevron"
  | "panel-open"
  | "panel-close"
  | "menu"
  | "close";

function iconForEntry(id: string): IconName {
  if (id === "dashboard") return "dashboard";
  if (id.includes("lead")) return "lead-intake";
  if (id.includes("quote")) return "quote-tracker";
  if (id.includes("work-order")) return "work-order";
  if (id.includes("ps-generator")) return "ps-generator";
  if (id.includes("client")) return "clients";
  if (id.includes("admin")) return "admin";
  return "module";
}

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    "lead-intake": (
      <>
        <path d="M12 3v18M3 12h18" />
        <circle cx="12" cy="12" r="9" />
      </>
    ),
    "quote-tracker": (
      <>
        <path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Z" />
        <path d="M9 8h6M9 12h6" />
      </>
    ),
    "work-order": (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M8 11h8M8 15h5" />
      </>
    ),
    "ps-generator": (
      <>
        <path d="M6 3h9l4 4v14H6V3Z" />
        <path d="M14 3v5h5M9 13h6M9 17h4" />
      </>
    ),
    clients: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c0-4 2-7 6-7s6 3 6 7M16 5c3 0 5 2 5 5s-2 5-5 5" />
      </>
    ),
    admin: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    module: (
      <>
        <path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z" />
        <path d="m4 12 8 4.5 8-4.5M4 16.5l8 4.5 8-4.5" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    "panel-open": (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M9 4v16M13 9l3 3-3 3" />
      </>
    ),
    "panel-close": (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M9 4v16M16 9l-3 3 3 3" />
      </>
    ),
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
  };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
