import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const { imageBase64, mimeType } = await req.json();
  if (!imageBase64 || !mimeType) {
    return NextResponse.json(
      { error: "imageBase64 and mimeType are required" },
      { status: 400 }
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `You are counting cards held up by audience members in this photo.

Count:
1. RED cards — any red-colored cards, sheets, signs, or paddles held by people
2. WHITE cards — any white-colored cards, sheets, signs, or paddles held by people

Rules:
- Only count cards/sheets clearly being held up by people
- Scan the image systematically: left to right, row by row
- Do not count partial cards unless clearly identifiable as a distinct card
- If there are no cards of a color, return 0

Return ONLY valid JSON in exactly this format with no extra text:
{"redCount": <integer>, "whiteCount": <integer>}`;

  try {
    const result = await model.generateContent([
      { inlineData: { mimeType, data: imageBase64 } },
      prompt,
    ]);

    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[^}]+\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Could not parse AI response", raw: text },
        { status: 502 }
      );
    }

    const counts = JSON.parse(jsonMatch[0]);
    const redCount = Math.max(0, parseInt(counts.redCount) || 0);
    const whiteCount = Math.max(0, parseInt(counts.whiteCount) || 0);

    return NextResponse.json({
      redCount,
      whiteCount,
      totalCount: redCount + whiteCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
