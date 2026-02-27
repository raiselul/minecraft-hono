import "dotenv/config";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { items, recipes, ingredients, inventory } from "./schema.js";
import * as fs from "fs";
import * as path from "path";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const db = drizzle(client);

function parseCSVRow(str: string): string[] {
  const arr: string[] = [];
  let quote = false;
  let value = "";
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '"' && str[i + 1] === '"') {
      value += '"';
      i++;
    } else if (char === '"') {
      quote = !quote;
    } else if (char === ',' && !quote) {
      arr.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  arr.push(value);
  return arr;
}

function parseCSV(content: string) {
  const lines = content.trim().split("\n");
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = parseCSVRow(line);
    
    // In case the row has an unquoted comma that breaks parser, fallback:
    if (parts.length < 5) {
      const split = line.split(",");
      const id = parseInt(split[0]);
      const maxStack = parseInt(split[split.length - 1]);
      const imageUrl = split[split.length - 2];
      const name = split[1];
      const description = split.slice(2, split.length - 2).join(",");
      data.push({ id, name, description, imageUrl, maxStack });
      continue;
    }

    const id = parseInt(parts[0]);
    const name = parts[1];
    const description = parts[2];
    const imageUrl = parts[3];
    const maxStack = parseInt(parts[4]);

    data.push({ id, name, description, imageUrl, maxStack });
  }
  return data;
}

async function main() {
  console.log("Starting DB seed...");

  // clear existing data
  console.log("Clearing tables...");
  await db.delete(ingredients);
  await db.delete(recipes);
  await db.delete(inventory);
  await db.delete(items);

  console.log("Reading items.csv...");
  const itemsCsvPath = path.resolve("items.csv");
  const itemsCsvContent = fs.readFileSync(itemsCsvPath, "utf-8");
  const parsedItems = parseCSV(itemsCsvContent);

  const BATCH_SIZE = 500;
  console.log(`Inserting ${parsedItems.length} items...`);
  for (let i = 0; i < parsedItems.length; i += BATCH_SIZE) {
    const batch = parsedItems.slice(i, i + BATCH_SIZE);
    await db.insert(items).values(
      batch.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        imageUrl: item.imageUrl,
        maxStack: isNaN(item.maxStack) ? 64 : item.maxStack,
      }))
    );
  }

  console.log("Reading recipes.json...");
  const recipesJsonPath = path.resolve("recipes.json");
  const recipesJsonContent = fs.readFileSync(recipesJsonPath, "utf-8");
  const parsedRecipes = JSON.parse(recipesJsonContent);

  const validItemIds = new Set(parsedItems.map((i) => i.id));

  const mappedRecipes = [];
  const allIngredients = [];

  for (const r of parsedRecipes) {
    // Only insert recipes that produce a valid item
    if (!validItemIds.has(r.resultItemId)) continue;

    mappedRecipes.push({
      id: r.id,
      itemId: r.resultItemId,
      quantity: r.resultCount,
      type: r.type,
      duration: 0,
    });

    const rIngredients = r.ingredients || [];
    for (let slotIdx = 0; slotIdx < rIngredients.length; slotIdx++) {
      const slotItems = rIngredients[slotIdx];
      // slotItems is an array of valid item ids for this slot
      if (Array.isArray(slotItems) && slotItems.length > 0) {
        // We only take the first one since we removed itemId from the unique index
        // meaning each slot can only have ONE ingredient item.
        const firstValidItem = slotItems.find((id: number) => validItemIds.has(id));
        if (firstValidItem !== undefined) {
          allIngredients.push({
            recipeId: r.id,
            itemId: firstValidItem,
            quantity: 1,
            slotIndex: slotIdx,
          });
        }
      }
    }
  }

  console.log(`Inserting ${mappedRecipes.length} recipes...`);
  for (let i = 0; i < mappedRecipes.length; i += BATCH_SIZE) {
    await db.insert(recipes).values(mappedRecipes.slice(i, i + BATCH_SIZE));
  }

  console.log(`Inserting ${allIngredients.length} ingredients...`);
  for (let i = 0; i < allIngredients.length; i += BATCH_SIZE) {
    await db.insert(ingredients).values(allIngredients.slice(i, i + BATCH_SIZE));
  }

  console.log("DB seed successfully completed!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:");
  console.error(err);
  process.exit(1);
});
