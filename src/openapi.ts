export const openapiSpec = `openapi: 3.0.3
info:
  title: Minecraft Inventory & Crafting API
  version: 1.0.0
  description: API for managing a Minecraft-like inventory, crafting system, and item catalog.
servers:
  - url: http://localhost:3000
    description: Local development server
paths:
  /api/inventory:
    get:
      summary: Get player inventory
      description: Retrieves the current state of the player's inventory, including detailed item information.
      responses:
        "200":
          description: Successful response
          content:
            application/json:
              schema:
                type: object
                properties:
                  inventory:
                    type: array
                    items:
                      $ref: "#/components/schemas/ExtendedInventoryItem"
        "500":
          $ref: "#/components/responses/InternalServerError"
    put:
      summary: Sync entire inventory
      description: Overwrites the current inventory state with a new state. Primarily used to load/sync data on login.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                inventory:
                  type: array
                  items:
                    $ref: "#/components/schemas/InventorySlotSync"
      responses:
        "200":
          $ref: "#/components/responses/SuccessResponse"
        "400":
          $ref: "#/components/responses/BadRequestError"
        "500":
          $ref: "#/components/responses/InternalServerError"

  /api/inventory/move:
    post:
      summary: Move item in inventory (Drag & Drop)
      description: Moves an item stack from one slot to another or swaps items/merges stacks if the target slot is occupied.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                fromSlot:
                  type: integer
                toSlot:
                  type: integer
              required:
                - fromSlot
                - toSlot
      responses:
        "200":
          $ref: "#/components/responses/SuccessResponse"
        "400":
          $ref: "#/components/responses/BadRequestError"
        "404":
          $ref: "#/components/responses/NotFoundError"
        "500":
          $ref: "#/components/responses/InternalServerError"

  /api/inventory/split:
    post:
      summary: Split item stack
      description: Splits a specified amount from an item stack to a new slot. Can merge into an existing stack of the same item.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                fromSlot:
                  type: integer
                toSlot:
                  type: integer
                amount:
                  type: integer
                  minimum: 1
              required:
                - fromSlot
                - toSlot
                - amount
      responses:
        "200":
          $ref: "#/components/responses/SuccessResponse"
        "400":
          $ref: "#/components/responses/BadRequestError"
        "404":
          $ref: "#/components/responses/NotFoundError"
        "500":
          $ref: "#/components/responses/InternalServerError"

  /api/inventory/drop:
    delete:
      summary: Drop item(s) from inventory
      description: Removes a specified amount of items (or the whole stack if amount is omitted) from the given slot.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                slotIndex:
                  type: integer
                amount:
                  type: integer
                  minimum: 1
                  description: Optional. If omitted, drops the whole stack in the slot.
              required:
                - slotIndex
      responses:
        "200":
          $ref: "#/components/responses/SuccessResponse"
        "400":
          $ref: "#/components/responses/BadRequestError"
        "404":
          $ref: "#/components/responses/NotFoundError"
        "500":
          $ref: "#/components/responses/InternalServerError"

  /api/inventory/add:
    post:
      summary: Add an item to the inventory
      description: Adds a given amount of a specific item to the inventory. Auto-allocates to existing stacks or empty slots.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                itemId:
                  type: integer
                amount:
                  type: integer
                  minimum: 1
              required:
                - itemId
                - amount
      responses:
        "200":
          $ref: "#/components/responses/SuccessResponse"
        "400":
          $ref: "#/components/responses/BadRequestError"
        "404":
          $ref: "#/components/responses/NotFoundError"
        "500":
          $ref: "#/components/responses/InternalServerError"

  /api/craft:
    post:
      summary: Craft an item
      description: Attempts to craft the given recipe by checking user inventory, deducting ingredients, and adding the result.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                recipeId:
                  type: integer
              required:
                - recipeId
      responses:
        "200":
          $ref: "#/components/responses/SuccessResponse"
        "400":
          $ref: "#/components/responses/BadRequestError"
        "404":
          $ref: "#/components/responses/NotFoundError"
        "500":
          $ref: "#/components/responses/InternalServerError"

  /api/items:
    get:
      summary: Get all available items
      description: Returns the full catalog of items available in the application database.
      responses:
        "200":
          description: Successful response
          content:
            application/json:
              schema:
                type: object
                properties:
                  items:
                    type: array
                    items:
                      $ref: "#/components/schemas/Item"
        "500":
          $ref: "#/components/responses/InternalServerError"

  /api/recipes:
    get:
      summary: Get all recipes with ingredients
      description: Returns the full catalog of crafting recipes alongside their required ingredients.
      responses:
        "200":
          description: Successful response
          content:
            application/json:
              schema:
                type: object
                properties:
                  recipes:
                    type: array
                    items:
                      $ref: "#/components/schemas/Recipe"
        "500":
          $ref: "#/components/responses/InternalServerError"

components:
  schemas:
    Item:
      type: object
      properties:
        id:
          type: integer
        name:
          type: string
        description:
          type: string
        imageUrl:
          type: string
        maxStack:
          type: integer
      required:
        - id
        - name
        - maxStack

    ExtendedInventoryItem:
      type: object
      properties:
        id:
          type: integer
        itemId:
          type: integer
        quantity:
          type: integer
        slotIndex:
          type: integer
        item:
          $ref: "#/components/schemas/Item"
      required:
        - id
        - itemId
        - quantity
        - slotIndex
        - item

    InventorySlotSync:
      type: object
      properties:
        itemId:
          type: integer
        quantity:
          type: integer
        slotIndex:
          type: integer
      required:
        - quantity
        - slotIndex

    Ingredient:
      type: object
      properties:
        itemId:
          type: integer
        quantity:
          type: integer
        slotIndex:
          type: integer
          nullable: true

    Recipe:
      type: object
      properties:
        id:
          type: integer
        itemId:
          type: integer
          description: ID of the result item
        quantity:
          type: integer
          description: Amount of result item produced
        type:
          type: string
          description: e.g. 'minecraft:crafting_shaped'
        duration:
          type: integer
        ingredients:
          type: array
          items:
            $ref: "#/components/schemas/Ingredient"
      required:
        - id
        - itemId
        - quantity
        - type
        - ingredients

  responses:
    SuccessResponse:
      description: Action completed successfully
      content:
        application/json:
          schema:
            type: object
            properties:
              success:
                type: boolean
                example: true
              message:
                type: string
                example: Action successful
    BadRequestError:
      description: Bad Request / Validation error / Constraints not met
      content:
        application/json:
          schema:
            type: object
            properties:
              error:
                type: string
                example: "Validation or logic error description"
    NotFoundError:
      description: Resource not found
      content:
        application/json:
          schema:
            type: object
            properties:
              error:
                type: string
                example: "Resource not found"
    InternalServerError:
      description: Internal Server Error
      content:
        application/json:
          schema:
            type: object
            properties:
              error:
                type: string
                example: Internal Server Error
`;
