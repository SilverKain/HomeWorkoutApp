import type { MuscleGroup, MusclePriority } from '../types/muscles.ts'
import { syncMusclePrioritiesToFirebase } from './firebaseTrainingSync.ts'

const MUSCLE_PRIORITIES_STORAGE_KEY = 'home-workout-app:muscle-priorities'

export type MusclePriorityOverrides = Partial<Record<MuscleGroup['id'], MusclePriority>>

export function loadMusclePriorityOverrides(): MusclePriorityOverrides {
  if (typeof window === 'undefined') {
    return {}
  }

  const rawValue = window.localStorage.getItem(MUSCLE_PRIORITIES_STORAGE_KEY)

  if (!rawValue) {
    return {}
  }

  try {
    return JSON.parse(rawValue) as MusclePriorityOverrides
  } catch {
    return {}
  }
}

export function saveMusclePriorityOverrides(overrides: MusclePriorityOverrides) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(
    MUSCLE_PRIORITIES_STORAGE_KEY,
    JSON.stringify(overrides),
  )
  syncMusclePrioritiesToFirebase(overrides)
}

export function resolveMuscleGroups(baseMuscleGroups: MuscleGroup[]) {
  const overrides = loadMusclePriorityOverrides()

  return baseMuscleGroups.map((muscle) => ({
    ...muscle,
    priority: overrides[muscle.id] ?? muscle.priority,
  }))
}
