"use client";

import { useActionState, useEffect } from "react";
import { ThemeControl } from "@/components/theme/ThemeControl";
import { loginAction } from "./actions";
import styles from "./login.module.css";

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, undefined);

  useEffect(() => {
    if (state && "redirectTo" in state) {
      window.location.href = state.redirectTo;
    }
  }, [state]);

  return (
    <main className={styles.page}>
      <section className={styles.brandPanel} aria-label="Royal Glass RG Tools">
        <div className={styles.brandMark}>RG</div>
        <div>
          <p>Royal Glass</p>
          <h1>RG Tools</h1>
        </div>
        <p className={styles.brandDescription}>
          One operational workspace for leads, ServiceM8 quote tracking,
          clients, Work Orders, and Producer Statements.
        </p>
      </section>

      <section className={styles.signInArea}>
        <div className={styles.themeControl}>
          <ThemeControl />
        </div>
        <div className={styles.signInPanel}>
          <header>
            <p>Staff access</p>
            <h2>Sign in to RG Tools</h2>
            <span>Use your Royal Glass staff credentials.</span>
          </header>
          <form action={action} className={styles.form}>
            <label htmlFor="username">
              Username
              <input
                id="username"
                name="username"
                type="text"
                required
                autoComplete="username"
              />
            </label>
            <label htmlFor="password">
              Password
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </label>
            {state && "error" in state && (
              <p className={styles.error} role="alert">
                {state.error}
              </p>
            )}
            <button type="submit" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
