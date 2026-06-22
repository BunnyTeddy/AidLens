export interface DemoClaim {
  id: string
  district: string
  districtCode: number
  household: number
  displaced: boolean
  urgency: 'Moderate' | 'High' | 'Critical'
  severity: number
  status: 'Submitted' | 'Assessed' | 'Needs info' | 'Paid'
  recommendedOg: number
  submitted: string
  location: [number, number]
}

export const demoClaims: DemoClaim[] = [
  {
    id: 'demo-2047',
    district: 'Lệ Thủy, Quảng Bình',
    districtCode: 4901,
    household: 4,
    displaced: true,
    urgency: 'High',
    severity: 4,
    status: 'Assessed',
    recommendedOg: 8,
    submitted: '22 Jun · 09:42 ICT',
    location: [106.704, 17.223],
  },
  {
    id: 'demo-2046',
    district: 'Phong Điền, Huế',
    districtCode: 4602,
    household: 6,
    displaced: true,
    urgency: 'Critical',
    severity: 5,
    status: 'Needs info',
    recommendedOg: 12,
    submitted: '22 Jun · 08:15 ICT',
    location: [107.364, 16.589],
  },
  {
    id: 'demo-2045',
    district: 'Đại Lộc, Quảng Nam',
    districtCode: 5103,
    household: 3,
    displaced: false,
    urgency: 'Moderate',
    severity: 3,
    status: 'Paid',
    recommendedOg: 5,
    submitted: '21 Jun · 22:04 ICT',
    location: [108.052, 15.888],
  },
]

export const syntheticMetrics = {
  donated: 62,
  allocated: 25,
  households: 3,
  medianReview: '4m 12s',
}
