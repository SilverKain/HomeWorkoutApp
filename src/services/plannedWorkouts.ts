import type { PlannedWorkoutEntry } from '../types/workout.ts'
import { syncPlannedWorkoutsToFirebase } from './firebaseTrainingSync.ts'

export const PLANNED_WORKOUTS_STORAGE_KEY = 'home-workout-plans'
export const PLANNED_WORKOUTS_UPDATED_EVENT = 'planned-workouts-updated'

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function notifyPlannedWorkoutsUpdated() {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new Event(PLANNED_WORKOUTS_UPDATED_EVENT))
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
  notifyPlannedWorkoutsUpdated()

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
  notifyPlannedWorkoutsUpdated()

  return entries
}

export function upsertPlannedWorkoutEntry(entry: PlannedWorkoutEntry) {
  if (!canUseLocalStorage()) {
    return [entry]
  }

  const nextEntries = [
    entry,
    ...loadPlannedWorkouts().filter((planned) => planned.date !== entry.date),
  ]

  window.localStorage.setItem(
    PLANNED_WORKOUTS_STORAGE_KEY,
    JSON.stringify(nextEntries),
  )
  syncPlannedWorkoutsToFirebase(nextEntries)
  notifyPlannedWorkoutsUpdated()

  return nextEntries
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
  notifyPlannedWorkoutsUpdated()

  return nextEntries
}

export function removePlannedWorkoutExercise(date: string, exerciseId: string) {
  if (!canUseLocalStorage()) {
    return []
  }

  const nextEntries = loadPlannedWorkouts()
    .map((planned) => {
      if (planned.date !== date) {
        return planned
      }

      return {
        ...planned,
        entries: planned.entries.filter((entry) => entry.exerciseId !== exerciseId),
      }
    })
    .filter((planned) => planned.entries.length > 0)

  window.localStorage.setItem(
    PLANNED_WORKOUTS_STORAGE_KEY,
    JSON.stringify(nextEntries),
  )
  syncPlannedWorkoutsToFirebase(nextEntries)
  notifyPlannedWorkoutsUpdated()

  return nextEntries
}
