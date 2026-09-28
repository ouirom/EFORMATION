import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'

export interface LegalInfo {
  legalNotice: string
  privacyPolicyUrl: string
  privacyContactEmail: string
}

/** The organization's legal information (Administration > Organisation > Conformité), public. */
export function useLegalInfo() {
  return useQuery<LegalInfo>({
    queryKey: ['legal-info'],
    queryFn: async () => (await api.get('/auth/legal')).data.data,
    staleTime: 5 * 60 * 1000,
  })
}
