/**
 * Built-in Danbooru MCP server.
 * Calls danbooru.donmai.us directly from the user's machine (hosted MCP proxies get 403 from Danbooru).
 * Used in-process (InMemoryTransport) for API providers and over stdio for CLI providers.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

export interface DanbooruOptions {
  login?: string
  apiKey?: string
  baseUrl?: string
}

const CATEGORY_NAMES: Record<number, string> = { 0: 'general', 1: 'artist', 3: 'copyright', 4: 'character', 5: 'meta' }
const CATEGORY_IDS: Record<string, number> = { general: 0, artist: 1, copyright: 3, character: 4, meta: 5 }

// Rough clothing / accessory vocabulary used by the clothing_only filter.
const CLOTHING_WORDS =
  /(shirt|skirt|dress|uniform|jacket|coat|hoodie|sweater|cardigan|blazer|vest|pants|shorts|jeans|socks|thighhighs|pantyhose|stockings|legwear|shoes|boots|sneakers|loafers|sandals|heels|gloves|hat|cap|beret|hood|scarf|tie|necktie|bow|ribbon|bowtie|collar|choker|necklace|earrings|bracelet|belt|apron|kimono|yukata|sailor|serafuku|hakama|swimsuit|bikini|leotard|bodysuit|armor|cape|cloak|glasses|sunglasses|goggles|headband|hairband|hair_ornament|hairclip|hair_ribbon|hair_bow|halo|wings|mask|helmet|crown|tiara|veil|garter|corset|bra|panties|underwear|lingerie|nightgown|pajamas|robe|hoodie|jersey|tank_top|camisole|blouse|frills|lace|sleeves|detached|off_shoulder|bare_shoulders|bare_legs|barefoot|zettai_ryouiki|wristband|watch|bag|backpack|umbrella|headphones|headset|earphones|footwear|clothes|clothing|outfit|costume|attire|wear)/

export function createDanbooruServer(opts: DanbooruOptions = {}): McpServer {
  const base = (opts.baseUrl || 'https://danbooru.donmai.us').replace(/\/$/, '')

  async function get<T>(pathname: string, params: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(base + pathname)
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
    if (opts.login && opts.apiKey) {
      url.searchParams.set('login', opts.login)
      url.searchParams.set('api_key', opts.apiKey)
    }
    const res = await fetch(url, { headers: { 'User-Agent': 'NAI-llm-Generator/0.1 (github.com/Tesixki/NAI-llm-Generator)', Accept: 'application/json' } })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Danbooru HTTP ${res.status} ${res.statusText}: ${text.slice(0, 300)}`)
    }
    return (await res.json()) as T
  }

  const server = new McpServer({ name: 'danbooru', version: '0.1.0' })

  server.registerTool(
    'search_tags',
    {
      title: 'Search Danbooru tags',
      description:
        'Search Danbooru tags by (partial) name. Use this to find the exact tag spelling for a character, copyright, artist or general tag. Returns name, category and post count, most popular first.',
      inputSchema: {
        query: z.string().describe('Tag name or fragment. Wildcards (*) allowed, e.g. "arona*" or "*blue_archive*"'),
        category: z.enum(['general', 'artist', 'copyright', 'character', 'meta']).optional().describe('Restrict to a tag category'),
        limit: z.number().int().min(1).max(50).optional().describe('Max results (default 15)')
      }
    },
    async ({ query, category, limit }) => {
      const q = query.trim().replace(/\s+/g, '_')
      const pattern = q.includes('*') ? q : `*${q}*`
      const rows = await get<{ name: string; post_count: number; category: number }[]>('/tags.json', {
        'search[name_matches]': pattern,
        'search[category]': category ? CATEGORY_IDS[category] : undefined,
        'search[order]': 'count',
        'search[hide_empty]': 'true',
        limit: limit ?? 15
      })
      if (!rows.length) return text(`No tags matching "${query}".`)
      return text(rows.map((r) => `${r.name}\t[${CATEGORY_NAMES[r.category] ?? r.category}]\t${r.post_count} posts`).join('\n'))
    }
  )

  server.registerTool(
    'get_wiki_info',
    {
      title: 'Get Danbooru wiki page',
      description: 'Fetch the Danbooru wiki page for a tag (character, copyright, general tag). Confirms the tag exists and explains what it depicts. Also resolves tag aliases.',
      inputSchema: { tag_name: z.string().describe('Exact tag name, e.g. "arona_(blue_archive)"') }
    },
    async ({ tag_name }) => {
      const name = tag_name.trim().replace(/\s+/g, '_').toLowerCase()
      const aliases = await get<{ antecedent_name: string; consequent_name: string; status: string }[]>('/tag_aliases.json', {
        'search[antecedent_name]': name,
        'search[status]': 'active',
        limit: 3
      }).catch(() => [])
      const resolved = aliases[0]?.consequent_name ?? name
      let body = ''
      try {
        const page = await get<{ title: string; body: string; other_names: string[] }>(`/wiki_pages/${encodeURIComponent(resolved)}.json`, {})
        body = `# ${page.title}\n${page.other_names?.length ? `Other names: ${page.other_names.join(', ')}\n` : ''}\n${page.body.slice(0, 2500)}`
      } catch (e) {
        if (!(e instanceof Error && e.message.includes('404'))) throw e
      }
      const tags = await get<{ name: string; post_count: number; category: number }[]>('/tags.json', { 'search[name]': resolved, limit: 1 })
      const tagLine = tags[0] ? `Tag: ${tags[0].name} [${CATEGORY_NAMES[tags[0].category] ?? tags[0].category}] ${tags[0].post_count} posts` : `Tag "${resolved}" does not exist on Danbooru.`
      const aliasLine = aliases[0] ? `Alias: "${name}" → "${resolved}"\n` : ''
      return text(`${aliasLine}${tagLine}\n\n${body || '(no wiki page)'}`)
    }
  )

  server.registerTool(
    'get_character_tags',
    {
      title: 'Analyze frequent tags for a character',
      description:
        'Analyze recent Danbooru posts of a character (or any tag) and return the most frequent co-occurring tags: hair, eyes, outfit, accessories. Use the result to write an accurate character prompt.',
      inputSchema: {
        character_tag: z.string().describe('Character tag, e.g. "arona_(blue_archive)"'),
        num_posts: z.number().int().min(10).max(200).optional().describe('Posts to analyze (default 100)'),
        top_n: z.number().int().min(5).max(150).optional().describe('Top tags to return (default 50)'),
        category: z.enum(['general', 'artist', 'copyright', 'character', 'meta']).optional().describe('Tag category to aggregate (default general)'),
        include_tags: z.array(z.string()).optional().describe('Only analyze posts that also have these tags'),
        exclude_tags: z.array(z.string()).optional().describe('Skip posts that have these tags'),
        clothing_only: z.boolean().optional().describe('Return only clothing / accessory tags'),
        extra_query: z.string().optional().describe('Extra Danbooru search terms appended to the query, e.g. "rating:g" or "order:score"')
      }
    },
    async ({ character_tag, num_posts, top_n, category, include_tags, exclude_tags, clothing_only, extra_query }) => {
      const tag = character_tag.trim().replace(/\s+/g, '_')
      const cat = category ?? 'general'
      const field = `tag_string_${cat}`
      const limit = num_posts ?? 100
      const query = [tag, extra_query ?? ''].filter(Boolean).join(' ')
      const posts = await get<Record<string, string>[]>('/posts.json', {
        tags: query,
        limit,
        only: `id,rating,${field},tag_string_general`
      })
      const inc = (include_tags ?? []).map(norm)
      const exc = (exclude_tags ?? []).map(norm)
      const counts = new Map<string, number>()
      let analyzed = 0
      for (const p of posts) {
        const all = (p.tag_string_general ?? '').split(' ')
        const set = new Set(all)
        if (inc.some((t) => !set.has(t))) continue
        if (exc.some((t) => set.has(t))) continue
        analyzed++
        for (const t of (p[field] ?? '').split(' ')) {
          if (!t || t === tag) continue
          counts.set(t, (counts.get(t) ?? 0) + 1)
        }
      }
      if (!analyzed) return text(`No posts found for "${query}" (after filters).`)
      let rows = [...counts.entries()].sort((a, b) => b[1] - a[1])
      if (clothing_only) rows = rows.filter(([t]) => CLOTHING_WORDS.test(t))
      rows = rows.slice(0, top_n ?? 50)
      const lines = rows.map(([t, c]) => `${t}\t${c}/${analyzed}\t${Math.round((c / analyzed) * 100)}%`)
      return text(`Analyzed ${analyzed} posts for "${query}" (${cat} tags${clothing_only ? ', clothing only' : ''}):\n${lines.join('\n')}`)
    }
  )

  server.registerTool(
    'get_post_tags',
    {
      title: 'Get tags of a Danbooru post',
      description: 'Return all tags (by category), rating and source of a Danbooru post given its ID or URL. Useful when the user references a specific post.',
      inputSchema: { post_id_or_url: z.string().describe('Post ID (e.g. "1234567") or URL (https://danbooru.donmai.us/posts/1234567)') }
    },
    async ({ post_id_or_url }) => {
      const m = post_id_or_url.match(/(\d+)/)
      if (!m) throw new Error('Could not find a post ID')
      const p = await get<Record<string, string>>(`/posts/${m[1]}.json`, {})
      const sec = (label: string, key: string): string => (p[key] ? `${label}: ${p[key].split(' ').join(', ')}` : '')
      return text(
        [
          `Post #${p.id} rating:${p.rating} score:${p.score} ${p.image_width}x${p.image_height}`,
          sec('artist', 'tag_string_artist'),
          sec('copyright', 'tag_string_copyright'),
          sec('character', 'tag_string_character'),
          sec('general', 'tag_string_general'),
          sec('meta', 'tag_string_meta'),
          p.source ? `source: ${p.source}` : ''
        ]
          .filter(Boolean)
          .join('\n')
      )
    }
  )

  server.registerTool(
    'get_post_count',
    {
      title: 'Count posts for a tag query',
      description: 'Number of Danbooru posts matching a tag query. Useful to check how well-known a tag or tag combination is.',
      inputSchema: { tags: z.string().describe('Danbooru search query, e.g. "arona_(blue_archive) smile"') }
    },
    async ({ tags }) => {
      const r = await get<{ counts: { posts: number } }>('/counts/posts.json', { tags })
      return text(`${r.counts.posts} posts match "${tags}"`)
    }
  )

  return server
}

function norm(t: string): string {
  return t.trim().replace(/\s+/g, '_').toLowerCase()
}

function text(s: string): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: s }] }
}
