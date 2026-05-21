import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

function parseEnv(text) {
  const env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\""))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

async function main() {
  const envText = await readFile(".env.local", "utf8");
  const env = parseEnv(envText);

  const projectRef = env.VITE_SUPABASE_PROJECT_REF;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  const email = env.VITE_DEV_EMAIL;
  const password = env.VITE_DEV_PASSWORD;
  const accessToken = env.VITE_ACCESS_PASSPHRASE;

  if (!projectRef || !anonKey) {
    throw new Error("Missing Supabase public env in .env.local");
  }

  const baseUrl = `https://${projectRef}.supabase.co/functions/v1/server/make-server-e35291a5`;
  const supabase = createClient(`https://${projectRef}.supabase.co`, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const authRes = email && password
    ? await supabase.auth.signInWithPassword({ email, password })
    : await supabase.auth.signInAnonymously();

  if (authRes.error || !authRes.data.session?.access_token) {
    throw new Error(`Auth failed: ${authRes.error?.message ?? "no session"}`);
  }

  const bearer = authRes.data.session.access_token;
  let chosenProjectId = "default";

  async function call(path, body, method = "POST") {
    const started = Date.now();
    const res = await fetch(`${baseUrl}/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
        "X-Access-Token": accessToken,
        "X-Project-Id": chosenProjectId,
      },
      body: method === "POST" ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return {
      ok: res.ok,
      status: res.status,
      ms: Date.now() - started,
      body: json,
    };
  }

  const listRes = await fetch(`${baseUrl}/list-projects`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${bearer}`,
      "X-Access-Token": accessToken,
      "X-Project-Id": "default",
    },
  });
  const listJson = await listRes.json();
  if (Array.isArray(listJson?.projects) && listJson.projects.length > 0) {
    chosenProjectId = listJson.projects[0].id;
  }

  const loadRes = await fetch(`${baseUrl}/load-project?projectId=${encodeURIComponent(chosenProjectId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${bearer}`,
      "X-Access-Token": accessToken,
      "X-Project-Id": chosenProjectId,
    },
  });
  const loadJson = await loadRes.json();
  const snapshotUrl = loadJson?.data?.snapshots?.[0]?.imageUrl;
  const brandName = loadJson?.data?.brandBrief?.current?.name ?? "BrandBrew";
  const brandDescription = loadJson?.data?.brandBrief?.current?.description ?? "A modern brand system.";

  console.log(JSON.stringify({
    phase: "setup",
    listStatus: listRes.status,
    chosenProjectId,
    loadStatus: loadRes.status,
    hasSnapshotUrl: !!snapshotUrl,
    brandName,
  }, null, 2));

  const apps = [
    "Technical White Paper",
    "Presentation Deck Template",
    "Website Hero Section",
  ];

  const contextBodies = apps.map((application) => ({
    application,
    brandName,
    brandDescription,
    ...(snapshotUrl ? { referenceImageUrls: [snapshotUrl] } : {}),
  }));

  const saveBody = {
    projectId: chosenProjectId,
    data: {
      _pressureTest: true,
      _savedAt: new Date().toISOString(),
      projectName: brandName,
    },
  };

  const results = await Promise.all([
    ...contextBodies.map((body, idx) =>
      call("visual-designer/context", body).then((result) => ({
        kind: `context-${idx + 1}`,
        application: body.application,
        ...result,
      }))
    ),
    call("save-project", saveBody).then((result) => ({
      kind: "save-project",
      ...result,
    })),
  ]);

  console.log(JSON.stringify(results, null, 2));
  await supabase.auth.signOut();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
