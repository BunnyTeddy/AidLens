import { createPublicClient, http, keccak256, stringToBytes } from 'viem'
import { verifyAssessmentAuthorization } from './auth.js'
import type { AssessmentRequest } from './schemas.js'

const abi = [
  {
    type: 'function',
    name: 'hasRole',
    stateMutability: 'view',
    inputs: [
      { name: 'role', type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'getClaim',
    stateMutability: 'view',
    inputs: [{ name: 'claimId', type: 'uint256' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'claimant', type: 'address' },
          { name: 'evidenceRoot', type: 'bytes32' },
          { name: 'publicRoot', type: 'bytes32' },
          { name: 'assessmentRoot', type: 'bytes32' },
          { name: 'receiptHash', type: 'bytes32' },
          { name: 'recommendedAmount', type: 'uint96' },
          { name: 'paidAmount', type: 'uint96' },
          { name: 'submittedAt', type: 'uint64' },
          { name: 'updatedAt', type: 'uint64' },
          { name: 'districtCode', type: 'uint16' },
          { name: 'severity', type: 'uint8' },
          { name: 'status', type: 'uint8' },
        ],
      },
    ],
  },
] as const

export interface AssessmentAuthorizer {
  authorize(request: AssessmentRequest): Promise<boolean>
}

export class LiveAssessmentAuthorizer implements AssessmentAuthorizer {
  private readonly client
  private readonly assessorRole = keccak256(stringToBytes('ASSESSOR_ROLE'))

  constructor(
    rpcUrl: string,
    private readonly contractAddress: `0x${string}`,
  ) {
    this.client = createPublicClient({ transport: http(rpcUrl) })
  }

  async authorize(request: AssessmentRequest): Promise<boolean> {
    if (!(await verifyAssessmentAuthorization(request))) return false
    const [hasRole, claim] = await Promise.all([
      this.client.readContract({
        address: this.contractAddress,
        abi,
        functionName: 'hasRole',
        args: [this.assessorRole, request.reviewerAddress as `0x${string}`],
      }),
      this.client.readContract({
        address: this.contractAddress,
        abi,
        functionName: 'getClaim',
        args: [BigInt(request.claimId)],
      }),
    ])
    return Boolean(hasRole && claim.evidenceRoot.toLowerCase() === request.evidenceRoot.toLowerCase())
  }
}

export class PreviewAssessmentAuthorizer implements AssessmentAuthorizer {
  constructor(private readonly reviewerAddress?: string) {}

  async authorize(request: AssessmentRequest): Promise<boolean> {
    if (this.reviewerAddress && request.reviewerAddress.toLowerCase() !== this.reviewerAddress.toLowerCase()) {
      return false
    }
    return verifyAssessmentAuthorization(request)
  }
}
