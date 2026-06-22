import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return <section className="mx-auto max-w-2xl px-4 py-24 text-center"><p className="font-mono text-sm text-teal-300">404</p><h1 className="mt-3 text-4xl font-semibold text-white">This route drifted downstream.</h1><p className="mt-4 text-muted-foreground">Return to the AidLens operations surface.</p><Button asChild className="mt-7"><Link to="/">Back home</Link></Button></section>
}
