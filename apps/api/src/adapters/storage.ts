import { Indexer, MemData } from '@0gfoundation/0g-storage-ts-sdk'
import { ethers } from 'ethers'
import { sha256Hex } from '../lib/canonical.js'

export interface StorageUpload {
  rootHash: `0x${string}`
  txHash: `0x${string}`
  encrypted: boolean
}

export interface StorageAdapter {
  readonly mode: 'live' | 'memory'
  uploadPrivate(data: Uint8Array): Promise<StorageUpload>
  uploadPublic(data: Uint8Array): Promise<StorageUpload>
  downloadPrivate(rootHash: `0x${string}`): Promise<Uint8Array>
}

export class MemoryStorageAdapter implements StorageAdapter {
  readonly mode = 'memory' as const
  private readonly objects = new Map<string, Uint8Array>()

  async uploadPrivate(data: Uint8Array): Promise<StorageUpload> {
    return this.upload(data, true)
  }

  async uploadPublic(data: Uint8Array): Promise<StorageUpload> {
    return this.upload(data, false)
  }

  async downloadPrivate(rootHash: `0x${string}`): Promise<Uint8Array> {
    const data = this.objects.get(rootHash)
    if (!data) throw new Error('Evidence root is unavailable in preview storage')
    return data
  }

  private async upload(data: Uint8Array, encrypted: boolean): Promise<StorageUpload> {
    const rootHash = sha256Hex(data)
    this.objects.set(rootHash, data)
    return { rootHash, txHash: sha256Hex(`preview:${rootHash}`), encrypted }
  }
}

export class ZeroGStorageAdapter implements StorageAdapter {
  readonly mode = 'live' as const
  private readonly indexer: Indexer
  private readonly wallet: ethers.Wallet
  private readonly recipientPubKey: string

  constructor(
    indexerUrl: string,
    private readonly rpcUrl: string,
    privateKey: string,
  ) {
    this.indexer = new Indexer(indexerUrl)
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    this.wallet = new ethers.Wallet(privateKey, provider)
    this.recipientPubKey = ethers.SigningKey.computePublicKey(
      this.wallet.signingKey.publicKey,
      true,
    )
  }

  async uploadPrivate(data: Uint8Array): Promise<StorageUpload> {
    return this.upload(data, true)
  }

  async uploadPublic(data: Uint8Array): Promise<StorageUpload> {
    return this.upload(data, false)
  }

  async downloadPrivate(rootHash: `0x${string}`): Promise<Uint8Array> {
    const [blob, error] = await this.indexer.downloadToBlob(rootHash, {
      proof: true,
      decryption: { privateKey: this.wallet.privateKey },
    })
    if (error) throw error
    return new Uint8Array(await blob.arrayBuffer())
  }

  private async upload(data: Uint8Array, encrypted: boolean): Promise<StorageUpload> {
    const file = new MemData(data)
    const uploadOptions = {
      expectedReplica: 1,
      // Private objects must be immediately downloadable by the worker, so wait for
      // finality there. Public metadata roots are only used as receipts and can be
      // indexed asynchronously by StorageScan, which keeps live demos from hanging
      // when a public storage node lags behind the chain.
      finalityRequired: encrypted,
      taskSize: 10,
      ...(encrypted
        ? { encryption: { type: 'ecies' as const, recipientPubKey: this.recipientPubKey } }
        : {}),
    }
    const [result, error] = await this.indexer.upload(file, this.rpcUrl, this.wallet, uploadOptions)
    if (error) throw error
    if ('rootHashes' in result) {
      throw new Error('AidLens evidence unexpectedly exceeded the single-root upload limit')
    }
    return {
      rootHash: result.rootHash as `0x${string}`,
      txHash: result.txHash as `0x${string}`,
      encrypted,
    }
  }
}
