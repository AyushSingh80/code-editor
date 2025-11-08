import { db } from "@/lib/db";
import { templatePaths } from "@/lib/template";
import {
  readTemplateStructureFromJson,
  saveTemplateStructureToJson,
} from "@/modules/playground/lib/path-to-json";
import { NextRequest } from "next/server";
import fs from "fs/promises";
import path from "path";

function validateJsonStructure(data: unknown): boolean {
  try {
    JSON.parse(JSON.stringify(data));
    return true;
  } catch (error) {
    return false;
  }
}

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
    const outputPath = path.join(process.cwd(), `output/${templateKey}.json`);
    await saveTemplateStructureToJson(inputPath, outputPath);
    const result = await readTemplateStructureFromJson(outputPath);

    if (!validateJsonStructure(result.items)) {
      return new Response(
        JSON.stringify({ error: "Invalid template JSON structure" }),
        { status: 500 }
      );
    }
    await fs.unlink(outputPath);
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
