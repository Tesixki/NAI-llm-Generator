import type { AppConfig } from './types'

export const DEFAULT_CONFIG: AppConfig = {
  provider: 'anthropic',
  anthropic: {
    apiKey: '',
    model: 'claude-sonnet-5',
    baseUrl: '',
    maxTokens: 8192
  },
  openai: {
    apiKey: '',
    model: 'gpt-4.1',
    baseUrl: 'https://api.openai.com/v1'
  },
  claudeCli: { command: 'claude', extraArgs: '', model: '' },
  devinCli: { command: 'devin', extraArgs: '', model: '' },
  novelai: { apiKey: '', imageBase: 'https://image.novelai.net', timeoutSec: 180 },
  danbooru: { login: '', apiKey: '' },
  outputDir: '',
  skillsDir: '',
  formatsDir: '',
  mcpServers: {
    danbooru: { type: 'builtin', enabled: true },
    'danbooru-tags-smithery': {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@smithery/cli@latest', 'run', '@gamzadongza/danbooru-tags-mcp'],
      enabled: false
    },
    novelai: {
      type: 'stdio',
      command: 'uv',
      args: ['run', '--from', 'git+https://github.com/syou6162/novelai-mcp', 'novelai-mcp'],
      env: { NOVELAI_API_KEY: '${NOVELAI_API_KEY}', NOVELAI_OUTPUT_DIR: '${OUTPUT_DIR}' },
      enabled: false
    }
  },
  maxIterations: 30,
  autoGenerate: true,
  selectedSkills: [],
  selectedFormat: '',
  language: 'ja'
}
