import { http, HttpResponse } from 'msw'
import type { MeResponse, Society } from '@/lib/api/types'

const societies: Society[] = [
  { id: 'soc-lotus-divine', name: 'Lotus Divine', location: 'Wadala', city: 'Mumbai' },
  { id: 'soc-rose-valley', name: 'Rose Valley', location: 'Andheri West', city: 'Mumbai' },
]

export const handlers = [
  http.get('*/api/me', () =>
    HttpResponse.json<MeResponse>({
      user: { id: 'user-dev', display_name: 'Dev User', mobile: '+91 99999 99999' },
      memberships: [
        {
          society: societies[0],
          roles: ['super_admin', 'resident'],
          permissions: ['*'],
        },
        {
          society: societies[1],
          roles: ['committee_member'],
          permissions: ['receipt:create', 'expense:create', 'report:view'],
        },
      ],
      platform_admin: true,
    }),
  ),
  http.get('*/api/societies', () => HttpResponse.json<Society[]>(societies)),
]
