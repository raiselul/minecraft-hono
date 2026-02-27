import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { inventoryRoutes, craftRoutes, itemsRoutes, recipesRoutes } from './controllers.js'

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
app.route('/api/recipes', recipesRoutes)

import { swaggerUI } from '@hono/swagger-ui'
import { openapiSpec } from './openapi.js'

app.get('/openapi.yaml', (c) => {
  c.header('Content-Type', 'text/yaml')
  return c.text(openapiSpec)
})
app.get('/docs', swaggerUI({ url: '/openapi.yaml' }))

export default app
