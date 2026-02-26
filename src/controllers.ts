import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../drizzle/index.js';
import { inventory, items, recipes, ingredients } from '../drizzle/schema.js';

export const inventoryRoutes = new Hono();

// 1. POST /api/inventory/move (Перемещение / Drag & Drop)
inventoryRoutes.post('/move', async (c) => {
    try {
        const { fromSlot, toSlot } = await c.req.json();
        if (typeof fromSlot !== 'number' || typeof toSlot !== 'number') {
            return c.json({ error: 'fromSlot and toSlot must be numbers' }, 400);
        }
        if (fromSlot === toSlot) {
            return c.json({ error: 'Cannot move to the same slot' }, 400);
        }

        await db.transaction(async (tx) => {
            // Find fromSlot item
            const fromRows = await tx
                .select({
                    id: inventory.id,
                    itemId: inventory.itemId,
                    quantity: inventory.quantity,
                    slotIndex: inventory.slotIndex,
                    maxStack: items.maxStack,
                })
                .from(inventory)
                .innerJoin(items, eq(inventory.itemId, items.id))
                .where(eq(inventory.slotIndex, fromSlot));

            const fromRecord = fromRows[0];
            if (!fromRecord) {
                throw new Error('404:Item not found in fromSlot');
            }

            // Find toSlot item
            const toRows = await tx
                .select({
                    id: inventory.id,
                    itemId: inventory.itemId,
                    quantity: inventory.quantity,
                    slotIndex: inventory.slotIndex,
                    maxStack: items.maxStack,
                })
                .from(inventory)
                .innerJoin(items, eq(inventory.itemId, items.id))
                .where(eq(inventory.slotIndex, toSlot));

            const toRecord = toRows[0];

            if (!toRecord) {
                // Target slot is empty, just update slotIndex
                await tx
                    .update(inventory)
                    .set({ slotIndex: toSlot })
                    .where(eq(inventory.id, fromRecord.id));
            } else if (fromRecord.itemId !== toRecord.itemId) {
                // Different items, swap them
                // Using -1 as a temporary slot index to avoid unique constraint violation
                await tx.update(inventory).set({ slotIndex: -1 }).where(eq(inventory.id, fromRecord.id));
                await tx.update(inventory).set({ slotIndex: fromSlot }).where(eq(inventory.id, toRecord.id));
                await tx.update(inventory).set({ slotIndex: toSlot }).where(eq(inventory.id, fromRecord.id));
            } else {
                // Same items, merge stacks
                const totalAmount = fromRecord.quantity + toRecord.quantity;
                const maxStack = toRecord.maxStack;

                if (totalAmount <= maxStack) {
                    // Can fit perfectly, remove fromRecord, update toRecord
                    await tx.update(inventory).set({ quantity: totalAmount }).where(eq(inventory.id, toRecord.id));
                    await tx.delete(inventory).where(eq(inventory.id, fromRecord.id));
                } else {
                    // Overflow
                    const overflow = totalAmount - maxStack;
                    await tx.update(inventory).set({ quantity: maxStack }).where(eq(inventory.id, toRecord.id));
                    await tx.update(inventory).set({ quantity: overflow }).where(eq(inventory.id, fromRecord.id));
                }
            }
        });

        return c.json({ success: true, message: 'Moved successfully' });
    } catch (error: any) {
        if (error.message && error.message.startsWith('404:')) {
            return c.json({ error: error.message.split('404:')[1] }, 404);
        }
        console.error(error);
        return c.json({ error: 'Internal Server Error' }, 500);
    }
});

// 2. POST /api/inventory/split (Разделение стака)
inventoryRoutes.post('/split', async (c) => {
    try {
        const { fromSlot, toSlot, amount } = await c.req.json();
        if (typeof fromSlot !== 'number' || typeof toSlot !== 'number' || typeof amount !== 'number') {
            return c.json({ error: 'fromSlot, toSlot, amount must be numbers' }, 400);
        }
        if (amount <= 0) return c.json({ error: 'Amount must be greater than 0' }, 400);
        if (fromSlot === toSlot) return c.json({ error: 'Slots must be different' }, 400);

        await db.transaction(async (tx) => {
            const fromRows = await tx
                .select({
                    id: inventory.id,
                    itemId: inventory.itemId,
                    quantity: inventory.quantity,
                    slotIndex: inventory.slotIndex,
                    maxStack: items.maxStack,
                })
                .from(inventory)
                .innerJoin(items, eq(inventory.itemId, items.id))
                .where(eq(inventory.slotIndex, fromSlot));

            const fromRecord = fromRows[0];
            if (!fromRecord) throw new Error('404:Item not found in fromSlot');
            if (fromRecord.quantity < amount) throw new Error('400:Not enough quantity in fromSlot');

            const toRows = await tx
                .select({
                    id: inventory.id,
                    itemId: inventory.itemId,
                    quantity: inventory.quantity,
                    slotIndex: inventory.slotIndex,
                    maxStack: items.maxStack,
                })
                .from(inventory)
                .innerJoin(items, eq(inventory.itemId, items.id))
                .where(eq(inventory.slotIndex, toSlot));

            const toRecord = toRows[0];

            if (!toRecord) {
                // Target slot is empty, create new stack
                await tx.insert(inventory).values({
                    itemId: fromRecord.itemId,
                    quantity: amount,
                    slotIndex: toSlot,
                });
            } else {
                if (toRecord.itemId !== fromRecord.itemId) {
                    throw new Error('400:Cannot split into a slot with a different item');
                }
                const total = toRecord.quantity + amount;
                if (total > toRecord.maxStack) {
                    throw new Error('400:Target slot target max stack limit exceeded');
                }
                await tx.update(inventory).set({ quantity: total }).where(eq(inventory.id, toRecord.id));
            }

            // Deduct from fromSlot
            const remaining = fromRecord.quantity - amount;
            if (remaining <= 0) {
                await tx.delete(inventory).where(eq(inventory.id, fromRecord.id));
            } else {
                await tx.update(inventory).set({ quantity: remaining }).where(eq(inventory.id, fromRecord.id));
            }
        });

        return c.json({ success: true, message: 'Split successfully' });
    } catch (error: any) {
        if (error.message && error.message.startsWith('404:')) return c.json({ error: error.message.split('404:')[1] }, 404);
        if (error.message && error.message.startsWith('400:')) return c.json({ error: error.message.split('400:')[1] }, 400);
        console.error(error);
        return c.json({ error: 'Internal Server Error' }, 500);
    }
});

// 3. DELETE /api/inventory/drop (Выбросить предмет)
inventoryRoutes.delete('/drop', async (c) => {
    try {
        const { slotIndex, amount } = await c.req.json();
        if (typeof slotIndex !== 'number') {
            return c.json({ error: 'slotIndex must be a number' }, 400);
        }

        await db.transaction(async (tx) => {
            const rows = await tx.select().from(inventory).where(eq(inventory.slotIndex, slotIndex));
            const record = rows[0];

            if (!record) throw new Error('404:Item not found in slotIndex');

            if (amount === undefined) {
                // Drop the whole stack
                await tx.delete(inventory).where(eq(inventory.id, record.id));
            } else {
                if (typeof amount !== 'number' || amount <= 0) {
                    throw new Error('400:amount must be a positive number');
                }
                const remaining = record.quantity - amount;
                if (remaining <= 0) {
                    await tx.delete(inventory).where(eq(inventory.id, record.id));
                } else {
                    await tx.update(inventory).set({ quantity: remaining }).where(eq(inventory.id, record.id));
                }
            }
        });

        return c.json({ success: true, message: 'Dropped successfully' });
    } catch (error: any) {
        if (error.message && error.message.startsWith('404:')) return c.json({ error: error.message.split('404:')[1] }, 404);
        if (error.message && error.message.startsWith('400:')) return c.json({ error: error.message.split('400:')[1] }, 400);
        console.error(error);
        return c.json({ error: 'Internal Server Error' }, 500);
    }
});

export const craftRoutes = new Hono();

// 4. POST /api/craft (Создание предмета)
craftRoutes.post('/', async (c) => {
    try {
        const { recipeId } = await c.req.json();
        if (typeof recipeId !== 'number') {
            return c.json({ error: 'recipeId must be a number' }, 400);
        }

        await db.transaction(async (tx) => {
            // Get the recipe and required ingredients
            const recipeRows = await tx.select().from(recipes).where(eq(recipes.id, recipeId));
            const recipeRec = recipeRows[0];
            if (!recipeRec) throw new Error('404:Recipe not found');

            const ingredientRows = await tx.select().from(ingredients).where(eq(ingredients.recipeId, recipeId));
            if (ingredientRows.length === 0) throw new Error('400:Recipe has no ingredients defined');

            // Get user inventory
            const invRows = await tx.select().from(inventory);

            // Calculate total required per item from ingredients
            const requiredItems = new Map<number, number>();
            for (const ing of ingredientRows) {
                requiredItems.set(ing.itemId, (requiredItems.get(ing.itemId) || 0) + ing.quantity);
            }

            // Check if user has enough ingredients
            for (const [itemId, requiredQty] of Array.from(requiredItems.entries())) {
                const userTotalQty = invRows.filter(i => i.itemId === itemId).reduce((sum, i) => sum + i.quantity, 0);
                if (userTotalQty < requiredQty) {
                    throw new Error('400:Недостаточно ингредиентов для крафта');
                }
            }

            // Deduct ingredients sequentially
            for (const [itemId, requiredQty] of Array.from(requiredItems.entries())) {
                let remainingToDeduct = requiredQty;
                // Find existing stacks with the item matching the ingredient requirement
                const stacks = invRows.filter(i => i.itemId === itemId);

                for (const stack of stacks) {
                    if (remainingToDeduct <= 0) break;

                    if (stack.quantity <= remainingToDeduct) {
                        // Delete whole stack
                        await tx.delete(inventory).where(eq(inventory.id, stack.id));
                        remainingToDeduct -= stack.quantity;
                    } else {
                        // Deduct partial capacity
                        const newQty = stack.quantity - remainingToDeduct;
                        await tx.update(inventory).set({ quantity: newQty }).where(eq(inventory.id, stack.id));
                        remainingToDeduct = 0;
                    }
                }
            }

            // Read target result requirements limit
            const resultItemId = recipeRec.itemId;
            const resultQty = recipeRec.quantity;

            const itemRows = await tx.select().from(items).where(eq(items.id, resultItemId));
            const resultItem = itemRows[0];
            if (!resultItem) throw new Error('404:Result item not found in DB');

            // Fetch fresh inventory state given modifications across the transaction
            const freshInvRows = await tx.select().from(inventory);

            let amountToAdd = resultQty;

            // Try to fill any slots with same object
            const existingStacks = freshInvRows.filter(i => i.itemId === resultItemId);
            for (const stack of existingStacks) {
                if (amountToAdd <= 0) break;
                const spaceLeft = resultItem.maxStack - stack.quantity;
                if (spaceLeft > 0) {
                    const toAdd = Math.min(spaceLeft, amountToAdd);
                    await tx.update(inventory).set({ quantity: stack.quantity + toAdd }).where(eq(inventory.id, stack.id));
                    amountToAdd -= toAdd;
                }
            }

            // Insert object in a completely empty new spot if needed remaining capacity
            if (amountToAdd > 0) {
                const INVENTORY_SIZE = 36;
                const usedSlots = new Set(freshInvRows.map(i => i.slotIndex));

                let emptySlot = 0;

                while (amountToAdd > 0) {
                    while (usedSlots.has(emptySlot)) {
                        emptySlot++;
                    }

                    if (emptySlot >= INVENTORY_SIZE) {
                        // Rollback everything safely during failure point!
                        throw new Error('400:Инвентарь полон');
                    }

                    const toAdd = Math.min(resultItem.maxStack, amountToAdd);
                    await tx.insert(inventory).values({
                        itemId: resultItemId,
                        quantity: toAdd,
                        slotIndex: emptySlot,
                    });

                    usedSlots.add(emptySlot);
                    amountToAdd -= toAdd;
                }
            }
        });

        return c.json({ success: true, message: 'Crafted successfully' });
    } catch (error: any) {
        if (error.message && error.message.startsWith('404:')) return c.json({ error: error.message.split('404:')[1] }, 404);
        if (error.message && error.message.startsWith('400:')) return c.json({ error: error.message.split('400:')[1] }, 400);
        console.error(error);
        return c.json({ error: 'Internal Server Error' }, 500);
    }
});

export const itemsRoutes = new Hono();

// 5. GET /api/items (Получить все предметы)
itemsRoutes.get('/', async (c) => {
    try {
        const allItems = await db.select().from(items);
        return c.json({ items: allItems });
    } catch (error) {
        console.error(error);
        return c.json({ error: 'Internal Server Error' }, 500);
    }
});

// 6. POST /api/inventory/add (Добавить предмет в инвентарь)
inventoryRoutes.post('/add', async (c) => {
    try {
        const { itemId, amount } = await c.req.json();
        if (typeof itemId !== 'number' || typeof amount !== 'number') {
            return c.json({ error: 'itemId and amount must be numbers' }, 400);
        }
        if (amount <= 0) return c.json({ error: 'Amount must be greater than 0' }, 400);

        await db.transaction(async (tx) => {
            const itemRows = await tx.select().from(items).where(eq(items.id, itemId));
            const targetItem = itemRows[0];
            if (!targetItem) throw new Error('404:Item not found in DB');

            const invRows = await tx.select().from(inventory);
            let amountToAdd = amount;

            // Try filling existing stacks first
            const existingStacks = invRows.filter(i => i.itemId === itemId);
            for (const stack of existingStacks) {
                if (amountToAdd <= 0) break;
                const spaceLeft = targetItem.maxStack - stack.quantity;
                if (spaceLeft > 0) {
                    const toAdd = Math.min(spaceLeft, amountToAdd);
                    await tx.update(inventory).set({ quantity: stack.quantity + toAdd }).where(eq(inventory.id, stack.id));
                    amountToAdd -= toAdd;
                }
            }

            // Fill empty slots if still amountToAdd > 0
            if (amountToAdd > 0) {
                const INVENTORY_SIZE = 36;
                const usedSlots = new Set(invRows.map(i => i.slotIndex));

                let emptySlot = 0;

                while (amountToAdd > 0) {
                    while (usedSlots.has(emptySlot)) {
                        emptySlot++;
                    }

                    if (emptySlot >= INVENTORY_SIZE) {
                        throw new Error('400:Инвентарь полон');
                    }

                    const toAdd = Math.min(targetItem.maxStack, amountToAdd);
                    await tx.insert(inventory).values({
                        itemId: itemId,
                        quantity: toAdd,
                        slotIndex: emptySlot,
                    });

                    usedSlots.add(emptySlot);
                    amountToAdd -= toAdd;
                }
            }
        });

        return c.json({ success: true, message: 'Added successfully' });
    } catch (error: any) {
        if (error.message && error.message.startsWith('404:')) return c.json({ error: error.message.split('404:')[1] }, 404);
        if (error.message && error.message.startsWith('400:')) return c.json({ error: error.message.split('400:')[1] }, 400);
        console.error(error);
        return c.json({ error: 'Internal Server Error' }, 500);
    }
});
