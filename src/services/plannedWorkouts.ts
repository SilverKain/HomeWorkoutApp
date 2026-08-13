import type { PlannedWorkoutEntry } from '../types/workout.ts'
import { syncPlannedWorkoutsToFirebase } from './firebaseTrainingSync.ts'

export const PLANNED_WORKOUTS_STORAGE_KEY = 'home-workout-plans'

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function loadPlannedWorkouts(): PlannedWorkoutEntry[] {
  if (!canUseLocalStorage()) {
    return []
  }

  const rawValue = window.localStorage.getItem(PLANNED_WORKOUTS_STORAGE_KEY)

  if (!rawValue) {
    return []
  }

  try {
    const parsed = JSON.parse(rawValue)
    return Array.isArray(parsed) ? (parsed as PlannedWorkoutEntry[]) : []
  } catch {
    return []
  }
}

export function savePlannedWorkout(entry: PlannedWorkoutEntry) {
  if (!canUseLocalStorage()) {
    return entry
  }

  const currentEntries = loadPlannedWorkouts().filter(
    (planned) => planned.date !== entry.date,
  )
  const nextEntries = [entry, ...currentEntries]
  window.localStorage.setItem(
    PLANNED_WORKOUTS_STORAGE_KEY,
    JSON.stringify(nextEntries),
  )
  syncPlannedWorkoutsToFirebase(nextEntries)

  return entry
}

export function savePlannedWorkouts(entries: PlannedWorkoutEntry[]) {
  if (!canUseLocalStorage()) {
    return entries
  }

  const nextEntries =
    entries.length === 0
      ? []
      : [
          ...entries,
          ...loadPlannedWorkouts().filter(
            (planned) => !new Set(entries.map((entry) => entry.date)).has(planned.date),
          ),
        ]
  window.localStorage.setItem(
    PLANNED_WORKOUTS_STORAGE_KEY,
    JSON.stringify(nextEntries),
  )
  syncPlannedWorkoutsToFirebase(nextEntries)

  return entries
}

export function removePlannedWorkoutByDate(date: string) {
  if (!canUseLocalStorage()) {
    return []
  }

  const nextEntries = loadPlannedWorkouts().filter((planned) => planned.date !== date)
  window.localStorage.setItem(
    PLANNED_WORKOUTS_STORAGE_KEY,
    JSON.stringify(nextEntries),
  )
  syncPlannedWorkoutsToFirebase(nextEntries)

  return nextEntries
}
