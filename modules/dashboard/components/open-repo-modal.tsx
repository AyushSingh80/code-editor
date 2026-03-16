"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Github, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { importGithubRepo } from "../actions";

interface OpenRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function OpenRepoModal({ isOpen, onClose }: OpenRepoModalProps) {
  const [repoUrl, setRepoUrl] = useState("");
  const [projectName, setProjectName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) {
      toast.error("Please enter a GitHub repository URL");
      return;
    }
    setIsLoading(true);
    try {
      const result = await importGithubRepo(repoUrl.trim(), projectName.trim());
      if (result.success && result.playgroundId) {
        toast.success("Repository imported successfully!");
        handleClose();
        router.push(`/playground/${result.playgroundId}`);
      } else {
        toast.error(result.error || "Failed to import repository");
      }
    } catch {
      toast.error("Failed to import repository");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (isLoading) return;
    setRepoUrl("");
    setProjectName("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            Open GitHub Repository
          </DialogTitle>
          <DialogDescription>
            Enter a public GitHub repository URL to import it into the editor.
            Up to 80 files will be fetched.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="repo-url">Repository URL *</Label>
            <Input
              id="repo-url"
              placeholder="https://github.com/owner/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              disabled={isLoading}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Accepts: full URL, <code>owner/repo</code>, or{" "}
              <code>owner/repo@branch</code>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-name">Project Name (optional)</Label>
            <Input
              id="project-name"
              placeholder="Defaults to repository name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              disabled={isLoading}
            />
          </div>

          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted p-3 rounded-md">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <span>Fetching repository files… this may take a moment.</span>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !repoUrl.trim()}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Importing…
                </>
              ) : (
                "Import Repository"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
