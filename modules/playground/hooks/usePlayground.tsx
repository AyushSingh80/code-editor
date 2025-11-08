import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import type { TemplateFolder } from "../lib/path-to-json";
import { se } from "date-fns/locale";
import { getPlaygroundById, SaveUpdatedCode } from "../actions";
interface PlaygroundData {
  id: string;
  title?: string;
  [key: string]: any;
}
interface UsePlaygroundReturn {
  playgroundData: PlaygroundData | null;
  templateData: TemplateFolder | null;
  isLoading: boolean;
  error: string | null;
  loadPlayground: () => Promise<void>;
  saveTemplateData: (data: TemplateFolder) => Promise<void>;
}
export const UsePlayground = (id: string): UsePlaygroundReturn => {
  const [playgroundData, setPlaygroundData] = useState<PlaygroundData | null>(
    null
  );
  const [templateData, setTemplateData] = useState<TemplateFolder | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadPlayground = useCallback(async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      setError(null);
      const data = await getPlaygroundById(id);
      console.log(`data:-  ${data?.templateFile}`);

      //@ts-ignore
      setPlaygroundData(data);
      const rawContent = data?.templateFile?.[0]?.content;
      console.log(`rawContent:-  ${rawContent}`);
      if (typeof rawContent === "string") {
        const parsedContent = JSON.parse(rawContent);
        setTemplateData(parsedContent);
        toast.success("Playground loaded successfully");
        return;
      }

      const res = await fetch(`/api/template/${id}`);
      if (!res.ok) {
        throw new Error("Failed to fetch template data");
      }
      const templateRes = await res.json();
      if (templateRes.templateJson && Array.isArray(templateRes.templateJson)) {
        setTemplateData({
          folderName: "Root",
          items: templateRes.templateJson,
        });
      } else {
        setTemplateData(
          templateRes.templateJson || {
            folderName: "Root",
            items: [],
          }
        );
      }
      toast.success("Playground loaded successfully");
    } catch (error) {
      console.error("Error loading playground:", error);
      setError((error as Error).message);
      toast.error(`Error loading playground: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  const saveTemplateData = useCallback(
    async (data: TemplateFolder) => {
      try {
        await SaveUpdatedCode(id, data);
        setTemplateData(data);
        toast.success("Changes saved successfully");
      } catch (error) {
        console.log("Error in saving Templating");
        toast.error("Failed to save changes");
        throw error;
      }
    },
    [id]
  );
  useEffect(() => {
    loadPlayground();
  }, [loadPlayground]);
  return {
    playgroundData,
    templateData,
    isLoading,
    error,
    loadPlayground,
    saveTemplateData,
  };
};
