import { resolve } from 'node:path'
import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config({
  path: process.env.DOTENV_CONFIG_PATH ?? resolve(process.cwd(), '../../.env'),
  quiet: true,
})

const privateKeySchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/)
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(
  (value) => value === '' ? undefined : value,
  schema.optional(),
)

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default('0.0.0.0'),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  DEMO_MODE: z.string().default('true').transform((value) => value === 'true'),
  ZERO_G_COMPUTE_API_KEY: optional(z.string().min(1)),
  ZERO_G_COMPUTE_BASE_URL: z.string().url().default('https://router-api.0g.ai/v1'),
  ZERO_G_VISION_MODEL: z.string().default('qwen3-vl-30b'),
  ZERO_G_AUDIO_MODEL: z.string().default('whisper-large-v3'),
  ZERO_G_RPC_URL: z.string().url().default('https://evmrpc-testnet.0g.ai'),
  ZERO_G_MAINNET_RPC_URL: z.string().url().default('https://evmrpc.0g.ai'),
  ZERO_G_STORAGE_INDEXER: z
    .string()
    .url()
    .default('https://indexer-storage-testnet-turbo.0g.ai'),
  ZERO_G_SERVICE_PRIVATE_KEY: optional(privateKeySchema),
  NGO_ENCRYPTION_PRIVATE_KEY: optional(z.string().min(1)),
  RELIEF_FUND_ADDRESS: optional(z.string().regex(/^0x[0-9a-fA-F]{40}$/)),
  DEMO_REVIEWER_ADDRESS: optional(z.string().regex(/^0x[0-9a-fA-F]{40}$/)),
  VERIFIED_REPLAY_MANIFEST: optional(z.string().min(1)),
})

export type AppConfig = z.infer<typeof envSchema>

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse(source)
}

export function isLiveConfigured(config: AppConfig): boolean {
  return Boolean(
    config.ZERO_G_COMPUTE_API_KEY &&
      config.ZERO_G_SERVICE_PRIVATE_KEY &&
      config.RELIEF_FUND_ADDRESS,
  )
}
