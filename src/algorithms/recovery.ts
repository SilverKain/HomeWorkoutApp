import type { Exercise } from '../types/exercise.ts'
import type { MuscleGroup } from '../types/muscles.ts'
import type { WorkoutExerciseEntry, WorkoutHistoryEntry } from '../types/workout.ts'
import { calculateWorkoutMuscleLoad, summarizeWorkoutMuscleLoad, type MuscleLoadMap } from './muscleLoad.ts'

export interface RecoveryScoreItem {
  muscleId: MuscleGroup['id']
  muscleName: string
  score: number
  recentLoad: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function daysBetween(fromIsoDate: string, toIsoDate: string) {
  const from = new Date(`${fromIsoDate}T00:00:00`)
  const to = new Date(`${toIsoDate}T00:00:00`)
  const millisecondsPerDay = 1000 * 60 * 60 * 24

  return Math.max(0, Math.round((to.getTime() - from.getTime()) / millisecondsPerDay))
}

function applyLoadToAccumulator(
  accumulator: MuscleLoadMap,
  loadMap: MuscleLoadMap,
  daysAgo: number,
) {
  const decayFactor = Math.exp(-daysAgo / 2.4)

  Object.entries(loadMap).forEach(([muscleId, rawLoad]) => {
    const load = rawLoad ?? 0
    const typedMuscleId = muscleId as MuscleGroup['id']

    accumulator[typedMuscleId] =
      (accumulator[typedMuscleId] ?? 0) + load * decayFactor
  })
}

export function calculateRecentMuscleLoad(
  history: WorkoutHistoryEntry[],
  exerciseMap: Record<string, Exercise>,
  todayIsoDate: string,
  pendingEntries: WorkoutExerciseEntry[] = [],
): MuscleLoadMap {
  const accumulatedLoad: MuscleLoadMap = {}

  history.forEach((entry) => {
    const workoutLoad = calculateWorkoutMuscleLoad(entry.entries, exerciseMap)
    const daysAgo = daysBetween(entry.date, todayIsoDate)

    applyLoadToAccumulator(accumulatedLoad, workoutLoad, daysAgo)
  })

  if (pendingEntries.length > 0) {
    const pendingLoad = calculateWorkoutMuscleLoad(pendingEntries, exerciseMap)
    applyLoadToAccumulator(accumulatedLoad, pendingLoad, 0)
  }

  return accumulatedLoad
}

export function calculateRecoveryScores(
  history: WorkoutHistoryEntry[],
  exerciseMap: Record<string, Exercise>,
  muscles: MuscleGroup[],
  todayIsoDate: string,
  pendingEntries: WorkoutExerciseEntry[] = [],
): RecoveryScoreItem[] {
  const recentLoadMap = calculateRecentMuscleLoad(
    history,
    exerciseMap,
    todayIsoDate,
    pendingEntries,
  )

  return summarizeWorkoutMuscleLoad(recentLoadMap, muscles).map((item) => ({
    muscleId: item.muscleId,
    muscleName: item.muscleName,
    recentLoad: item.load,
    score: clamp(Math.round(100 - item.load * 1.35), 0, 100),
  }))
}
