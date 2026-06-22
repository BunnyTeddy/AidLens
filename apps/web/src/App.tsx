import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/app-shell'

const HomePage = lazy(() => import('@/pages/home-page').then((module) => ({ default: module.HomePage })))
const ClaimPage = lazy(() => import('@/pages/claim-page').then((module) => ({ default: module.ClaimPage })))
const ClaimDetailPage = lazy(() => import('@/pages/claim-detail-page').then((module) => ({ default: module.ClaimDetailPage })))
const NgoPage = lazy(() => import('@/pages/ngo-page').then((module) => ({ default: module.NgoPage })))
const TransparencyPage = lazy(() => import('@/pages/transparency-page').then((module) => ({ default: module.TransparencyPage })))
const NotFoundPage = lazy(() => import('@/pages/not-found-page').then((module) => ({ default: module.NotFoundPage })))

export function App() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">Loading AidLens…</div>}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="claim" element={<ClaimPage />} />
          <Route path="claim/:id" element={<ClaimDetailPage />} />
          <Route path="ngo" element={<NgoPage />} />
          <Route path="transparency" element={<TransparencyPage />} />
          <Route path="dashboard" element={<Navigate to="/ngo" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
