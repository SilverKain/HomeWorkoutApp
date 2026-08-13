import type { EffortLevel, WorkoutExerciseEntry } from '../types/workout.ts'

const effortToRirMap: Record<EffortLevel, number> = {
  easy: 3,
  medium: 2,
  hard: 1,
}

export const effortLabels: Record<EffortLevel, string> = {
  easy: 'Легко',
  medium: 'Средне',
  hard: 'Тяжело',
}

export function getDefaultSetEfforts(sets: number, fallback: EffortLevel = 'medium') {
  return Array.from({ length: Math.max(1, sets) }, () => fallback)
}

export function normalizeSetEfforts(
  entry: Pick<WorkoutExerciseEntry, 'sets' | 'setEfforts' | 'rir'>,
) {
  const fallback = getEffortLevelFromRir(entry.rir)
  const next = entry.setEfforts?.slice(0, entry.sets) ?? []

  while (next.length < entry.sets) {
    next.push(fallback)
  }

  return next
}

export function getEffortLevelFromRir(rir: number): EffortLevel {
  if (rir <= 1) {
    return 'hard'
  }

  if (rir <= 2) {
    return 'medium'
  }

  return 'easy'
}

export function getAverageRirFromEfforts(efforts: EffortLevel[]) {
  if (efforts.length === 0) {
    return 2
  }

  const total = efforts.reduce((sum, effort) => sum + effortToRirMap[effort], 0)
  return Number((total / efforts.length).toFixed(2))
}

export function getEntryAverageRir(entry: Pick<WorkoutExerciseEntry, 'setEfforts' | 'rir' | 'sets'>) {
  const efforts = normalizeSetEfforts(entry)
  return getAverageRirFromEfforts(efforts)
}

export function getEffortSummary(entry: Pick<WorkoutExerciseEntry, 'setEfforts' | 'rir' | 'sets'>) {
  const efforts = normalizeSetEfforts(entry)
  const unique = Array.from(new Set(efforts))

  if (unique.length === 1) {
    return effortLabels[unique[0]]
  }

  return `${effortLabels[efforts[0]]} -> ${effortLabels[efforts[efforts.length - 1]]}`
}
