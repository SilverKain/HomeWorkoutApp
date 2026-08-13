import type { Exercise } from '../types/exercise.ts'
import type { MuscleGroup } from '../types/muscles.ts'
import type { WorkoutExerciseEntry } from '../types/workout.ts'
import { getEntryAverageRir } from '../utils/effort.ts'

export type MuscleLoadMap = Partial<Record<MuscleGroup['id'], number>>

export interface MuscleLoadSummaryItem {
  muscleId: MuscleGroup['id']
  muscleName: string
  load: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getRirIntensityFactor(rir: number) {
  // Lower RIR means the set was taken closer to failure, so the muscle stress is higher.
  return clamp(1.15 - rir * 0.08, 0.35, 1.15)
}

export function calculateWorkoutMuscleLoad(
  entries: WorkoutExerciseEntry[],
  exerciseMap: Record<string, Exercise>,
): MuscleLoadMap {
  return entries.reduce<MuscleLoadMap>((accumulator, entry) => {
    if (!entry.completed) {
      return accumulator
    }

    const exercise = exerciseMap[entry.exerciseId]

    if (!exercise) {
      return accumulator
    }

    const volumeScore =
      entry.sets *
      entry.reps *
      getRirIntensityFactor(getEntryAverageRir(entry)) *
      exercise.baseEffectiveness

    Object.entries(exercise.muscles).forEach(([muscleId, coefficient]) => {
      const safeCoefficient = coefficient ?? 0
      const loadContribution = volumeScore * safeCoefficient
      const typedMuscleId = muscleId as MuscleGroup['id']

      accumulator[typedMuscleId] =
        (accumulator[typedMuscleId] ?? 0) + loadContribution
    })

    return accumulator
  }, {})
}

export function summarizeWorkoutMuscleLoad(
  loadMap: MuscleLoadMap,
  muscles: MuscleGroup[],
): MuscleLoadSummaryItem[] {
  return Object.entries(loadMap)
    .map(([muscleId, load]) => ({
      muscleId: muscleId as MuscleGroup['id'],
      muscleName:
        muscles.find((muscle) => muscle.id === muscleId)?.name ?? muscleId,
      load: Number((load ?? 0).toFixed(2)),
    }))
    .sort((left, right) => right.load - left.load)
}
