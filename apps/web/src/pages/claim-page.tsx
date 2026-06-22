import { useState } from 'react'
import { useAccount, useSignMessage, useWriteContract } from 'wagmi'
import { Camera, Check, ChevronLeft, ChevronRight, LocateFixed, LockKeyhole, UploadCloud } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { createPublicClient, http, parseEventLogs } from 'viem'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { VoiceRecorder } from '@/components/voice-recorder'
import { uploadEvidence } from '@/lib/api'
import { saveStoredClaim, type StoredClaim } from '@/lib/claim-session'
import { aidLensAbi } from '@/lib/contract'
import { clientEncryptionConfigured, contractConfigured, galileo, ngoEncryptionPublicKey, reliefFundAddress } from '@/lib/config'
import { encryptEvidenceEnvelope } from '@/lib/encryption'
import { canonicalJson, evidenceAuthorizationMessage, resizeImage, sha256Blob, type IntakePayload, type ManifestEntry } from '@/lib/evidence'

const districts = [
  { code: 4901, name: 'Lệ Thủy, Quảng Bình' },
  { code: 4602, name: 'Phong Điền, Huế' },
  { code: 5103, name: 'Đại Lộc, Quảng Nam' },
] as const

export function ClaimPage() {
  const navigate = useNavigate()
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const { writeContractAsync } = useWriteContract()
  const [step, setStep] = useState(1)
  const [districtCode, setDistrictCode] = useState('4901')
  const [householdSize, setHouseholdSize] = useState('4')
  const [displaced, setDisplaced] = useState('yes')
  const [narration, setNarration] = useState('Flood water entered the ground floor and damaged essential household items.')
  const [images, setImages] = useState<File[]>([])
  const [audio, setAudio] = useState<File | null>(null)
  const [audioDuration, setAudioDuration] = useState(0)
  const [location, setLocation] = useState<IntakePayload['approximateLocation']>()
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()

  const selectedDistrict = districts.find((district) => district.code === Number(districtCode)) ?? districts[0]

  function captureApproximateLocation() {
    navigator.geolocation?.getCurrentPosition(
      (position) => setLocation({
        latitude: Number(position.coords.latitude.toFixed(3)),
        longitude: Number(position.coords.longitude.toFixed(3)),
        accuracyMeters: Math.round(position.coords.accuracy),
      }),
      () => setError('Location permission was not granted. District-level context is still enough.'),
      { enableHighAccuracy: false, timeout: 8_000 },
    )
  }

  async function submitClaim() {
    if (!address || !isConnected) {
      setError('Connect a wallet before signing the evidence manifest.')
      return
    }
    if (images.length < 1 || images.length > 3 || !consent) {
      setError('Add one to three images and confirm consent.')
      return
    }
    setSubmitting(true)
    setError(undefined)
    try {
      const resizedImages = await Promise.all(images.map(resizeImage))
      const uploadFiles: Array<{ field: 'image' | 'audio'; file: File }> = [
        ...resizedImages.map((file) => ({ field: 'image' as const, file })),
        ...(audio ? [{ field: 'audio' as const, file: audio }] : []),
      ]
      const intake: IntakePayload = {
        districtCode: selectedDistrict.code,
        districtName: selectedDistrict.name,
        householdSize: Number(householdSize),
        displaced: displaced === 'yes',
        narration,
        ...(location ? { approximateLocation: location } : {}),
        ...(audio ? { audioDurationSeconds: audioDuration } : {}),
        capturedAt: new Date().toISOString(),
        consentVersion: '2026-06-22',
        syntheticDemo: true,
      }
      const encryptedEnvelope = ngoEncryptionPublicKey
        ? await encryptEvidenceEnvelope(intake, uploadFiles, ngoEncryptionPublicKey)
        : undefined
      const manifest: ManifestEntry[] = encryptedEnvelope ? [] : await Promise.all(uploadFiles.map(async ({ field, file }) => ({
        field,
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        sha256: await sha256Blob(file),
      })))
      manifest.sort((left, right) => `${left.field}:${left.filename}`.localeCompare(`${right.field}:${right.filename}`))
      const signedPayload = encryptedEnvelope ?? { intake, files: manifest }
      const manifestHash = await sha256Blob(new Blob([canonicalJson(signedPayload)]))
      const authorization = {
        walletAddress: address,
        nonce: crypto.randomUUID().replaceAll('-', ''),
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        manifestHash,
      }
      const signature = await signMessageAsync({ account: address, message: evidenceAuthorizationMessage(authorization) })
      const form = new FormData()
      form.set('authorization', JSON.stringify(authorization))
      form.set('signature', signature)
      if (encryptedEnvelope) {
        form.set('envelope', JSON.stringify(encryptedEnvelope))
      } else {
        form.set('intake', JSON.stringify(intake))
        uploadFiles.forEach(({ field, file }) => form.append(field, file))
      }
      const upload = await uploadEvidence(form)
      const storedClaim: StoredClaim = { intake, upload, createdAt: new Date().toISOString() }
      let routeId = 'demo-2047'

      if (contractConfigured && reliefFundAddress && upload.storageMode === 'live') {
        const transactionHash = await writeContractAsync({
          account: address,
          chain: galileo,
          address: reliefFundAddress,
          abi: aidLensAbi,
          functionName: 'submitClaim',
          args: [upload.evidenceRoot, upload.publicRoot, selectedDistrict.code],
        })
        const publicClient = createPublicClient({
          chain: galileo,
          transport: http(galileo.rpcUrls.default.http[0]),
        })
        const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash })
        const submitted = parseEventLogs({
          abi: aidLensAbi,
          eventName: 'ClaimSubmitted',
          logs: receipt.logs,
        }).find((log) => log.args.evidenceRoot.toLowerCase() === upload.evidenceRoot.toLowerCase())
        if (!submitted) throw new Error('ClaimSubmitted event was not found in the transaction receipt.')
        const claimId = Number(submitted.args.claimId)
        storedClaim.claimId = claimId
        storedClaim.submitTx = transactionHash
        routeId = String(claimId)
      }
      saveStoredClaim(routeId, storedClaim)
      navigate(`/claim/${routeId}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Claim submission failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-300">Household intake</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Submit a synthetic flood claim</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Only district-level metadata becomes public. Images, audio, narration, and precise location remain private.</p>
      </div>

      <Progress value={(step / 3) * 100} className="mb-8 h-1.5" />
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>Unable to continue</AlertTitle><AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="border-white/8 bg-card/70">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div><CardTitle>{step === 1 ? 'Household context' : step === 2 ? 'Private evidence' : 'Review and consent'}</CardTitle><CardDescription>Step {step} of 3</CardDescription></div>
            <span className="font-mono text-xs text-muted-foreground">SYNTHETIC DEMO</span>
          </div>
        </CardHeader>
        <CardContent>
          {step === 1 && (
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="district">Affected district</Label><Select value={districtCode} onValueChange={setDistrictCode}><SelectTrigger id="district"><SelectValue /></SelectTrigger><SelectContent>{districts.map((district) => <SelectItem key={district.code} value={String(district.code)}>{district.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label htmlFor="household">Household members</Label><Input id="household" type="number" min="1" max="20" value={householdSize} onChange={(event) => setHouseholdSize(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="displaced">Currently displaced?</Label><Select value={displaced} onValueChange={setDisplaced}><SelectTrigger id="displaced"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="yes">Yes</SelectItem><SelectItem value="no">No</SelectItem></SelectContent></Select></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="narration">What happened?</Label><Textarea id="narration" rows={5} value={narration} onChange={(event) => setNarration(event.target.value)} maxLength={2000} /></div>
              <div className="sm:col-span-2"><Button type="button" variant="outline" onClick={captureApproximateLocation}><LocateFixed className="size-4" /> {location ? `Approximate location added · ±${location.accuracyMeters}m` : 'Add approximate location'}</Button></div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div><Label htmlFor="evidence-images">Flood images</Label><label htmlFor="evidence-images" className="mt-2 flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[0.025] p-6 text-center hover:border-teal-400/40"><Camera className="mb-3 size-7 text-teal-300" /><span className="text-sm font-medium text-white">Choose one to three images</span><span className="mt-1 text-xs text-muted-foreground">JPEG, PNG or WebP · resized locally before upload</span></label><Input id="evidence-images" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setImages(Array.from(event.target.files ?? []).slice(0, 3))} /><div className="mt-3 flex flex-wrap gap-2">{images.map((image) => <span key={`${image.name}-${image.lastModified}`} className="rounded-md bg-white/5 px-2.5 py-1.5 text-xs text-slate-300">{image.name}</span>)}</div></div>
              <VoiceRecorder onChange={(file, duration) => { setAudio(file); setAudioDuration(duration) }} />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">{[[selectedDistrict.name, 'District'], [`${householdSize} people`, 'Household'], [`${images.length} image${images.length === 1 ? '' : 's'}`, 'Evidence']].map(([value, label]) => <div key={label} className="rounded-xl border border-white/8 bg-white/[0.025] p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-sm font-medium text-white">{value}</p></div>)}</div>
              <Alert className="border-teal-400/20 bg-teal-400/[0.05]"><LockKeyhole className="size-4 text-teal-300" /><AlertTitle>{clientEncryptionConfigured ? 'Client encryption ready' : 'Snapshot encryption mode'}</AlertTitle><AlertDescription>{clientEncryptionConfigured ? 'Your browser encrypts intake and evidence with AES-GCM, then seals the content key for the NGO worker. The worker decrypts only in memory for assessment.' : 'The API receives evidence over TLS and encrypts it with ECIES before 0G Storage upload. Configure the NGO public key to enable browser-side encryption.'} 0G TEE verifies model execution, not the entire application backend.</AlertDescription></Alert>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/8 p-4"><input type="checkbox" className="mt-1 accent-teal-400" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span className="text-sm leading-6 text-slate-300">I confirm this is synthetic demo data and consent to storing its encrypted evidence bundle on 0G Storage.</span></label>
              {!isConnected && <p className="text-sm text-amber-300">Connect a wallet in the header to sign the evidence manifest.</p>}
            </div>
          )}

          <div className="mt-8 flex items-center justify-between border-t border-white/8 pt-6">
            <Button type="button" variant="ghost" disabled={step === 1 || submitting} onClick={() => setStep((current) => current - 1)}><ChevronLeft className="size-4" /> Back</Button>
            {step < 3 ? <Button type="button" onClick={() => setStep((current) => current + 1)}>Continue <ChevronRight className="size-4" /></Button> : <Button type="button" className="bg-teal-400 text-[#061218] hover:bg-teal-300" disabled={submitting || !consent || !isConnected} onClick={() => void submitClaim()}>{submitting ? <><UploadCloud className="size-4 animate-pulse" /> Uploading</> : <><Check className="size-4" /> Sign and submit</>}</Button>}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
