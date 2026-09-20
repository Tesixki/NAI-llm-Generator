import type { AppConfig } from './types'

export const NAI_MODELS = [
  'nai-diffusion-5-full',
  'nai-diffusion-5-curated',
  'nai-diffusion-4-5-full',
  'nai-diffusion-4-5-curated',
  'nai-diffusion-4-full',
  'nai-diffusion-4-curated',
  'nai-diffusion-3',
  'nai-diffusion-3-furry'
] as const
export const NAI_SIZE_PRESETS: Record<string, [number, number]> = {
  portrait: [832, 1216],
  landscape: [1216, 832],
  square: [1024, 1024],
  large_portrait: [1024, 1536],
  large_landscape: [1536, 1024],
  wallpaper_portrait: [1088, 1920],
  wallpaper_landscape: [1920, 1088]
}
export const NAI_SAMPLERS = ['k_euler', 'k_euler_ancestral', 'k_dpm_2', 'k_dpm_2_ancestral', 'k_dpmpp_2m', 'k_dpmpp_2s_ancestral', 'k_dpmpp_sde', 'ddim'] as const
export const NAI_NOISE_SCHEDULES = ['karras', 'exponential', 'polyexponential', 'native'] as const
export const NAI_UC_PRESETS = ['strong', 'light', 'human_focus', 'furry_focus', 'none'] as const

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
  generationDefaults: {
    model: 'nai-diffusion-4-5-full',
    size: 'portrait',
    steps: 23,
    scale: 5.0,
    sampler: 'k_euler_ancestral',
    noise_schedule: 'karras',
    uc_preset: 'light',
    quality: true,
    n_samples: 1,
    cfg_rescale: 0,
    variety_boost: false,
    negative_prompt: ''
  },
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
