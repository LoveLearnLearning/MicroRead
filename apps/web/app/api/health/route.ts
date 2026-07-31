import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    ai: {
      provider: "DeepSeek",
      model: process.env.AI_MODEL || "deepseek-v4-flash",
      configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
    },
    storage: "indexeddb",
    sync: "local-only",
    timestamp: new Date().toISOString(),
  });
}
