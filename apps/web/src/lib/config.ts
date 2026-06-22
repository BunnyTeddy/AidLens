import { defineChain } from 'viem'
import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'

export const galileo = defineChain({
  id: Number(import.meta.env.VITE_0G_CHAIN_ID ?? 16602),
  name: '0G Galileo Testnet',
  nativeCurrency: { name: '0G', symbol: '0G', decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_0G_RPC_URL ?? 'https://evmrpc-testnet.0g.ai'] },
  },
  blockExplorers: {
    default: { name: '0G ChainScan', url: 'https://chainscan-galileo.0g.ai' },
  },
  testnet: true,
})

export const wagmiConfig = createConfig({
  chains: [galileo],
  connectors: [injected()],
  transports: { [galileo.id]: http(galileo.rpcUrls.default.http[0]) },
})

export const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'
export const reliefFundAddress = import.meta.env.VITE_RELIEF_FUND_ADDRESS as
  | `0x${string}`
  | undefined
export const contractConfigured = Boolean(reliefFundAddress)
export const ngoEncryptionPublicKey = import.meta.env.VITE_NGO_ENCRYPTION_PUBLIC_KEY as string | undefined
export const clientEncryptionConfigured = Boolean(ngoEncryptionPublicKey)
export const chainScanUrl = galileo.blockExplorers.default.url
export const storageScanUrl = 'https://storagescan-galileo.0g.ai'
