import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";
import { supabase } from "./app/lib/supabase-client";

async function ensureAnonymousSession(): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) return;
  const { error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw new Error(
      "Anonymous sign-in is disabled or failed. Enable it in Supabase Dashboard → Auth → Providers → Anonymous.",
    );
  }
}

async function bootstrap() {
  try {
    await ensureAnonymousSession();
    createRoot(document.getElementById("root")!).render(<App />);
  } catch (err) {
    const root = document.getElementById("root")!;
    root.innerHTML = [
      "<div style='padding: 2rem; font-family: system-ui; max-width: 32rem;'>",
      "<h2>Sign-in required</h2>",
      "<p>" + (err instanceof Error ? err.message : String(err)) + "</p>",
      "</div>",
    ].join("");
  }
}

bootstrap();
