import type { Exercise } from '../types/exercise.ts'
import { exerciseVariantMap } from '../data/exerciseVariants.ts'
import type { WorkoutExerciseEntry, WorkoutHistoryEntry } from '../types/workout.ts'
import { getEntryAverageRir } from '../utils/effort.ts'

export type ProgressionMethod =
  | 'reps'
  | 'sets'
  | 'effort'
  | 'tempo'
  | 'pause'
  | 'range'
  | 'unilateral'
  | 'variation'

export interface ProgressionSuggestion {
  method: ProgressionMethod
  label: string
  description: string
  targetSets: number
  targetReps: number
  targetRir: number
  nextExerciseId?: string
}

interface ExerciseSample {
  sets: number
  reps: number
  rir: number
}

interface PlateauAnalysis {
  isPlateau: boolean
  stableCount: number
  representativeReps: number | null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function getExerciseSamples(
  history: WorkoutHistoryEntry[],
  exerciseId: string,
): ExerciseSample[] {
  const samples: ExerciseSample[] = []

  for (const workout of [...history].sort((left, right) => left.date.localeCompare(right.date))) {
    for (const entry of workout.entries) {
      if (!entry.completed || entry.exerciseId !== exerciseId) {
        continue
      }

      samples.push({
        sets: entry.sets,
        reps: entry.reps,
        rir: getEntryAverageRir(entry),
      })
    }
  }

  return samples
}

function analyzePlateau(samples: ExerciseSample[]): PlateauAnalysis {
  if (samples.length < 4) {
    return {
      isPlateau: false,
      stableCount: 0,
      representativeReps: null,
    }
  }

  const recent = samples.slice(-5)
  const recentReps = recent.map((sample) => sample.reps)
  const sortedReps = [...recentReps].sort((left, right) => left - right)
  const medianReps = sortedReps[Math.floor(sortedReps.length / 2)]
  const stableCount = recent.filter(
    (sample) => Math.abs(sample.reps - medianReps) <= 1,
  ).length
  const lastThreeStable = recent
    .slice(-3)
    .every((sample) => Math.abs(sample.reps - medianReps) <= 1)
  const improvingTail = recent[recent.length - 1].reps > recent[recent.length - 2].reps

  return {
    isPlateau: stableCount >= 4 && lastThreeStable && !improvingTail,
    stableCount,
    representativeReps: medianReps,
  }
}

function hasSufficientProgressForHarderVariant(samples: ExerciseSample[]) {
  if (samples.length < 4) {
    return false
  }

  const recent = samples.slice(-4)
  const averageReps = average(recent.map((sample) => sample.reps))
  const averageRir = average(recent.map((sample) => sample.rir))
  const averageSets = average(recent.map((sample) => sample.sets))

  return averageReps >= 15 && averageRir <= 1.5 && averageSets >= 3
}

function getNextVariantExerciseId(
  exercise: Exercise,
  samples: ExerciseSample[],
) {
  const variantNode = exerciseVariantMap[exercise.id]

  if (!variantNode?.nextExerciseId) {
    return undefined
  }

  return hasSufficientProgressForHarderVariant(samples)
    ? variantNode.nextExerciseId
    : undefined
}

function supportsTempo(exercise: Exercise) {
  return (
    exercise.movementType === 'Жим' ||
    exercise.movementType === 'Приседание' ||
    exercise.movementType === 'Выпад' ||
    exercise.movementType === 'Наклон' ||
    exercise.movementType === 'Мост'
  )
}

function buildSuggestion(
  method: ProgressionMethod,
  current: WorkoutExerciseEntry,
  nextExerciseId?: string,
  nextExerciseName?: string,
): ProgressionSuggestion {
  if (method === 'reps') {
    return {
      method,
      label: 'Добавить повторения',
      description:
        'Следующий прогресс лучше делать через 1-2 дополнительных повторения в том же упражнении.',
      targetSets: current.sets,
      targetReps: clamp(current.reps + 1, 1, 20),
      targetRir: getEntryAverageRir(current),
      nextExerciseId,
    }
  }

  if (method === 'sets') {
    return {
      method,
      label: 'Добавить подход',
      description:
        'Повторения уже хорошие, поэтому следующий шаг лучше сделать через ещё один рабочий подход.',
      targetSets: clamp(current.sets + 1, 1, 4),
      targetReps: current.reps,
      targetRir: getEntryAverageRir(current),
      nextExerciseId,
    }
  }

  if (method === 'effort') {
    return {
      method,
      label: 'Сделать подходы тяжелее',
      description:
        'Можно оставить те же повторения и постепенно сместить усилие от лёгкого к более рабочему и тяжёлому.',
      targetSets: current.sets,
      targetReps: current.reps,
      targetRir: clamp(getEntryAverageRir(current) - 1, 0, 5),
      nextExerciseId,
    }
  }

  if (method === 'tempo') {
    return {
      method,
      label: 'Замедлить темп',
      description:
        'Следующий прогресс лучше сделать через более медленное и контролируемое выполнение.',
      targetSets: current.sets,
      targetReps: current.reps,
      targetRir: getEntryAverageRir(current),
      nextExerciseId,
    }
  }

  if (method === 'pause') {
    return {
      method,
      label: 'Добавить паузу',
      description:
        'Попробуй короткую паузу в самой сложной точке, чтобы усложнить движение без смены упражнения.',
      targetSets: current.sets,
      targetReps: current.reps,
      targetRir: getEntryAverageRir(current),
      nextExerciseId,
    }
  }

  if (method === 'range') {
    return {
      method,
      label: 'Увеличить амплитуду',
      description:
        'Если движение остаётся безопасным, следующий прогресс можно получить через чуть большую амплитуду.',
      targetSets: current.sets,
      targetReps: current.reps,
      targetRir: getEntryAverageRir(current),
      nextExerciseId,
    }
  }

  if (method === 'unilateral') {
    return {
      method,
      label: 'Перейти к одностороннему варианту',
      description:
        'Сложность можно поднять через работу по одной стороне.',
      targetSets: current.sets,
      targetReps: clamp(current.reps - 2, 6, 20),
      targetRir: getEntryAverageRir(current),
      nextExerciseId,
    }
  }

  return {
    method: 'variation',
    label: nextExerciseName
      ? `Перейти к варианту: ${nextExerciseName}`
      : 'Выбрать более сложный вариант',
    description:
      nextExerciseName
        ? `Достаточный прогресс уже набран, поэтому можно переходить к варианту "${nextExerciseName}".`
        : 'Следующий прогресс лучше делать через более сложную вариацию упражнения.',
    targetSets: current.sets,
    targetReps: clamp(current.reps - 2, 6, 20),
    targetRir: getEntryAverageRir(current),
    nextExerciseId,
  }
}

export function getProgressionSuggestion(
  exercise: Exercise,
  history: WorkoutHistoryEntry[],
  current: WorkoutExerciseEntry,
  exerciseMap?: Record<string, Exercise>,
): ProgressionSuggestion {
  const samples = getExerciseSamples(history, exercise.id)
  const recent = samples.slice(-5)
  const averageReps = average(recent.map((sample) => sample.reps))
  const averageSets = average(recent.map((sample) => sample.sets))
  const averageRir = average(recent.map((sample) => sample.rir))
  const plateau = analyzePlateau(samples)
  const nextVariantExerciseId = getNextVariantExerciseId(exercise, samples)
  const nextVariantName = nextVariantExerciseId
    ? exerciseMap?.[nextVariantExerciseId]?.name
    : undefined

  if (samples.length === 0) {
    return buildSuggestion('reps', current)
  }

  if (averageRir >= 3.5) {
    return buildSuggestion('effort', current)
  }

  if (plateau.isPlateau) {
    return buildSuggestion('pause', current)
  }

  if (averageReps < 14) {
    return buildSuggestion('reps', current)
  }

  if (nextVariantExerciseId) {
    return buildSuggestion(
      'variation',
      current,
      nextVariantExerciseId,
      nextVariantName,
    )
  }

  if (averageReps >= 16 && averageSets < 4) {
    return buildSuggestion('sets', current)
  }

  if (averageReps >= 17 && supportsTempo(exercise)) {
    return buildSuggestion('tempo', current)
  }

  if (
    (exercise.movementType === 'Приседание' ||
      exercise.movementType === 'Выпад' ||
      exercise.movementType === 'Наклон' ||
      exercise.movementType === 'Мост') &&
    averageReps >= 17
  ) {
    return buildSuggestion('range', current)
  }

  if (
    (exercise.movementType === 'Выпад' ||
      exercise.movementType === 'Подъём' ||
      exercise.movementType === 'Сгибание' ||
      exercise.movementType === 'Разгибание' ||
      exercise.movementType === 'Мост') &&
    averageReps >= 17
  ) {
    return buildSuggestion('unilateral', current)
  }

  return buildSuggestion('variation', current)
}
