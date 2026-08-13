import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore'
import {
  getCurrentFirebaseUserId,
  getFirebaseConfigError,
  getFirebaseDb,
  initializeFirebaseAuthSession,
  isFirebaseConfigured,
} from './firebase.ts'
import {
  PLANNED_WORKOUTS_STORAGE_KEY,
  loadPlannedWorkouts,
} from './plannedWorkouts.ts'
import {
  WORKOUT_HISTORY_STORAGE_KEY,
  loadWorkoutHistory,
} from './workoutHistory.ts'
import {
  loadMusclePriorityOverrides,
  type MusclePriorityOverrides,
} from './musclePriorities.ts'
import type { PlannedWorkoutEntry, WorkoutHistoryEntry } from '../types/workout.ts'

const SETTINGS_STORAGE_KEY = 'home-workout-app:muscle-priorities'
const USERS_COLLECTION = 'users'
const USER_APP_STATE_COLLECTION = 'app_state'
const LEGACY_APP_STATE_COLLECTION = 'app_state'
const HISTORY_DOC_ID = 'workout_history'
const PLANS_DOC_ID = 'planned_workouts'
const PRIORITIES_DOC_ID = 'muscle_priorities'

export const FIREBASE_SYNC_EVENT = 'home-workout-firebase-sync'

interface FirestorePayload<T> {
  payload: T
  updatedAt: string
}

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readLocalJson<T>(storageKey: string, fallback: T): T {
  if (!canUseLocalStorage()) {
    return fallback
  }

  const rawValue = window.localStorage.getItem(storageKey)

  if (!rawValue) {
    return fallback
  }

  try {
    return JSON.parse(rawValue) as T
  } catch {
    return fallback
  }
}

function writeLocalJson<T>(storageKey: string, value: T) {
  if (!canUseLocalStorage()) {
    return
  }

  window.localStorage.setItem(storageKey, JSON.stringify(value))
}

function emitFirebaseSyncEvent() {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new CustomEvent(FIREBASE_SYNC_EVENT))
}

function getLegacyStateDocument(documentId: string) {
  return doc(getFirebaseDb(), LEGACY_APP_STATE_COLLECTION, documentId)
}

function getUserStateDocument(userId: string, documentId: string) {
  return doc(getFirebaseDb(), USERS_COLLECTION, userId, USER_APP_STATE_COLLECTION, documentId)
}

async function readRemotePayload<T>(userId: string, documentId: string): Promise<T | null> {
  const snapshot = await getDoc(getUserStateDocument(userId, documentId))

  if (!snapshot.exists()) {
    return null
  }

  const data = snapshot.data() as Partial<FirestorePayload<T>>
  return data.payload ?? null
}

async function readLegacyRemotePayload<T>(documentId: string): Promise<T | null> {
  const snapshot = await getDoc(getLegacyStateDocument(documentId))

  if (!snapshot.exists()) {
    return null
  }

  const data = snapshot.data() as Partial<FirestorePayload<T>>
  return data.payload ?? null
}

async function writeRemotePayload<T>(userId: string, documentId: string, payload: T) {
  await setDoc(getUserStateDocument(userId, documentId), {
    payload,
    updatedAt: new Date().toISOString(),
  } satisfies FirestorePayload<T>)
}

function logSyncError(action: string, error: unknown) {
  console.warn(`[firebase-sync] ${action}`, error)
}

export async function bootstrapFirebaseTrainingCache() {
  if (!isFirebaseConfigured()) {
    return {
      synced: false,
      reason: getFirebaseConfigError() ?? 'Firebase is not configured',
    }
  }

  try {
    const user = await initializeFirebaseAuthSession()
    const userId = user?.uid ?? getCurrentFirebaseUserId()

    if (!userId) {
      return {
        synced: false,
        reason: 'Firebase Auth user is unavailable',
      }
    }

    const [remoteHistory, remotePlans, remotePriorities] = await Promise.all([
      readRemotePayload<WorkoutHistoryEntry[]>(userId, HISTORY_DOC_ID),
      readRemotePayload<PlannedWorkoutEntry[]>(userId, PLANS_DOC_ID),
      readRemotePayload<MusclePriorityOverrides>(userId, PRIORITIES_DOC_ID),
    ])

    const [legacyHistory, legacyPlans, legacyPriorities] =
      remoteHistory == null && remotePlans == null && remotePriorities == null
        ? await Promise.all([
            readLegacyRemotePayload<WorkoutHistoryEntry[]>(HISTORY_DOC_ID),
            readLegacyRemotePayload<PlannedWorkoutEntry[]>(PLANS_DOC_ID),
            readLegacyRemotePayload<MusclePriorityOverrides>(PRIORITIES_DOC_ID),
          ])
        : [null, null, null]

    const resolvedHistory = remoteHistory ?? legacyHistory
    const resolvedPlans = remotePlans ?? legacyPlans
    const resolvedPriorities = remotePriorities ?? legacyPriorities

    if (remoteHistory == null && legacyHistory) {
      await writeRemotePayload(userId, HISTORY_DOC_ID, legacyHistory)
    }

    if (remotePlans == null && legacyPlans) {
      await writeRemotePayload(userId, PLANS_DOC_ID, legacyPlans)
    }

    if (remotePriorities == null && legacyPriorities) {
      await writeRemotePayload(userId, PRIORITIES_DOC_ID, legacyPriorities)
    }

    if (resolvedHistory) {
      writeLocalJson(WORKOUT_HISTORY_STORAGE_KEY, resolvedHistory)
    }

    if (resolvedPlans) {
      writeLocalJson(PLANNED_WORKOUTS_STORAGE_KEY, resolvedPlans)
    }

    if (resolvedPriorities) {
      writeLocalJson(SETTINGS_STORAGE_KEY, resolvedPriorities)
    }

    if (resolvedHistory == null) {
      const localHistory = loadWorkoutHistory()

      if (localHistory.length > 0) {
        await writeRemotePayload(userId, HISTORY_DOC_ID, localHistory)
      }
    }

    if (resolvedPlans == null) {
      const localPlans = loadPlannedWorkouts()

      if (localPlans.length > 0) {
        await writeRemotePayload(userId, PLANS_DOC_ID, localPlans)
      }
    }

    if (resolvedPriorities == null) {
      const localPriorities = loadMusclePriorityOverrides()

      if (Object.keys(localPriorities).length > 0) {
        await writeRemotePayload(userId, PRIORITIES_DOC_ID, localPriorities)
      }
    }

    emitFirebaseSyncEvent()

    return {
      synced: true,
      userId,
      historyCount: resolvedHistory?.length ?? loadWorkoutHistory().length,
      planCount: resolvedPlans?.length ?? loadPlannedWorkouts().length,
      priorityCount: Object.keys(resolvedPriorities ?? loadMusclePriorityOverrides()).length,
    }
  } catch (error) {
    logSyncError('bootstrap failed', error)
    return {
      synced: false,
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function subscribeToFirebaseTrainingState() {
  if (!isFirebaseConfigured()) {
    return () => undefined
  }

  const user = await initializeFirebaseAuthSession()
  const userId = user?.uid ?? getCurrentFirebaseUserId()

  if (!userId) {
    return () => undefined
  }

  const unsubscriptions = [
    onSnapshot(getUserStateDocument(userId, HISTORY_DOC_ID), (snapshot) => {
      const data = snapshot.data() as Partial<FirestorePayload<WorkoutHistoryEntry[]>> | undefined

      if (!data?.payload) {
        return
      }

      writeLocalJson(WORKOUT_HISTORY_STORAGE_KEY, data.payload)
      emitFirebaseSyncEvent()
    }),
    onSnapshot(getUserStateDocument(userId, PLANS_DOC_ID), (snapshot) => {
      const data = snapshot.data() as Partial<FirestorePayload<PlannedWorkoutEntry[]>> | undefined

      if (!data?.payload) {
        return
      }

      writeLocalJson(PLANNED_WORKOUTS_STORAGE_KEY, data.payload)
      emitFirebaseSyncEvent()
    }),
    onSnapshot(getUserStateDocument(userId, PRIORITIES_DOC_ID), (snapshot) => {
      const data = snapshot.data() as Partial<FirestorePayload<MusclePriorityOverrides>> | undefined

      if (!data?.payload) {
        return
      }

      writeLocalJson(SETTINGS_STORAGE_KEY, data.payload)
      emitFirebaseSyncEvent()
    }),
  ]

  return () => {
    unsubscriptions.forEach((unsubscribe) => unsubscribe())
  }
}

export function syncWorkoutHistoryToFirebase(entries: WorkoutHistoryEntry[]) {
  if (!isFirebaseConfigured()) {
    return
  }

  void initializeFirebaseAuthSession()
    .then((user) => {
      if (!user?.uid) {
        throw new Error('Firebase Auth user is unavailable')
      }

      return writeRemotePayload(user.uid, HISTORY_DOC_ID, entries)
    })
    .catch((error) => logSyncError('history write failed', error))
}

export function syncPlannedWorkoutsToFirebase(entries: PlannedWorkoutEntry[]) {
  if (!isFirebaseConfigured()) {
    return
  }

  void initializeFirebaseAuthSession()
    .then((user) => {
      if (!user?.uid) {
        throw new Error('Firebase Auth user is unavailable')
      }

      return writeRemotePayload(user.uid, PLANS_DOC_ID, entries)
    })
    .catch((error) => logSyncError('plans write failed', error))
}

export function syncMusclePrioritiesToFirebase(overrides: MusclePriorityOverrides) {
  if (!isFirebaseConfigured()) {
    return
  }

  void initializeFirebaseAuthSession()
    .then((user) => {
      if (!user?.uid) {
        throw new Error('Firebase Auth user is unavailable')
      }

      return writeRemotePayload(user.uid, PRIORITIES_DOC_ID, overrides)
    })
    .catch((error) => logSyncError('priorities write failed', error))
}

export function readLocalWorkoutHistory() {
  return readLocalJson<WorkoutHistoryEntry[]>(WORKOUT_HISTORY_STORAGE_KEY, [])
}

export function readLocalPlannedWorkouts() {
  return readLocalJson<PlannedWorkoutEntry[]>(PLANNED_WORKOUTS_STORAGE_KEY, [])
}

export function readLocalMusclePriorities() {
  return readLocalJson<MusclePriorityOverrides>(SETTINGS_STORAGE_KEY, {})
}
