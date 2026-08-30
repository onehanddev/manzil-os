import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SocietyState {
  /** The society the user is currently operating in. */
  currentSocietyId: string | null
  setCurrentSociety: (id: string | null) => void
}

export const useSocietyStore = create<SocietyState>()(
  persist(
    (set) => ({
      currentSocietyId: null,
      setCurrentSociety: (currentSocietyId) => set({ currentSocietyId }),
    }),
    { name: 'manzil-society' },
  ),
)
