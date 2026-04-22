import React, { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "bb-access-token";

export function getAccessToken(): string | null {
  return sessionStorage.getItem(STORAGE_KEY);
}

export function clearAccessToken(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function useAccessGate() {
  const [granted, setGranted] = useState(
    () => !!sessionStorage.getItem(STORAGE_KEY),
  );

  const submit = useCallback((token: string) => {
    const trimmed = token.trim();
    if (!trimmed) return;
    sessionStorage.setItem(STORAGE_KEY, trimmed);
    setGranted(true);
  }, []);

  const revoke = useCallback(() => {
    clearAccessToken();
    setGranted(false);
  }, []);

  return { granted, submit, revoke };
}

export function AccessGate({
  granted,
  submit,
  children,
}: {
  granted: boolean;
  submit: (token: string) => void;
  children: React.ReactNode;
}) {
  const [value, setValue] = useState("");
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (!shake) return;
    const t = setTimeout(() => setShake(false), 500);
    return () => clearTimeout(t);
  }, [shake]);

  if (granted) return <>{children}</>;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setShake(true);
      return;
    }
    submit(trimmed);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fafafa",
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        zIndex: 99999,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1rem",
          width: "min(90vw, 22rem)",
        }}
      >
        <h1
          style={{
            fontSize: "1.25rem",
            fontWeight: 600,
            color: "#030213",
            margin: 0,
          }}
        >
          BrandBrew
        </h1>
        <p
          style={{
            fontSize: "0.875rem",
            color: "#717182",
            margin: 0,
            textAlign: "center",
          }}
        >
          Enter your access token to continue
        </p>
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Access token"
          style={{
            width: "100%",
            padding: "0.625rem 0.875rem",
            fontSize: "0.875rem",
            borderRadius: "0.625rem",
            border: "1px solid rgba(0,0,0,0.1)",
            outline: "none",
            background: "#f3f3f5",
            transition: "border-color 0.15s",
            animation: shake ? "bb-shake 0.4s ease-in-out" : undefined,
            boxSizing: "border-box",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "#030213";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)";
          }}
        />
        <button
          type="submit"
          style={{
            width: "100%",
            padding: "0.625rem",
            fontSize: "0.875rem",
            fontWeight: 500,
            borderRadius: "0.625rem",
            border: "none",
            background: "#030213",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Enter
        </button>
        <style>{`
          @keyframes bb-shake {
            0%, 100% { transform: translateX(0); }
            20% { transform: translateX(-6px); }
            40% { transform: translateX(6px); }
            60% { transform: translateX(-4px); }
            80% { transform: translateX(4px); }
          }
        `}</style>
      </form>
    </div>
  );
}
