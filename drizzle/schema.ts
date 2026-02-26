import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  maxStack: integer("max_stack").notNull(),
});

export const inventory = sqliteTable(
  "inventory",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .references(() => items.id, { onDelete: "cascade" })
      .notNull(),
    quantity: integer("quantity").notNull(),
    slotIndex: integer("slot_index").notNull(),
  },
  (table) => {
    return {
      slotIdx: uniqueIndex("unique_inventory_slot").on(table.slotIndex),
    };
  },
);

export const recipes = sqliteTable("recipes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemId: integer("item_id")
    .references(() => items.id, { onDelete: "cascade" })
    .notNull(),
  quantity: integer("quantity").notNull(),
  duration: integer("duration").default(0).notNull(),
});

export const ingredients = sqliteTable(
  "ingredients",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recipeId: integer("recipe_id")
      .references(() => recipes.id, { onDelete: "cascade" })
      .notNull(),
    itemId: integer("item_id")
      .references(() => items.id, { onDelete: "cascade" })
      .notNull(),
    quantity: integer("quantity").notNull(),
    slotIndex: integer("slot_index").notNull(),
  },
  (table) => {
    return {
      recipeSlotIdx: uniqueIndex("unique_recipe_slot").on(
        table.recipeId,
        table.slotIndex,
      ),
    };
  },
);

export const inventoryRelations = relations(inventory, ({ one }) => ({
  item: one(items, {
    fields: [inventory.itemId],
    references: [items.id],
  }),
}));

export const recipesRelations = relations(recipes, ({ one, many }) => ({
  resultItem: one(items, {
    fields: [recipes.itemId],
    references: [items.id],
  }),
  ingredients: many(ingredients),
}));

export const ingredientsRelations = relations(ingredients, ({ one }) => ({
  recipe: one(recipes, {
    fields: [ingredients.recipeId],
    references: [recipes.id],
  }),
  item: one(items, {
    fields: [ingredients.itemId],
    references: [items.id],
  }),
}));
