import type { WorkoutDraft, WorkoutHistoryEntry } from '../types/workout.ts'
import { syncWorkoutHistoryToFirebase } from './firebaseTrainingSync.ts'

export const WORKOUT_HISTORY_STORAGE_KEY = 'home-workout-history'
export const WORKOUT_HISTORY_UPDATED_EVENT = 'workout-history-updated'

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function notifyWorkoutHistoryUpdated() {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new Event(WORKOUT_HISTORY_UPDATED_EVENT))
}

export function loadWorkoutHistory(): WorkoutHistoryEntry[] {
  if (!canUseLocalStorage()) {
    return []
  }

  const rawValue = window.localStorage.getItem(WORKOUT_HISTORY_STORAGE_KEY)

  if (!rawValue) {
    return []
  }

  try {
    const parsed = JSON.parse(rawValue)

    return Array.isArray(parsed) ? (parsed as WorkoutHistoryEntry[]) : []
  } catch {
    return []
  }
}

export function saveWorkoutHistoryEntry(
  draft: Omit<WorkoutDraft, 'title'> & { title: string; date: string },
): WorkoutHistoryEntry {
  const historyEntry: WorkoutHistoryEntry = {
    id: `${draft.date}-${Date.now()}`,
    date: draft.date,
    title: draft.title,
    entries: draft.entries,
  }

  if (!canUseLocalStorage()) {
    return historyEntry
  }

  const currentHistory = loadWorkoutHistory()
  const nextHistory = [historyEntry, ...currentHistory]
  window.localStorage.setItem(
    WORKOUT_HISTORY_STORAGE_KEY,
    JSON.stringify(nextHistory),
  )
  syncWorkoutHistoryToFirebase(nextHistory)
  notifyWorkoutHistoryUpdated()

  return historyEntry
}

export function removeWorkoutHistoryExercise(date: string, exerciseId: string) {
  if (!canUseLocalStorage()) {
    return []
  }

  const currentHistory = loadWorkoutHistory()
  const nextHistory = currentHistory
    .map((entry) => {
      if (entry.date !== date) {
        return entry
      }

      return {
        ...entry,
        entries: entry.entries.filter((item) => item.exerciseId !== exerciseId),
      }
    })
    .filter((entry) => entry.entries.length > 0)

  window.localStorage.setItem(
    WORKOUT_HISTORY_STORAGE_KEY,
    JSON.stringify(nextHistory),
  )
  syncWorkoutHistoryToFirebase(nextHistory)
  notifyWorkoutHistoryUpdated()

  return nextHistory
}
