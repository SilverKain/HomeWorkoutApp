import type { Exercise } from '../types/exercise.ts'
import type { MuscleGroup } from '../types/muscles.ts'
import type { WorkoutHistoryEntry } from '../types/workout.ts'
import { getEntryAverageRir } from '../utils/effort.ts'
import {
  calculateMuscleNeedScores,
  type MuscleNeedScoreItem,
} from './needScore.ts'

interface ExercisePerformanceSample {
  date: string
  reps: number
  sets: number
  rir: number
  quality: number
  volume: number
}

interface PlateauAnalysis {
  isPlateau: boolean
  penalty: number
  stableCount: number
  representativeReps: number | null
}

interface OveruseAnalysis {
  hasEnoughHistory: boolean
  recentUseCount: number
  noProgress: boolean
  cooldownFactor: number
  penalty: number
  detected: boolean
}

export interface EffectivenessScoreItem {
  exerciseId: string
  exerciseName: string
  score: number
  progressScore: number
  qualityScore: number
  rirScore: number
  frequencyScore: number
  plateauPenalty: number
  overusePenalty: number
  fatiguePenalty: number
  muscleNeedScore: number
  usageCount: number
  lastUsedDate: string | null
  goodProgress: boolean
  goodProgressStreak: number
  progressGain: number
  plateauDetected: boolean
  plateauStableCount: number
  plateauRepresentativeReps: number | null
  reasons: string[]
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

function buildExerciseSamples(
  history: WorkoutHistoryEntry[],
): Map<string, ExercisePerformanceSample[]> {
  const samplesByExercise = new Map<string, ExercisePerformanceSample[]>()

  for (const workout of [...history].sort((left, right) => left.date.localeCompare(right.date))) {
    for (const entry of workout.entries) {
      if (!entry.completed) {
        continue
      }

      const resolvedRir = getEntryAverageRir(entry)
      const quality = clamp(
        entry.sets * entry.reps * (1 + (4 - clamp(resolvedRir, 0, 4)) * 0.08),
        0,
        500,
      )
      const sample: ExercisePerformanceSample = {
        date: workout.date,
        reps: entry.reps,
        sets: entry.sets,
        rir: resolvedRir,
        quality,
        volume: entry.sets * entry.reps,
      }

      const currentSamples = samplesByExercise.get(entry.exerciseId) ?? []
      currentSamples.push(sample)
      samplesByExercise.set(entry.exerciseId, currentSamples)
    }
  }

  return samplesByExercise
}

function getAverageMuscleNeed(
  exercise: Exercise,
  needScoreMap: Record<string, MuscleNeedScoreItem | undefined>,
) {
  let weightedSum = 0
  let totalWeight = 0

  for (const [muscleId, coefficient] of Object.entries(exercise.muscles)) {
    const safeCoefficient = coefficient ?? 0

    if (safeCoefficient <= 0) {
      continue
    }

    weightedSum += (needScoreMap[muscleId]?.score ?? 50) * safeCoefficient
    totalWeight += safeCoefficient
  }

  if (totalWeight === 0) {
    return 50
  }

  return Math.round(weightedSum / totalWeight)
}

function analyzeGoodProgress(samples: ExercisePerformanceSample[]) {
  if (samples.length < 4) {
    return {
      goodProgress: false,
      goodProgressStreak: 0,
      progressGain: 0,
      bonus: 0,
    }
  }

  const recent = samples.slice(-4)
  const streak = recent.reduce((count, sample, index) => {
    if (index === 0) {
      return 1
    }

    return sample.reps > recent[index - 1].reps ? count + 1 : count
  }, 0)
  const progressGain = recent[recent.length - 1].reps - recent[0].reps
  const goodProgress = streak === recent.length && progressGain >= 6

  return {
    goodProgress,
    goodProgressStreak: goodProgress ? streak : 0,
    progressGain: goodProgress ? progressGain : Math.max(0, progressGain),
    bonus: goodProgress ? 14 : 0,
  }
}

function getProgressScore(samples: ExercisePerformanceSample[]) {
  if (samples.length < 2) {
    return 58
  }

  const lastWindow = samples.slice(-3)
  const previousWindow = samples.slice(-6, -3)
  const recentAverage =
    lastWindow.reduce((sum, sample) => sum + sample.reps, 0) / lastWindow.length
  const previousAverage =
    previousWindow.length > 0
      ? previousWindow.reduce((sum, sample) => sum + sample.reps, 0) / previousWindow.length
      : samples[0].reps
  const delta = recentAverage - previousAverage

  return clamp(Math.round(60 + delta * 8), 25, 100)
}

function getQualityScore(samples: ExercisePerformanceSample[]) {
  if (samples.length === 0) {
    return 55
  }

  const recentSamples = samples.slice(-4)
  const averageQuality =
    recentSamples.reduce((sum, sample) => sum + sample.quality, 0) / recentSamples.length

  return clamp(Math.round(averageQuality / 1.9), 35, 100)
}

function getRirScore(samples: ExercisePerformanceSample[]) {
  if (samples.length === 0) {
    return 55
  }

  const recentSamples = samples.slice(-4)
  const averageRir =
    recentSamples.reduce((sum, sample) => sum + clamp(sample.rir, 0, 5), 0) /
    recentSamples.length
  const distanceFromTarget = Math.abs(averageRir - 1.5)

  return clamp(Math.round(100 - distanceFromTarget * 20), 30, 100)
}

function getFrequencyScore(samples: ExercisePerformanceSample[], todayIsoDate: string) {
  if (samples.length === 0) {
    return 55
  }

  const recentUses = samples.filter(
    (sample) => daysBetween(sample.date, todayIsoDate) <= 14,
  ).length

  if (recentUses === 0) {
    return 72
  }

  if (recentUses === 1 || recentUses === 2) {
    return 92
  }

  if (recentUses === 3 || recentUses === 4) {
    return 88
  }

  if (recentUses === 5 || recentUses === 6) {
    return 84
  }

  return 80
}

function analyzePlateau(samples: ExercisePerformanceSample[]): PlateauAnalysis {
  if (samples.length < 4) {
    return {
      isPlateau: false,
      penalty: 0,
      stableCount: 0,
      representativeReps: null,
    }
  }

  const recentSamples = samples.slice(-5)
  const recentReps = recentSamples.map((sample) => sample.reps)
  const sortedReps = [...recentReps].sort((left, right) => left - right)
  const medianReps = sortedReps[Math.floor(sortedReps.length / 2)]
  const stableSamples = recentSamples.filter(
    (sample) => Math.abs(sample.reps - medianReps) <= 1,
  )
  const stableCount = stableSamples.length
  const lastThree = recentSamples.slice(-3)
  const lastThreeStable = lastThree.every(
    (sample) => Math.abs(sample.reps - medianReps) <= 1,
  )
  const weakOutlierCount = recentSamples.filter(
    (sample) => sample.reps < medianReps - 1,
  ).length
  const improvingTail =
    recentSamples[recentSamples.length - 1].reps >
    recentSamples[recentSamples.length - 2].reps

  if (stableCount >= 4 && lastThreeStable && !improvingTail) {
    return {
      isPlateau: true,
      penalty: weakOutlierCount <= 1 ? 12 : 18,
      stableCount,
      representativeReps: medianReps,
    }
  }

  return {
    isPlateau: false,
    penalty: 0,
    stableCount,
    representativeReps: medianReps,
  }
}

function getFatiguePenalty(exercise: Exercise, samples: ExercisePerformanceSample[]) {
  if (samples.length === 0) {
    return Math.round(exercise.fatigueLevel * 8)
  }

  const recentSamples = samples.slice(-3)
  const recentAverageVolume =
    recentSamples.reduce((sum, sample) => sum + sample.volume, 0) / recentSamples.length
  const fatigueImpact = exercise.fatigueLevel * (recentAverageVolume / 18)

  return clamp(Math.round(fatigueImpact * 6), 2, 18)
}

function getOveruseCooldownFactor(daysSinceLastUse: number | null) {
  if (daysSinceLastUse == null) {
    return 0
  }

  if (daysSinceLastUse <= 7) {
    return 1
  }

  if (daysSinceLastUse <= 14) {
    return 0.8
  }

  if (daysSinceLastUse <= 21) {
    return 0.6
  }

  if (daysSinceLastUse <= 28) {
    return 0.35
  }

  if (daysSinceLastUse <= 35) {
    return 0.15
  }

  return 0
}

function analyzeOveruse(
  samples: ExercisePerformanceSample[],
  todayIsoDate: string,
  progressScore: number,
  plateauAnalysis: PlateauAnalysis,
  goodProgress: boolean,
): OveruseAnalysis {
  const recentUseCount = samples.filter(
    (sample) => daysBetween(sample.date, todayIsoDate) <= 21,
  ).length
  const rollingUseCount = samples.filter(
    (sample) => daysBetween(sample.date, todayIsoDate) <= 35,
  ).length
  const hasEnoughHistory = samples.length >= 5
  const noProgress = plateauAnalysis.isPlateau || (!goodProgress && progressScore <= 55)
  const lastUsedDate = samples.at(-1)?.date ?? null
  const daysSinceLastUse =
    lastUsedDate == null ? null : daysBetween(lastUsedDate, todayIsoDate)
  const cooldownFactor = getOveruseCooldownFactor(daysSinceLastUse)
  const wasOverusedRecently = recentUseCount >= 4 || rollingUseCount >= 5
  const detected = hasEnoughHistory && wasOverusedRecently && noProgress && cooldownFactor > 0

  if (!detected) {
    return {
      hasEnoughHistory,
      recentUseCount,
      noProgress,
      cooldownFactor,
      penalty: 0,
      detected: false,
    }
  }

  const basePenalty = 10 + Math.max(0, rollingUseCount - 5) * 2
  const plateauBonusPenalty = plateauAnalysis.isPlateau ? 4 : 0
  const penalty = Math.round((basePenalty + plateauBonusPenalty) * cooldownFactor)

  return {
    hasEnoughHistory,
    recentUseCount,
    noProgress,
    cooldownFactor,
    penalty,
    detected: penalty > 0,
  }
}

function buildReasons(
  exercise: Exercise,
  metrics: Omit<EffectivenessScoreItem, 'exerciseId' | 'exerciseName' | 'score' | 'reasons'>,
) {
  const reasons: string[] = []

  if (metrics.usageCount === 0) {
    if (metrics.muscleNeedScore >= 72) {
      reasons.push('целевые мышцы сейчас действительно нужны плану')
    }

    reasons.push('пока мало истории, поэтому рейтинг близок к базовой оценке')
    return reasons
  }

  if (metrics.goodProgress) {
    reasons.push(
      `есть хороший прогресс: +${metrics.progressGain} повторений за ${metrics.goodProgressStreak} выполнения`,
    )
  } else if (metrics.progressScore >= 72) {
    reasons.push('есть рост по повторениям')
  } else if (metrics.progressScore <= 48) {
    reasons.push('прогресс по повторениям замедлился')
  }

  if (metrics.qualityScore >= 72) {
    reasons.push('подходы сохраняют хорошее качество')
  }

  if (metrics.rirScore >= 72) {
    reasons.push('усилие близко к рабочему диапазону')
  } else if (metrics.rirScore <= 48) {
    reasons.push('усилие часто слишком далеко от эффективного диапазона')
  }

  if (metrics.frequencyScore >= 82) {
    reasons.push('упражнение используется с удачной частотой')
  } else if (metrics.frequencyScore <= 55) {
    reasons.push('упражнение давно не возвращалось в план')
  }

  if (metrics.plateauDetected && metrics.plateauRepresentativeReps != null) {
    reasons.push(
      `несколько тренировок подряд держатся около ${metrics.plateauRepresentativeReps} повторений`,
    )
  } else if (metrics.plateauPenalty >= 10) {
    reasons.push('появляются признаки застоя')
  }

  if (metrics.overusePenalty >= 10) {
    reasons.push('частое использование без нового прогресса уже заметно снижает отдачу')
  } else if (metrics.overusePenalty > 0) {
    reasons.push('после паузы штраф уже уменьшился, поэтому упражнение может вернуться в план')
  }

  if (metrics.muscleNeedScore >= 72) {
    reasons.push('целевые мышцы сейчас действительно нужны плану')
  }

  if (metrics.fatiguePenalty >= 12) {
    reasons.push(`утомление у ${exercise.name.toLowerCase()} уже заметно`)
  }

  if (reasons.length === 0) {
    reasons.push('рейтинг пока базируется на общей эффективности упражнения')
  }

  return reasons
}

export function calculateEffectivenessScores(
  history: WorkoutHistoryEntry[],
  exercises: Exercise[],
  muscles: MuscleGroup[],
  todayIsoDate: string,
): EffectivenessScoreItem[] {
  const exerciseMap = Object.fromEntries(
    exercises.map((exercise) => [exercise.id, exercise]),
  ) as Record<string, Exercise>
  const needScoreItems = calculateMuscleNeedScores(
    history,
    exerciseMap,
    muscles,
    todayIsoDate,
  )
  const needScoreMap = Object.fromEntries(
    needScoreItems.map((item) => [item.muscleId, item]),
  ) as Record<string, MuscleNeedScoreItem | undefined>
  const samplesByExercise = buildExerciseSamples(history)

  return exercises
    .map((exercise) => {
      const samples = samplesByExercise.get(exercise.id) ?? []
      const progressScore = getProgressScore(samples)
      const qualityScore = getQualityScore(samples)
      const rirScore = getRirScore(samples)
      const frequencyScore = getFrequencyScore(samples, todayIsoDate)
      const plateauAnalysis = analyzePlateau(samples)
      const plateauPenalty = plateauAnalysis.penalty
      const fatiguePenalty = getFatiguePenalty(exercise, samples)
      const muscleNeedScore = getAverageMuscleNeed(exercise, needScoreMap)
      const goodProgressData = analyzeGoodProgress(samples)
      const overuseAnalysis = analyzeOveruse(
        samples,
        todayIsoDate,
        progressScore,
        plateauAnalysis,
        goodProgressData.goodProgress,
      )

      const score = clamp(
        Math.round(
          exercise.baseEffectiveness * 35 +
            progressScore * 0.18 +
            qualityScore * 0.16 +
            rirScore * 0.12 +
            frequencyScore * 0.1 +
            muscleNeedScore * 0.18 +
            goodProgressData.bonus -
            plateauPenalty -
            overuseAnalysis.penalty -
            fatiguePenalty,
        ),
        1,
        100,
      )

      const metrics = {
        progressScore,
        qualityScore,
        rirScore,
        frequencyScore,
        plateauPenalty,
        overusePenalty: overuseAnalysis.penalty,
        fatiguePenalty,
        muscleNeedScore,
        usageCount: samples.length,
        lastUsedDate: samples.at(-1)?.date ?? null,
        goodProgress: goodProgressData.goodProgress,
        goodProgressStreak: goodProgressData.goodProgressStreak,
        progressGain: goodProgressData.progressGain,
        plateauDetected: plateauAnalysis.isPlateau,
        plateauStableCount: plateauAnalysis.stableCount,
        plateauRepresentativeReps: plateauAnalysis.representativeReps,
      }

      return {
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        score,
        ...metrics,
        reasons: buildReasons(exercise, metrics),
      }
    })
    .sort((left, right) => right.score - left.score)
}
