import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ==========================================
// 1. ТАБЛИЦЫ
// ==========================================

// Справочник всех предметов в игре
export const items = pgTable("items", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  maxStackSize: integer("max_stack_size").default(64).notNull(),
});

// Инвентарь (для одного пользователя)
export const inventory = pgTable(
  "inventory",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slotIndex: integer("slot_index").notNull(), // Ячейки от 0 до 35
    itemId: uuid("item_id")
      .references(() => items.id, { onDelete: "cascade" })
      .notNull(),
    quantity: integer("quantity").notNull(),
  },
  (table) => {
    return {
      // Гарантируем, что в одном слоте не будет лежать две разные записи
      slotIdx: uniqueIndex("slot_idx").on(table.slotIndex),
    };
  },
);

// Рецепты (Результат крафта)
export const recipes = pgTable("recipes", {
  id: uuid("id").defaultRandom().primaryKey(),
  resultItemId: uuid("result_item_id")
    .references(() => items.id, { onDelete: "cascade" })
    .notNull(),
  resultQuantity: integer("result_quantity").default(1).notNull(),
});

// Ингредиенты (Из чего состоит рецепт)
export const ingredients = pgTable("ingredients", {
  id: uuid("id").defaultRandom().primaryKey(),
  recipeId: uuid("recipe_id")
    .references(() => recipes.id, { onDelete: "cascade" })
    .notNull(),
  itemId: uuid("item_id")
    .references(() => items.id, { onDelete: "cascade" })
    .notNull(),
  quantity: integer("quantity").default(1).notNull(),
  gridPosition: integer("grid_position"), // 0-8 для сетки 3x3. Если null — рецепт бесформенный
});

// ==========================================
// 2. СВЯЗИ (Drizzle Relations)
// ==========================================

export const inventoryRelations = relations(inventory, ({ one }) => ({
  // Позволяет при запросе инвентаря легко подтянуть данные о предмете
  item: one(items, {
    fields: [inventory.itemId],
    references: [items.id],
  }),
}));

export const recipesRelations = relations(recipes, ({ one, many }) => ({
  // Позволяет узнать, какой предмет получается в результате
  resultItem: one(items, {
    fields: [recipes.resultItemId],
    references: [items.id],
  }),
  // Позволяет вытащить список всех ингредиентов для этого рецепта
  ingredients: many(ingredients),
}));

export const ingredientsRelations = relations(ingredients, ({ one }) => ({
  // Связь ингредиента с его рецептом
  recipe: one(recipes, {
    fields: [ingredients.recipeId],
    references: [recipes.id],
  }),
  // Связь ингредиента с таблицей предметов (чтобы знать название нужного ресурса)
  item: one(items, {
    fields: [ingredients.itemId],
    references: [items.id],
  }),
}));
