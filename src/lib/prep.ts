import type { PrepFilters } from '@/types'

export function defaultPrepFilters(): PrepFilters {
  return {
    query: '',
    bucketId: '',
    club: '',
    role: '',
    tier: '',
    tag: '',
    onlyAvailable: false,
    sort: {
      key: 'avg_price',
      dir: 'desc',
    },
  }
}