export interface Society {
  id: string
  name: string
  location: string | null
  city: string | null
}

export type RoleKey =
  | 'super_admin'
  | 'committee_member'
  | 'collector'
  | 'resident'

export interface SocietyMembership {
  society: Society
  roles: RoleKey[]
  permissions: string[]
}

export interface MeResponse {
  user: {
    id: string
    display_name: string
    mobile: string
  }
  memberships: SocietyMembership[]
  platform_admin: boolean
}
