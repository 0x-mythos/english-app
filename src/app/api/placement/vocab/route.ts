import { NextResponse } from "next/server";
import { publicVocabItems } from "@/lib/placement/vocab";

// Список слів окремим запитом, щоб у клієнтський бандл не потрапила позначка псевдослів.
export function GET() {
  return NextResponse.json({ items: publicVocabItems() });
}
