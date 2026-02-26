import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { inventoryRoutes, craftRoutes, itemsRoutes } from './controllers.js'

const app = new Hono()

app.use('/*', cors())

const welcomeStrings = [
  "Hello Hono!",
  "To learn more about Hono on Vercel, visit https://vercel.com/docs/frameworks/backend/hono",
]

app.get('/', (c) => {
  return c.text(welcomeStrings.join('\n\n'))
})

app.route('/api/inventory', inventoryRoutes)
app.route('/api/craft', craftRoutes)
app.route('/api/items', itemsRoutes)

export default app
