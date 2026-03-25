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
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-pro",
    generationConfig: { temperature: 0.1 },
  });

  const prompt = `You are a precise vote-card counter. Your job is to count small flat rectangular cards being actively held up in the air by audience members.

WHAT COUNTS AS A CARD:
- A flat rectangular piece of paper or cardboard
- Held UP in the air by a person — arm raised, card clearly displayed above or in front of their body
- Intentionally shown to a camera or judge (voting cards, response cards, audience participation cards)
- Typically the size of an A4 sheet or smaller, held in one or two hands

WHAT DOES NOT COUNT — IGNORE THESE COMPLETELY:
- Clothing: red shirts, red jackets, red scarves, white shirts, white coats — DO NOT COUNT these even if they are clearly red or white
- A person's skin, hair, or face
- Seat covers, banners, posters attached to walls or poles
- Lights, screens, or reflections
- Anything that is part of what someone is wearing (on their body)
- Background colors or decorations

KEY DISTINCTION: Clothing is worn ON the body. A card is held UP away from the body with intention. If you are unsure whether something is a held card or clothing, do NOT count it.

COUNTING METHOD:
1. First, identify every person in the image with an arm raised or extended
2. For each raised arm, check what is in their hand — is it a flat card being displayed?
3. Count only confirmed held-up cards
4. Scan left to right, top to bottom, row by row to avoid missing anyone

Count:
- RED cards: red or dark-red colored flat cards/papers being held up
- WHITE cards: white or light-colored flat cards/papers being held up

Return ONLY this JSON with no explanation, no markdown, no extra text:
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
