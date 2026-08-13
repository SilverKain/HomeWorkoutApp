import type { Exercise } from '../types/exercise.ts'
import type { MuscleGroup, MusclePriority } from '../types/muscles.ts'
import type { WorkoutExerciseEntry, WorkoutHistoryEntry } from '../types/workout.ts'
import { calculateRecoveryScores, calculateRecentMuscleLoad } from './recovery.ts'

export interface MuscleNeedScoreItem {
  muscleId: MuscleGroup['id']
  muscleName: string
  score: number
  lastTrainedDate: string | null
  recentLoad7d: number
  recoveryScore: number
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

function getPriorityFactor(priority: MusclePriority) {
  if (priority === 'high') {
    return 1.18
  }

  if (priority === 'low') {
    return 0.94
  }

  return 1
}

function findLastTrainedDate(
  muscleId: MuscleGroup['id'],
  history: WorkoutHistoryEntry[],
  exerciseMap: Record<string, Exercise>,
  pendingEntries: WorkoutExerciseEntry[] = [],
  todayIsoDate: string,
) {
  const hasPendingMuscleWork = pendingEntries.some((entry) => {
    if (!entry.completed) {
      return false
    }

    const exercise = exerciseMap[entry.exerciseId]
    return exercise != null && (exercise.muscles[muscleId] ?? 0) > 0
  })

  if (hasPendingMuscleWork) {
    return todayIsoDate
  }

  for (const workout of history) {
    const hasMuscleWork = workout.entries.some((entry) => {
      if (!entry.completed) {
        return false
      }

      const exercise = exerciseMap[entry.exerciseId]
      return exercise != null && (exercise.muscles[muscleId] ?? 0) > 0
    })

    if (hasMuscleWork) {
      return workout.date
    }
  }

  return null
}

export function calculateMuscleNeedScores(
  history: WorkoutHistoryEntry[],
  exerciseMap: Record<string, Exercise>,
  muscles: MuscleGroup[],
  todayIsoDate: string,
  pendingEntries: WorkoutExerciseEntry[] = [],
): MuscleNeedScoreItem[] {
  const recoveryScores = calculateRecoveryScores(
    history,
    exerciseMap,
    muscles,
    todayIsoDate,
    pendingEntries,
  )
  const recentLoadMap = calculateRecentMuscleLoad(
    history.filter((entry) => daysBetween(entry.date, todayIsoDate) <= 7),
    exerciseMap,
    todayIsoDate,
    pendingEntries,
  )
  const recoveryMap = Object.fromEntries(
    recoveryScores.map((item) => [item.muscleId, item]),
  ) as Record<MuscleGroup['id'], (typeof recoveryScores)[number] | undefined>

  return muscles
    .map((muscle) => {
      const recoveryItem = recoveryMap[muscle.id]
      const recentLoad7d = Number((recentLoadMap[muscle.id] ?? 0).toFixed(2))
      const recoveryScore = recoveryItem?.score ?? 100
      const lastTrainedDate = findLastTrainedDate(
        muscle.id,
        history,
        exerciseMap,
        pendingEntries,
        todayIsoDate,
      )
      const daysSinceLastTraining = lastTrainedDate
        ? daysBetween(lastTrainedDate, todayIsoDate)
        : 10
      const recoveryNeed = recoveryScore / 100
      const freshnessNeed = clamp(1 - recentLoad7d / 80, 0, 1)
      const timeNeed = clamp(daysSinceLastTraining / 7, 0, 1)
      const priorityFactor = getPriorityFactor(muscle.priority)

      const score = clamp(
        Math.round(
          (recoveryNeed * 0.4 + freshnessNeed * 0.35 + timeNeed * 0.25) *
            100 *
            priorityFactor,
        ),
        0,
        100,
      )

      return {
        muscleId: muscle.id,
        muscleName: muscle.name,
        score,
        lastTrainedDate,
        recentLoad7d,
        recoveryScore,
      }
    })
    .sort((left, right) => right.score - left.score)
}
