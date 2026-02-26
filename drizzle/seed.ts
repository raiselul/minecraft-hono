import "dotenv/config";
import { db } from "./index.js";
import { items, inventory, recipes, ingredients } from "./schema.js";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const executeWithRetry = async <T>(operation: () => Promise<T>, retries = 5, delayMs = 1500): Promise<T> => {
    for (let i = 0; i < retries; i++) {
        try {
            return await operation();
        } catch (error: any) {
            console.warn(`Query failed (Attempt ${i + 1}/${retries}): ${error.message || error.code}`);
            if (i === retries - 1) throw error;
            await sleep(delayMs);
        }
    }
    throw new Error("Failed after maximum retries");
};

async function seed() {
    console.log("Seeding database...");

    // Delete existing data to ensure idempotency
    await executeWithRetry(() => db.delete(ingredients));
    await executeWithRetry(() => db.delete(recipes));
    await executeWithRetry(() => db.delete(inventory));
    await executeWithRetry(() => db.delete(items));

    console.log("Cleared existing data.");
    await sleep(500);

    // Insert base items
    const insertedItems = await executeWithRetry(() => db.insert(items).values([
        { name: "Wood", description: "Basic building material from trees", maxStack: 64, imageUrl: "wood.png" },
        { name: "Stone", description: "Solid rock mined from the earth", maxStack: 64, imageUrl: "stone.png" },
        { name: "Iron Ore", description: "Unrefined iron, needs smelting", maxStack: 64, imageUrl: "iron_ore.png" },
        { name: "Wooden Planks", description: "Processed wood for crafting", maxStack: 64, imageUrl: "wooden_planks.png" },
        { name: "Iron Ingot", description: "Refined iron used for tools", maxStack: 64, imageUrl: "iron_ingot.png" },
        { name: "Stick", description: "A simple wooden stick", maxStack: 64, imageUrl: "stick.png" },
        { name: "Stone Pickaxe", description: "A basic tool for mining", maxStack: 1, imageUrl: "stone_pickaxe.png" },
        { name: "Iron Sword", description: "A strong weapon for combat", maxStack: 1, imageUrl: "iron_sword.png" }
    ]).returning());

    console.log(`Included ${insertedItems.length} items.`);
    await sleep(500);

    const itemsMap = Object.fromEntries(insertedItems.map((item: any) => [item.name, item.id]));

    // Give the player some starting inventory
    const insertedInventory = await executeWithRetry(() => db.insert(inventory).values([
        { itemId: itemsMap["Wood"], quantity: 15, slotIndex: 0 },
        { itemId: itemsMap["Stone"], quantity: 8, slotIndex: 1 },
        { itemId: itemsMap["Iron Ore"], quantity: 3, slotIndex: 2 }
    ]).returning());

    console.log(`Included ${insertedInventory.length} inventory slots.`);
    await sleep(500);

    // Define Recipes
    const insertedRecipes = await executeWithRetry(() => db.insert(recipes).values([
        { itemId: itemsMap["Wooden Planks"], quantity: 4, duration: 1000 },
        { itemId: itemsMap["Stick"], quantity: 4, duration: 1000 },
        { itemId: itemsMap["Iron Ingot"], quantity: 1, duration: 5000 },
        { itemId: itemsMap["Stone Pickaxe"], quantity: 1, duration: 3000 },
        { itemId: itemsMap["Iron Sword"], quantity: 1, duration: 4000 }
    ]).returning());

    const recipeMap = Object.fromEntries(
        insertedRecipes.map((r: any) => [r.itemId, r.id])
    );
    await sleep(500);

    // Insert all ingredients in a single batch
    await executeWithRetry(() => db.insert(ingredients).values([
        { recipeId: recipeMap[itemsMap["Wooden Planks"]], itemId: itemsMap["Wood"], quantity: 1, slotIndex: 0 },
        { recipeId: recipeMap[itemsMap["Stick"]], itemId: itemsMap["Wooden Planks"], quantity: 2, slotIndex: 0 },
        { recipeId: recipeMap[itemsMap["Iron Ingot"]], itemId: itemsMap["Iron Ore"], quantity: 1, slotIndex: 0 },
        { recipeId: recipeMap[itemsMap["Stone Pickaxe"]], itemId: itemsMap["Stone"], quantity: 3, slotIndex: 0 },
        { recipeId: recipeMap[itemsMap["Stone Pickaxe"]], itemId: itemsMap["Stick"], quantity: 2, slotIndex: 1 },
        { recipeId: recipeMap[itemsMap["Iron Sword"]], itemId: itemsMap["Iron Ingot"], quantity: 2, slotIndex: 0 },
        { recipeId: recipeMap[itemsMap["Iron Sword"]], itemId: itemsMap["Stick"], quantity: 1, slotIndex: 1 }
    ]));

    console.log("Seeding recipes and ingredients complete!");
    process.exit(0);
}

seed().catch((e) => {
    console.error("Seeding failed:");
    console.error(e);
    process.exit(1);
});
