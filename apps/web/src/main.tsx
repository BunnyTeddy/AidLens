import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { BrowserRouter } from 'react-router-dom'
import { WagmiProvider } from 'wagmi'
import { TooltipProvider } from '@/components/ui/tooltip'
import { wagmiConfig } from '@/lib/config'
import { App } from './App'
import '@rainbow-me/rainbowkit/styles.css'
import './index.css'

document.documentElement.classList.add('dark')
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider initialChain={wagmiConfig.chains[0]}>
          <TooltipProvider>
            <BrowserRouter><App /></BrowserRouter>
          </TooltipProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
