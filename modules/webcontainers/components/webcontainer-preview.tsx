"use client";
import React, { useEffect, useState, useRef } from "react";

import { transformToWebContainerFormat } from "../hooks/transformer";
import { CheckCircle, Copy, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";

import { WebContainer } from "@webcontainer/api";
import { TemplateFile, TemplateFolder } from "@/modules/playground/lib/path-to-json";
import TerminalComponent from "./terminal";

// ── helpers ────────────────────────────────────────────────────────────────────

/**
 * Scan the TemplateFolder to find which directories have their own package.json.
 * Returns [""] for a normal single-package project (root-level package.json).
 * Returns e.g. ["frontend", "backend"] for a monorepo.
 */
function findPackageDirs(templateData: TemplateFolder): string[] {
  const rootHasPkg = templateData.items.some(
    (item): item is TemplateFile =>
      !("folderName" in item) &&
      item.filename === "package" &&
      item.fileExtension === "json"
  );
  if (rootHasPkg) return [""];

  const dirs: string[] = [];
  for (const item of templateData.items) {
    if ("folderName" in item) {
      const hasPkg = item.items.some(
        (sub): sub is TemplateFile =>
          !("folderName" in sub) &&
          sub.filename === "package" &&
          sub.fileExtension === "json"
      );
      if (hasPkg) dirs.push(item.folderName);
    }
  }
  return dirs.length > 0 ? dirs : [""];
}

/** Read the mounted package.json and pick the best start script. */
async function getStartScript(instance: WebContainer, dir: string): Promise<string> {
  try {
    const pkgPath = dir ? `${dir}/package.json` : "package.json";
    const raw = await instance.fs.readFile(pkgPath, "utf8");
    const scripts: Record<string, string> = JSON.parse(raw).scripts ?? {};
    if (scripts.dev) return "dev";
    if (scripts.start) return "start";
    if (scripts.serve) return "serve";
  } catch {}
  return "dev";
}

const INSTALL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ── component ──────────────────────────────────────────────────────────────────

interface WebContainerPreviewProps {
  templateData: TemplateFolder;
  serverUrl: string;
  isLoading: boolean;
  error: string | null;
  instance: WebContainer | null;
  writeFileSync: (path: string, content: string) => Promise<void>;
  forceResetup?: boolean;
}

const WebContainerPreview = ({
  templateData,
  error,
  instance,
  isLoading,
  serverUrl,
  writeFileSync,
  forceResetup = false,
}: WebContainerPreviewProps) => {
  // Multiple servers (monorepo) each get their own URL entry
  const [previewUrls, setPreviewUrls] = useState<{ url: string; port: number }[]>([]);
  const [activePreviewUrl, setActivePreviewUrl] = useState("");

  const [loadingState, setLoadingState] = useState({
    transforming: false,
    mounting: false,
    installing: false,
    starting: false,
    ready: false,
  });
  const [currentStep, setCurrentStep] = useState(0);
  const totalSteps = 4;
  const [setupError, setSetupError] = useState<string | null>(null);
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [isSetupInProgress, setIsSetupInProgress] = useState(false);

  const terminalRef = useRef<any>(null);
  const write = (msg: string) => terminalRef.current?.writeToTerminal?.(msg);

  // Reset when forceResetup changes
  useEffect(() => {
    if (forceResetup) {
      setIsSetupComplete(false);
      setIsSetupInProgress(false);
      setPreviewUrls([]);
      setActivePreviewUrl("");
      setCurrentStep(0);
      setLoadingState({
        transforming: false,
        mounting: false,
        installing: false,
        starting: false,
        ready: false,
      });
    }
  }, [forceResetup]);

  useEffect(() => {
    async function setupContainer() {
      if (!instance || isSetupComplete || isSetupInProgress) return;

      try {
        setIsSetupInProgress(true);
        setSetupError(null);

        // ── Reconnect check (single-package only) ──────────────────────────
        try {
          await instance.fs.readFile("package.json", "utf8");
          write("🔄 Reconnecting to existing WebContainer session...\r\n");
          instance.on("server-ready", (port: number, url: string) => {
            write(`🌐 Reconnected at ${url}\r\n`);
            setPreviewUrls((prev) =>
              prev.some((p) => p.port === port) ? prev : [...prev, { url, port }]
            );
            setActivePreviewUrl((prev) => prev || url);
            setLoadingState((prev) => ({ ...prev, starting: false, ready: true }));
          });
          setCurrentStep(4);
          setLoadingState((prev) => ({ ...prev, starting: true }));
          return;
        } catch {}

        // ── Step 1: Transform ──────────────────────────────────────────────
        setCurrentStep(1);
        setLoadingState((prev) => ({ ...prev, transforming: true }));
        write("🔄 Transforming template data...\r\n");
        // @ts-ignore
        const files = transformToWebContainerFormat(templateData);
        setLoadingState((prev) => ({ ...prev, transforming: false, mounting: true }));

        // ── Step 2: Mount ──────────────────────────────────────────────────
        setCurrentStep(2);
        write("📁 Mounting files to WebContainer...\r\n");
        await instance.mount(files);
        write("✅ Files mounted successfully\r\n");

        // Detect monorepo vs single-package from the template structure
        const packageDirs = findPackageDirs(templateData);
        const isMonorepo = !(packageDirs.length === 1 && packageDirs[0] === "");
        if (isMonorepo) {
          write(`🗂 Monorepo detected — packages: ${packageDirs.join(", ")}\r\n`);
        }

        // ── Step 3: Install (once per package) ────────────────────────────
        setCurrentStep(3);
        setLoadingState((prev) => ({ ...prev, mounting: false, installing: true }));

        for (const dir of packageDirs) {
          const label = dir || "root";
          write(`📦 Installing dependencies in ${label}...\r\n`);

          const spawnOpts = dir ? { cwd: dir } : {};
          const installProcess = await instance.spawn(
            "npm",
            ["install", "--no-audit", "--no-fund", "--prefer-offline"],
            spawnOpts
          );

          installProcess.output.pipeTo(
            new WritableStream({ write: (data) => write(data) })
          );

          const exitCode = await Promise.race([
            installProcess.exit,
            new Promise<never>((_, reject) =>
              setTimeout(
                () =>
                  reject(
                    new Error(
                      `npm install timed out after 5 min in "${label}". The package may have too many or incompatible dependencies.`
                    )
                  ),
                INSTALL_TIMEOUT_MS
              )
            ),
          ]);

          if (exitCode !== 0) {
            throw new Error(
              `Failed to install dependencies in "${label}". Exit code: ${exitCode}`
            );
          }
          write(`✅ Dependencies installed in ${label}\r\n`);
        }

        // ── Step 4: Start all servers ──────────────────────────────────────
        setCurrentStep(4);
        setLoadingState((prev) => ({ ...prev, installing: false, starting: true }));

        // Register before spawning so we never miss the event
        instance.on("server-ready", (port: number, url: string) => {
          write(`🌐 Server ready at ${url} (port ${port})\r\n`);
          setPreviewUrls((prev) =>
            prev.some((p) => p.port === port) ? prev : [...prev, { url, port }]
          );
          // First URL becomes the default preview
          setActivePreviewUrl((prev) => prev || url);
          setLoadingState((prev) => ({ ...prev, starting: false, ready: true }));
          setIsSetupComplete(true);
          setIsSetupInProgress(false);
        });

        // Spawn all servers concurrently (don't await their exit)
        for (const dir of packageDirs) {
          const label = dir || "root";
          const script = await getStartScript(instance, dir);
          const spawnOpts = dir ? { cwd: dir } : {};
          write(`🚀 Starting ${label}: npm run ${script}\r\n`);

          const startProcess = await instance.spawn("npm", ["run", script], spawnOpts);
          startProcess.output.pipeTo(
            new WritableStream({ write: (data) => write(data) })
          );
        }
      } catch (err) {
        console.error("Error setting up container:", err);
        const msg = err instanceof Error ? err.message : String(err);
        write(`❌ Error: ${msg}\r\n`);
        setSetupError(msg);
        setIsSetupInProgress(false);
        setLoadingState({
          transforming: false,
          mounting: false,
          installing: false,
          starting: false,
          ready: false,
        });
      }
    }

    setupContainer();
  }, [instance, templateData, isSetupComplete, isSetupInProgress]);

  useEffect(() => {
    return () => {};
  }, []);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md p-6 rounded-lg bg-gray-50 dark:bg-gray-900">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <h3 className="text-lg font-medium">Initializing WebContainer</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Setting up the environment for your project...
          </p>
        </div>
      </div>
    );
  }

  if (error || setupError) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-6 rounded-lg max-w-md">
          <div className="flex items-center gap-2 mb-3">
            <XCircle className="h-5 w-5" />
            <h3 className="font-semibold">Error</h3>
          </div>
          <p className="text-sm">{error || setupError}</p>
        </div>
      </div>
    );
  }

  const getStepIcon = (stepIndex: number) => {
    if (stepIndex < currentStep) return <CheckCircle className="h-5 w-5 text-green-500" />;
    if (stepIndex === currentStep) return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
    return <div className="h-5 w-5 rounded-full border-2 border-gray-300" />;
  };

  const getStepText = (stepIndex: number, label: string) => {
    const isActive = stepIndex === currentStep;
    const isComplete = stepIndex < currentStep;
    return (
      <span
        className={`text-sm font-medium ${
          isComplete ? "text-green-600" : isActive ? "text-blue-600" : "text-gray-500"
        }`}
      >
        {label}
      </span>
    );
  };

  return (
    <div className="h-full w-full flex flex-col">
      {!activePreviewUrl ? (
        <div className="h-full flex flex-col">
          <div className="w-full max-w-md p-6 m-5 rounded-lg bg-white dark:bg-zinc-800 shadow-sm mx-auto">
            <Progress value={(currentStep / totalSteps) * 100} className="h-2 mb-6" />
            <div className="space-y-4 mb-6">
              <div className="flex items-center gap-3">
                {getStepIcon(1)}
                {getStepText(1, "Transforming template data")}
              </div>
              <div className="flex items-center gap-3">
                {getStepIcon(2)}
                {getStepText(2, "Mounting files")}
              </div>
              <div className="flex items-center gap-3">
                {getStepIcon(3)}
                {getStepText(3, "Installing dependencies")}
              </div>
              <div className="flex items-center gap-3">
                {getStepIcon(4)}
                {getStepText(4, "Starting development server")}
              </div>
            </div>
          </div>

          <div className="flex-1 p-4">
            <TerminalComponent
              ref={terminalRef}
              webContainerInstance={instance}
              theme="dark"
              className="h-full"
            />
          </div>
        </div>
      ) : (
        <div className="h-full flex flex-col">
          {/* Address bar — shows port switcher buttons for monorepos */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30 shrink-0">
            <button
              onClick={() => {
                const iframe = document.querySelector(
                  "iframe[title='WebContainer Preview']"
                ) as HTMLIFrameElement;
                if (iframe) iframe.src = activePreviewUrl;
              }}
              className="p-1 rounded hover:bg-muted"
              title="Reload preview"
            >
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
            </button>

            {previewUrls.length > 1 ? (
              // Monorepo: show clickable port buttons
              <div className="flex flex-1 items-center gap-1 overflow-x-auto">
                {previewUrls.map(({ url, port }) => (
                  <button
                    key={port}
                    onClick={() => setActivePreviewUrl(url)}
                    className={`shrink-0 text-xs px-2 py-0.5 rounded border font-mono transition-colors ${
                      activePreviewUrl === url
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-muted"
                    }`}
                  >
                    :{port}
                  </button>
                ))}
              </div>
            ) : (
              <span className="flex-1 text-xs text-muted-foreground truncate font-mono bg-background rounded px-2 py-1 border select-all">
                {activePreviewUrl}
              </span>
            )}

            <button
              onClick={() => navigator.clipboard.writeText(activePreviewUrl)}
              className="p-1 rounded hover:bg-muted"
              title="Copy URL (only works in this tab)"
            >
              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>

          <div className="flex-1 min-h-0">
            <iframe
              src={activePreviewUrl}
              className="w-full h-full border-none"
              title="WebContainer Preview"
            />
          </div>

          <div className="h-64 border-t shrink-0">
            <TerminalComponent
              ref={terminalRef}
              webContainerInstance={instance}
              theme="dark"
              className="h-full"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default WebContainerPreview;
