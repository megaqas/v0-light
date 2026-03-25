import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";

// Training examples from Kote Marjanishvili Theater, Tbilisi — play "Terror"
// Audience votes with small rectangular red (guilty) or white (not guilty) cards.
const EXAMPLES = [
  {
    file: "ex1.jpg", // IMG_5190
    label: '{"redCount": 5, "whiteCount": 13}',
  },
  {
    file: "ex2.jpg", // IMG_5224 — only red cards raised
    label: '{"redCount": 32, "whiteCount": 0}',
  },
  {
    file: "ex3.jpg", // IMG_5226 — only white cards raised
    label: '{"redCount": 0, "whiteCount": 158}',
  },
  {
    file: "ex4.jpg", // IMG_5228 — both colors, full house
    label: '{"redCount": 39, "whiteCount": 191}',
  },
];

function loadExampleBase64(filename: string): string {
  const filePath = path.join(process.cwd(), "public", "training", filename);
  return fs.readFileSync(filePath).toString("base64");
}

const SYSTEM_INSTRUCTION = `You are counting audience voting cards at Kote Marjanishvili Theater in Tbilisi, Georgia during the play "Terror".

CONTEXT:
- The audience votes by raising small flat rectangular cards: RED = guilty, WHITE = not guilty
- Total audience is typically 150–230 people
- In some voting rounds ONLY red OR ONLY white cards are raised — this is normal
- The theater has an ornate golden balcony, green upholstered seats, warm stage lighting

WHAT TO COUNT:
- Small flat rectangular paper/cardboard cards HELD UP in the air above or in front of the body
- Only count cards that are clearly raised intentionally as part of the vote

DO NOT COUNT:
- Clothing: red shirts, jackets, scarves, coats — these are worn on the body, NOT held up
- Skin, hair, or faces
- Seat covers, wall decorations, lights, or the stage
- Anything not clearly a flat card being deliberately held up

KEY RULE: If a red or white area is part of what someone is WEARING, ignore it completely.

Return ONLY valid JSON, no other text: {"redCount": <integer>, "whiteCount": <integer>}`;

const QUESTION = "Count the red and white voting cards being held up by audience members. Return only JSON.";

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
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: { temperature: 0.1 },
  });

  // Build few-shot conversation: alternating user (image+question) / model (correct answer)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contents: any[] = [];

  for (const ex of EXAMPLES) {
    let exBase64: string;
    try {
      exBase64 = loadExampleBase64(ex.file);
    } catch {
      continue; // skip if file missing (shouldn't happen in production)
    }
    contents.push({
      role: "user",
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: exBase64 } },
        { text: QUESTION },
      ],
    });
    contents.push({
      role: "model",
      parts: [{ text: ex.label }],
    });
  }

  // Add the actual image to count
  contents.push({
    role: "user",
    parts: [
      { inlineData: { mimeType, data: imageBase64 } },
      { text: QUESTION },
    ],
  });

  try {
    const result = await model.generateContent({ contents });
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
