import { db } from "@/lib/db";
import { templatePaths } from "@/lib/template";
import { scanTemplateDirectory } from "@/modules/playground/lib/path-to-json";
import { NextRequest } from "next/server";
import path from "path";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return new Response(JSON.stringify({ error: "Template ID is required" }), {
      status: 400,
    });
  }

  const playground = await db.playground.findUnique({
    where: { id },
  });
  if (!playground) {
    return new Response(JSON.stringify({ error: "Template not found" }), {
      status: 404,
    });
  }
  const templateKey = playground.template as keyof typeof templatePaths;
  const templatePath = templatePaths[templateKey];
  if (!templatePath) {
    return new Response(JSON.stringify({ error: "Template path not found" }), {
      status: 404,
    });
  }
  try {
    const inputPath = path.join(process.cwd(), templatePath);
    const result = await scanTemplateDirectory(inputPath);
    return new Response(
      JSON.stringify({ success: true, templateJson: result }),
      { status: 200 }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: `Error processing template: ${(error as Error).message}`,
      }),
      { status: 500 }
    );
  }
}
