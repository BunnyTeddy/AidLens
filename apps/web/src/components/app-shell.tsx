import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Menu, Radar } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { NetworkStrip } from './network-strip'

const links = [
  { to: '/claim', label: 'Submit claim' },
  { to: '/ngo', label: 'NGO console' },
  { to: '/transparency', label: 'Transparency' },
] as const

function NavigationLinks({ mobile = false }: { mobile?: boolean }) {
  return links.map((link) => (
    <NavLink
      key={link.to}
      to={link.to}
      className={({ isActive }) => cn(
        'text-sm transition-colors hover:text-white',
        mobile && 'rounded-lg px-3 py-3',
        isActive ? 'text-teal-300' : 'text-slate-400',
      )}
    >
      {link.label}
    </NavLink>
  ))
}

export function AppShell() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-background/88 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5 font-semibold tracking-tight text-white">
            <span className="grid size-8 place-items-center rounded-lg bg-teal-400 text-[#061218]">
              <Radar className="size-4" aria-hidden="true" />
            </span>
            AidLens
          </Link>
          <nav className="hidden items-center gap-6 md:flex" aria-label="Primary navigation">
            <NavigationLinks />
          </nav>
          <div className="ms-auto hidden md:block">
            <ConnectButton chainStatus="icon" showBalance={false} accountStatus="address" />
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="ms-auto md:hidden" aria-label="Open navigation">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent className="border-white/10 bg-background">
              <SheetHeader>
                <SheetTitle>AidLens</SheetTitle>
                <SheetDescription>Private evidence. Verifiable assessment. Human decision.</SheetDescription>
              </SheetHeader>
              <nav className="mt-6 flex flex-col" aria-label="Mobile navigation">
                <NavigationLinks mobile />
              </nav>
              <div className="mt-6"><ConnectButton /></div>
            </SheetContent>
          </Sheet>
        </div>
        <NetworkStrip />
      </header>
      <main><Outlet /></main>
      <footer className="border-t border-white/8 py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>AidLens is a synthetic hackathon prototype — not a production relief or insurance system.</p>
          <p>Built on 0G Chain · Storage · Compute</p>
        </div>
      </footer>
    </div>
  )
}
