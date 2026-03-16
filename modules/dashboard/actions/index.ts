"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/modules/auth/actions";
import { revalidatePath } from "next/cache";
import { TemplateFile, TemplateFolder } from "@/modules/playground/lib/path-to-json";

// ─── GitHub import helpers ────────────────────────────────────────────────────

function parseGithubUrl(raw: string): { owner: string; repo: string; branch?: string } | null {
  const trimmed = raw.trim().replace(/\.git$/, "");
  // https://github.com/owner/repo  or  https://github.com/owner/repo/tree/branch
  const fullMatch = trimmed.match(/github\.com\/([^/]+)\/([^/]+?)(?:\/tree\/([^/]+))?(?:\/?$)/);
  if (fullMatch) return { owner: fullMatch[1], repo: fullMatch[2], branch: fullMatch[3] };
  // owner/repo  or  owner/repo@branch
  const shortMatch = trimmed.match(/^([^/@ ]+)\/([^/@ ]+?)(?:@(.+))?$/);
  if (shortMatch) return { owner: shortMatch[1], repo: shortMatch[2], branch: shortMatch[3] };
  return null;
}

function buildFolderStructure(
  files: { path: string; content: string }[],
  rootName: string
): TemplateFolder {
  const root: TemplateFolder = { folderName: rootName, items: [] };
  for (const file of files) {
    const parts = file.path.split("/");
    const filename = parts[parts.length - 1];
    const dirParts = parts.slice(0, -1);
    let current = root;
    for (const part of dirParts) {
      let folder = current.items.find(
        (item): item is TemplateFolder => "folderName" in item && item.folderName === part
      );
      if (!folder) {
        folder = { folderName: part, items: [] };
        current.items.push(folder);
      }
      current = folder;
    }
    const lastDot = filename.lastIndexOf(".");
    current.items.push({
      filename: lastDot > 0 ? filename.substring(0, lastDot) : filename,
      fileExtension: lastDot > 0 ? filename.substring(lastDot + 1) : "",
      content: file.content,
    } as TemplateFile);
  }
  return root;
}

const IGNORED_FOLDERS = ["node_modules", ".git", ".vscode", ".idea", "dist", "build", "coverage", ".next", "out", ".turbo"];
const IGNORED_FILES = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", ".DS_Store", ".env", ".env.local", ".gitignore", ".npmrc"];
const BINARY_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "ico", "webp", "avif", "woff", "woff2", "ttf", "eot", "otf", "mp3", "mp4", "mov", "zip", "tar", "gz", "rar", "pdf", "exe", "dll", "so", "dylib", "pyc", "class", "jar"]);
const MAX_FILE_SIZE = 200 * 1024; // 200 KB
const MAX_FILES = 80;

export const importGithubRepo = async (repoUrl: string, projectName: string) => {
  const user = await currentUser();
  if (!user?.id) return { success: false, error: "Not authenticated" };

  const parsed = parseGithubUrl(repoUrl);
  if (!parsed) return { success: false, error: "Invalid GitHub repository URL" };
  const { owner, repo } = parsed;
  let { branch } = parsed;

  // Try to use the signed-in user's GitHub access token to raise rate limits
  const account = await db.account.findFirst({
    where: { userId: user.id, provider: "github" },
    select: { accessToken: true },
  });

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "code-editor-app",
  };
  if (account?.accessToken) headers["Authorization"] = `token ${account.accessToken}`;

  try {
    // 1. Get default branch if not specified
    if (!branch) {
      const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
      if (!repoRes.ok) {
        const err = await repoRes.json().catch(() => ({}));
        return { success: false, error: (err as any).message || `Repository not found: ${owner}/${repo}` };
      }
      const repoData = await repoRes.json();
      branch = repoData.default_branch as string;
    }

    // 2. Get the full recursive tree
    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      { headers }
    );
    if (!treeRes.ok) return { success: false, error: "Failed to fetch repository tree" };
    const treeData = await treeRes.json();

    if (treeData.truncated) {
      // Repository is too large; we still continue with what we got
      console.warn("GitHub tree truncated — large repository");
    }

    // 3. Filter to text blobs only
    const blobs = (treeData.tree as any[]).filter((item) => {
      if (item.type !== "blob") return false;
      const parts: string[] = item.path.split("/");
      const filename = parts[parts.length - 1];
      if (parts.slice(0, -1).some((p) => IGNORED_FOLDERS.includes(p))) return false;
      if (IGNORED_FILES.includes(filename)) return false;
      const ext = filename.split(".").pop()?.toLowerCase() ?? "";
      if (BINARY_EXTENSIONS.has(ext)) return false;
      if (item.size > MAX_FILE_SIZE) return false;
      return true;
    }).slice(0, MAX_FILES);

    // 4. Fetch file contents in parallel
    const fileContents = await Promise.all(
      blobs.map(async (blob) => {
        try {
          const res = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/contents/${blob.path}?ref=${branch}`,
            { headers }
          );
          if (!res.ok) return null;
          const data = await res.json();
          if (data.encoding === "base64" && data.content) {
            const content = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
            return { path: blob.path as string, content };
          }
          return null;
        } catch {
          return null;
        }
      })
    );

    const validFiles = fileContents.filter(Boolean) as { path: string; content: string }[];
    const name = projectName.trim() || repo;
    const templateData = buildFolderStructure(validFiles, name);

    // 5. Detect template type from package.json
    let template: "REACT" | "NEXTJS" | "EXPRESS" | "VUE" | "HONO" | "ANGULAR" = "REACT";
    const pkgFile = validFiles.find((f) => f.path === "package.json");
    if (pkgFile) {
      try {
        const pkg = JSON.parse(pkgFile.content);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps["next"]) template = "NEXTJS";
        else if (deps["vue"] || deps["@vue/core"]) template = "VUE";
        else if (deps["express"]) template = "EXPRESS";
        else if (deps["hono"]) template = "HONO";
        else if (deps["@angular/core"]) template = "ANGULAR";
      } catch { /* ignore parse errors */ }
    }

    // 6. Create playground + template file
    const playground = await db.playground.create({
      data: { title: name, template, userId: user.id },
    });
    await db.templateFile.create({
      data: { playgroundId: playground.id, content: JSON.stringify(templateData) },
    });

    revalidatePath("/dashboard");
    return { success: true, playgroundId: playground.id };
  } catch (error) {
    console.error("importGithubRepo error:", error);
    return { success: false, error: (error as Error).message };
  }
};

export const getAllPlaygroundForUser = async () => {
  const user = await currentUser();
  try {
    const playground = await db.playground.findMany({
      where: {
        userId: user?.id,
      },
      include: {
        user: true,
        StarMark: {
          where: {
            userId: user?.id,
          },
          select: {
            isMarked: true,
          },
        },
      },
    });
    return playground;
  } catch (error) {
    console.error(error);
  }
};
export const createPlayground = async (data: {
  title: string;
  template: "REACT" | "NEXTJS" | "EXPRESS" | "VUE" | "HONO" | "ANGULAR";
  description?: string;
}) => {
  const user = await currentUser();
  const { template, title, description } = data;
  try {
    const playground = await db.playground.create({
      data: {
        title: title,
        description: description,
        template: template,
        userId: user?.id!,
      },
    });
    return playground;
  } catch (error) {
    console.log(error);
  }
};
export const deleteProjectById = async (id: string) => {
  try {
    await db.playground.delete({
      where: {
        id,
      },
    });
    revalidatePath("/dashboard");
  } catch (error) {
    console.log(error);
  }
};
export const editProjectById = async (
  id: string,
  data: { title: string; description: string }
) => {
  try {
    await db.playground.update({
      where: {
        id,
      },
      data: data,
    });
    revalidatePath("/dashboard");
  } catch (error) {
    console.log(error);
  }
};
export const duplicateProjectById = async (id: string) => {
  try {
    const originalPlayground = await db.playground.findUnique({
      where: { id },
      //todo: add template file
    });
    if (!originalPlayground) {
      throw new Error("Original playground not found");
    }
    const duplicatePlayground = await db.playground.create({
      data: {
        title: `${originalPlayground.title} copy`,
        description: originalPlayground.description,
        template: originalPlayground.template,
        userId: originalPlayground.userId,
      },
    });
    revalidatePath("/dashboard");
    return duplicatePlayground;
  } catch (error) {
    console.log(error);
  }
};
export const toggleStarMarked = async (
  playgroundId: string,
  isChecked: boolean
) => {
  console.log("toggleStarMarked called with", playgroundId, isChecked);
  const user = await currentUser();
  const userId = user?.id;
  if (!userId) {
    throw new Error("User Id is Required");
  }
  try {
    if (isChecked) {
      await db.starMark.create({
        data: {
          userId: userId!,
          playgroundId,
          isMarked: true,
        },
      });
    } else {
      await db.starMark.delete({
        where: {
          userId_playgroundId: {
            userId,
            playgroundId: playgroundId,
          },
        },
      });
    }
    revalidatePath("/dashboard");
    return { success: true, isMarked: isChecked };
  } catch (error) {
    console.error("Error updating problem:", error);
    return { success: false, error: "failed to update problem" };
  }
};
