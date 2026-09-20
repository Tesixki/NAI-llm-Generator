/**
 * Standalone stdio entry for the built-in Danbooru MCP server.
 * Launched by the CLI providers via:  ELECTRON_RUN_AS_NODE=1 <electron> out/main/danbooru-mcp-stdio.js
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createDanbooruServer } from './mcp/danbooru-server'

async function main(): Promise<void> {
  const server = createDanbooruServer({
    login: process.env.DANBOORU_LOGIN,
    apiKey: process.env.DANBOORU_API_KEY
  })
  await server.connect(new StdioServerTransport())
}

main().catch((e) => {
  console.error('[danbooru-mcp] fatal:', e)
  process.exit(1)
})
