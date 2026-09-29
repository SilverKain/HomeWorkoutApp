import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { PlannedWorkoutEntry } from '../types/workout.ts'

const state = vi.hoisted(() => ({ uid: 'google-account' }))
const firestore = vi.hoisted(() => ({
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  onSnapshot: vi.fn(),
}))
vi.mock('./firebase.ts', () => ({
  isFirebaseConfigured: () => true,
  getFirebaseConfigError: () => null,
  getFirebaseDb: () => ({}),
  getCurrentFirebaseUserId: () => state.uid,
  initializeFirebaseAuthSession: async () => ({ uid: state.uid }),
}))
vi.mock('firebase/firestore', () => ({
  ...firestore,
  doc: (_db: unknown, ...segments: string[]) => segments.join('/'),
}))
import {
  bootstrapFirebaseTrainingCache,
  subscribeToFirebaseTrainingState,
  syncPlannedWorkoutsToFirebase,
  FIREBASE_SYNC_ERROR_EVENT,
} from './firebaseTrainingSync.ts'

const plan: PlannedWorkoutEntry = {
  id: 'manual', date: '2026-09-29', title: 'Workout', source: 'manual',
  weekKey: undefined,
  entries: [{ exerciseId: 'push-ups-classic', sets: 3, reps: 12, rir: 2, completed: false, progressionHint: undefined }],
}

beforeEach(() => {
  vi.clearAllMocks()
  state.uid = 'google-account'
  const values = new Map<string, string>()
  vi.stubGlobal('window', Object.assign(new EventTarget(), {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  }))
  firestore.getDoc.mockResolvedValue({ exists: () => false })
  firestore.setDoc.mockResolvedValue(undefined)
  firestore.onSnapshot.mockImplementation(() => vi.fn())
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Firebase training sync', () => {
  it('uploads manual edits without undefined fields rejected by Firestore', async () => {
    syncPlannedWorkoutsToFirebase([plan])
    await vi.waitFor(() => expect(firestore.setDoc).toHaveBeenCalledOnce())
    const [path, data] = firestore.setDoc.mock.calls[0]
    expect(path).toBe('users/google-account/app_state/planned_workouts')
    expect(data.payload).toEqual(JSON.parse(JSON.stringify([plan])))
    expect(data.payload[0]).not.toHaveProperty('weekKey')
    expect(data.payload[0].entries[0]).not.toHaveProperty('progressionHint')
  })

  it('applies remote exercise edits and deletions to the local cache', async () => {
    await subscribeToFirebaseTrainingState(state.uid)
    const receive = firestore.onSnapshot.mock.calls[1][1]
    receive({ data: () => ({ payload: [plan] }) })
    expect(JSON.parse(window.localStorage.getItem('home-workout-plans')!)[0].entries[0].reps).toBe(12)
    receive({ data: () => ({ payload: [] }) })
    expect(window.localStorage.getItem('home-workout-plans')).toBe('[]')
  })

  it('ignores callbacks and setup from a previous account', async () => {
    await subscribeToFirebaseTrainingState(state.uid)
    const receive = firestore.onSnapshot.mock.calls[1][1]
    state.uid = 'another-account'
    receive({ data: () => ({ payload: [plan] }) })
    expect(window.localStorage.getItem('home-workout-plans')).toBeNull()
    firestore.onSnapshot.mockClear()
    await subscribeToFirebaseTrainingState('google-account')
    expect(firestore.onSnapshot).not.toHaveBeenCalled()
  })

  it('continues account initialization when legacy shared data is forbidden', async () => {
    firestore.getDoc.mockImplementation(async (path: string) => {
      if (path.startsWith('app_state/')) throw { code: 'permission-denied' }
      return { exists: () => false }
    })
    window.localStorage.setItem('home-workout-plans', JSON.stringify([plan]))
    expect((await bootstrapFirebaseTrainingCache(state.uid)).synced).toBe(true)
    expect(firestore.setDoc).toHaveBeenCalledWith(
      'users/google-account/app_state/planned_workouts',
      expect.objectContaining({ payload: JSON.parse(JSON.stringify([plan])) }),
    )
  })

  it('does not apply a bootstrap response after the account changes', async () => {
    firestore.getDoc.mockImplementation(async () => {
      state.uid = 'another-account'
      return { exists: () => true, data: () => ({ payload: [] }) }
    })
    expect((await bootstrapFirebaseTrainingCache('google-account')).synced).toBe(false)
    expect(window.localStorage.getItem('home-workout-plans')).toBeNull()
  })

  it('reports write and subscription failures to the interface', async () => {
    const onError = vi.fn()
    window.addEventListener(FIREBASE_SYNC_ERROR_EVENT, onError)
    firestore.setDoc.mockRejectedValue(new Error('Permission denied'))
    syncPlannedWorkoutsToFirebase([plan])
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce())
    await subscribeToFirebaseTrainingState(state.uid)
    firestore.onSnapshot.mock.calls[1][2](new Error('Offline'))
    expect(onError).toHaveBeenCalledTimes(2)
  })
})
