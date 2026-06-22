import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { demoClaims } from '@/data/demo'

export function ReliefMap() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [107.25, 16.5],
      zoom: 6.4,
      attributionControl: false,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

    const markers = demoClaims.map((claim) => {
      const marker = document.createElement('button')
      marker.type = 'button'
      marker.className = 'aidlens-marker'
      marker.title = `${claim.district}: ${claim.status}`
      marker.setAttribute('aria-label', marker.title)
      return new maplibregl.Marker({ element: marker })
        .setLngLat(claim.location)
        .setPopup(new maplibregl.Popup({ offset: 16 }).setText(`${claim.district} · ${claim.status}`))
        .addTo(map)
    })

    return () => {
      markers.forEach((marker) => marker.remove())
      map.remove()
    }
  }, [])

  return <div ref={containerRef} className="h-[360px] w-full overflow-hidden rounded-xl" aria-label="Approximate district-level relief map" />
}
