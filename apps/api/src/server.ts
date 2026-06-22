import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { createRuntime } from './runtime.js'

const config = loadConfig()
const runtime = createRuntime(config)
const app = createApp({
  ...runtime,
  webOrigin: config.WEB_ORIGIN,
  chainRpcUrl: config.ZERO_G_RPC_URL,
  reliefFundAddress: config.RELIEF_FUND_ADDRESS,
  logger: config.NODE_ENV !== 'test',
})

try {
  await app.listen({ host: config.HOST, port: config.PORT })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
