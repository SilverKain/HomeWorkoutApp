import type { Exercise } from '../types/exercise.ts'
import type { MuscleGroup } from '../types/muscles.ts'
import type {
  PlannedWorkoutEntry,
  WorkoutExerciseEntry,
  WorkoutHistoryEntry,
} from '../types/workout.ts'
import { calculateEffectivenessScores } from './effectiveness.ts'
import { calculateMuscleNeedScores } from './needScore.ts'
import { getProgressionSuggestion } from './progression.ts'
import { getDefaultSetEfforts, getEffortLevelFromRir } from '../utils/effort.ts'

const TRAINING_DAY_INDEXES = new Set([1, 3, 5])
const MIN_EXERCISES_PER_WORKOUT = 5
const MAX_EXERCISES_PER_WORKOUT = 6

interface ScoredExercise {
  exercise: Exercise
  score: number
}

interface SelectionContext {
  exerciseMap: Record<string, Exercise>
  muscles: MuscleGroup[]
  todayIsoDate: string
  needScoreMap: Record<string, ReturnType<typeof calculateMuscleNeedScores>[number] | undefined>
  effectivenessMap: Record<string, ReturnType<typeof calculateEffectivenessScores>[number] | undefined>
  focusMuscleIds: string[]
}

function formatIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function getDateFromIso(isoDate: string) {
  return new Date(`${isoDate}T00:00:00`)
}

function addDays(isoDate: string, offset: number) {
  const date = getDateFromIso(isoDate)
  date.setDate(date.getDate() + offset)
  return formatIsoDate(date)
}

function startOfWeekMonday(isoDate: string) {
  const date = getDateFromIso(isoDate)
  const day = date.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + mondayOffset)
  return formatIsoDate(date)
}

export function getWeekTrainingDates(todayIsoDate: string) {
  const monday = startOfWeekMonday(todayIsoDate)
  const wednesday = addDays(monday, 2)
  const friday = addDays(monday, 4)

  return [monday, wednesday, friday]
}

function getNextWeekTrainingDates(todayIsoDate: string) {
  const nextWeekReferenceDate = addDays(startOfWeekMonday(todayIsoDate), 7)
  return getWeekTrainingDates(nextWeekReferenceDate)
}

export function getNextTrainingDate(todayIsoDate: string) {
  const currentDate = getDateFromIso(todayIsoDate)

  for (let offset = 1; offset <= 7; offset += 1) {
    const candidate = new Date(currentDate)
    candidate.setDate(currentDate.getDate() + offset)

    if (TRAINING_DAY_INDEXES.has(candidate.getDay())) {
      return formatIsoDate(candidate)
    }
  }

  return todayIsoDate
}

function buildExerciseMap(exercises: Exercise[]) {
  return Object.fromEntries(
    exercises.map((exercise) => [exercise.id, exercise]),
  ) as Record<string, Exercise>
}

function getTopMuscleReasons(
  exercise: Exercise,
  needScoreMap: SelectionContext['needScoreMap'],
) {
  return Object.entries(exercise.muscles)
    .filter(([, coefficient]) => (coefficient ?? 0) >= 0.45)
    .map(([muscleId, coefficient]) => ({
      muscleId,
      coefficient: coefficient ?? 0,
      needItem: needScoreMap[muscleId],
    }))
    .sort((left, right) => {
      const leftScore = (left.needItem?.score ?? 0) * left.coefficient
      const rightScore = (right.needItem?.score ?? 0) * right.coefficient
      return rightScore - leftScore
    })
    .slice(0, 2)
}

function daysBetween(fromIsoDate: string, toIsoDate: string) {
  const from = new Date(`${fromIsoDate}T00:00:00`)
  const to = new Date(`${toIsoDate}T00:00:00`)
  const millisecondsPerDay = 1000 * 60 * 60 * 24

  return Math.max(0, Math.round((to.getTime() - from.getTime()) / millisecondsPerDay))
}

function buildSelectionReasons(
  exercise: Exercise,
  context: SelectionContext,
  selectionNote?: string,
) {
  const reasons: string[] = []
  const effectivenessItem = context.effectivenessMap[exercise.id]
  const topMuscleReasons = getTopMuscleReasons(exercise, context.needScoreMap)

  topMuscleReasons.forEach(({ needItem }) => {
    if (!needItem) {
      return
    }

    if (needItem.score >= 72) {
      reasons.push(`${needItem.muscleName.toLowerCase()} сейчас в высоком приоритете по Muscle Need`)
    }

    if (needItem.recoveryScore >= 72) {
      reasons.push(`${needItem.muscleName.toLowerCase()} хорошо восстановлена`)
    }

    if (needItem.recentLoad7d <= 18) {
      reasons.push(`${needItem.muscleName.toLowerCase()} недополучила недельную нагрузку`)
    }
  })

  const focusedMuscles = topMuscleReasons
    .filter(({ muscleId }) => context.focusMuscleIds.includes(muscleId))
    .map(({ needItem }) => needItem?.muscleName)
    .filter((muscleName): muscleName is string => muscleName != null)

  if (focusedMuscles.length > 0) {
    reasons.push(`поддерживает фокус следующей тренировки: ${focusedMuscles.join(', ').toLowerCase()}`)
  }

  if (effectivenessItem?.goodProgress || (effectivenessItem?.progressScore ?? 0) >= 72) {
    reasons.push('в упражнении сохраняется прогресс')
  }

  if (effectivenessItem?.lastUsedDate == null) {
    reasons.push('упражнение ещё не использовалось и может дать новый отклик')
  } else {
    const daysSinceLastUse = daysBetween(
      effectivenessItem.lastUsedDate,
      context.todayIsoDate,
    )

    if (daysSinceLastUse >= 10) {
      reasons.push('упражнение давно не выполнялось')
    }
  }

  reasons.push(`подходит доступное оборудование: ${exercise.equipment.toLowerCase()}`)

  if (selectionNote) {
    reasons.unshift(selectionNote)
  }

  return Array.from(new Set(reasons)).slice(0, 5)
}

function calculateNeedDrivenExerciseScore(
  exercise: Exercise,
  needScores: ReturnType<typeof calculateMuscleNeedScores>,
  usedMuscleBias: Partial<Record<string, number>>,
) {
  return needScores.reduce((total, needItem) => {
    const coefficient = exercise.muscles[needItem.muscleId] ?? 0

    if (coefficient <= 0) {
      return total
    }

    const usedPenalty = (usedMuscleBias[needItem.muscleId] ?? 0) * 10
    const recoveryComponent = needItem.recoveryScore * 0.24
    const underloadComponent = Math.max(0, 100 - needItem.recentLoad7d * 4) * 0.18
    const demandComponent = needItem.score * 0.82

    return total + coefficient * Math.max(0, demandComponent + recoveryComponent + underloadComponent - usedPenalty)
  }, 0)
}

function buildWeeklyHistory(
  history: WorkoutHistoryEntry[],
  weekDates: string[],
) {
  const weekDateSet = new Set(weekDates)
  return history.filter((entry) => weekDateSet.has(entry.date))
}

function calculateUsedMuscleBias(
  weeklyHistory: WorkoutHistoryEntry[],
  exercises: Exercise[],
) {
  const exerciseMap = buildExerciseMap(exercises)
  const accumulator: Partial<Record<string, number>> = {}

  weeklyHistory.forEach((entry) => {
    entry.entries.forEach((item) => {
      if (!item.completed) {
        return
      }

      const exercise = exerciseMap[item.exerciseId]
      if (!exercise) {
        return
      }

      Object.entries(exercise.muscles).forEach(([muscleId, coefficient]) => {
        accumulator[muscleId] = (accumulator[muscleId] ?? 0) + (coefficient ?? 0)
      })
    })
  })

  return accumulator
}

function calculateUsedMuscleBiasFromEntries(
  entries: WorkoutExerciseEntry[],
  exercises: Exercise[],
) {
  const syntheticHistoryEntry: WorkoutHistoryEntry = {
    id: 'synthetic-week-load',
    date: '1970-01-01',
    title: 'Synthetic week load',
    entries,
  }

  return calculateUsedMuscleBias([syntheticHistoryEntry], exercises)
}

function createProjectedEntries(entries: WorkoutExerciseEntry[]) {
  return entries.map((entry) => ({
    ...entry,
    completed: true,
    completedSets: entry.sets,
  }))
}

function scoreExerciseForWeek(
  exercise: Exercise,
  needScores: ReturnType<typeof calculateMuscleNeedScores>,
  usedMuscleBias: Partial<Record<string, number>>,
  slotIndex: number,
) {
  const targetedNeed = calculateNeedDrivenExerciseScore(
    exercise,
    needScores,
    usedMuscleBias,
  )
  const diversityBonus = Object.keys(exercise.muscles).length * 2
  const movementBonus =
    slotIndex % 2 === 0
      ? exercise.baseEffectiveness * 20
      : exercise.baseEffectiveness * 18
  const fatiguePenalty = exercise.fatigueLevel * 2.5
  const focusBonus = needScores
    .slice(0, 3)
    .reduce((total, needItem) => total + (exercise.muscles[needItem.muscleId] ?? 0) * 18, 0)

  return targetedNeed + diversityBonus + movementBonus + focusBonus - fatiguePenalty
}

function calculateSelectionDisplayScore(
  exercise: Exercise,
  needScores: ReturnType<typeof calculateMuscleNeedScores>,
  effectivenessScore?: number,
) {
  const targetedNeed = needScores.reduce((total, needItem) => {
    const coefficient = exercise.muscles[needItem.muscleId] ?? 0

    if (coefficient <= 0) {
      return total
    }

    return total + coefficient * (needItem.score * 0.65 + needItem.recoveryScore * 0.35)
  }, 0)
  const normalizedNeed = Math.min(100, targetedNeed / 2.2)
  const normalizedEffectiveness = effectivenessScore ?? 60

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(normalizedNeed * 0.68 + normalizedEffectiveness * 0.32),
    ),
  )
}

function buildScoredExercises(
  exercises: Exercise[],
  needScores: ReturnType<typeof calculateMuscleNeedScores>,
  usedExerciseIds: Set<string>,
  usedMuscleBias: Partial<Record<string, number>>,
  slotIndex: number,
) {
  return exercises
    .filter((exercise) => !usedExerciseIds.has(exercise.id))
    .map((exercise) => ({
      exercise,
      score: scoreExerciseForWeek(exercise, needScores, usedMuscleBias, slotIndex),
    }))
    .sort((left, right) => right.score - left.score)
}

function getMuscleOverlapScore(left: Exercise, right: Exercise) {
  const muscleIds = new Set([
    ...Object.keys(left.muscles),
    ...Object.keys(right.muscles),
  ])
  let overlap = 0

  muscleIds.forEach((muscleId) => {
    overlap += Math.min(left.muscles[muscleId] ?? 0, right.muscles[muscleId] ?? 0)
  })

  return overlap
}

function getPrimaryMuscleId(exercise: Exercise) {
  return Object.entries(exercise.muscles).sort(
    (left, right) => (right[1] ?? 0) - (left[1] ?? 0),
  )[0]?.[0]
}

function getHighLoadMuscleIds(exercise: Exercise) {
  return Object.entries(exercise.muscles)
    .filter(([, coefficient]) => (coefficient ?? 0) >= 0.55)
    .map(([muscleId]) => muscleId)
}

function getEquipmentGroup(exercise: Exercise) {
  return /\d/.test(exercise.equipment) ? 'dumbbell' : 'bodyweight'
}

type RecoveryZone =
  | 'push'
  | 'pull'
  | 'shoulders'
  | 'legs'
  | 'posterior-chain'
  | 'core'
  | 'arms'

function getRecoveryZone(exercise: Exercise): RecoveryZone {
  const zoneScores: Record<RecoveryZone, number> = {
    push:
      (exercise.muscles.chest ?? 0) +
      (exercise.muscles.triceps ?? 0) +
      (exercise.muscles['front-delts'] ?? 0) * 0.85,
    pull:
      (exercise.muscles.lats ?? 0) +
      (exercise.muscles['upper-back'] ?? 0) +
      (exercise.muscles['rear-delts'] ?? 0) * 0.7 +
      (exercise.muscles.biceps ?? 0) +
      (exercise.muscles.forearms ?? 0) * 0.5,
    shoulders:
      (exercise.muscles['front-delts'] ?? 0) +
      (exercise.muscles['side-delts'] ?? 0) +
      (exercise.muscles['rear-delts'] ?? 0),
    legs: (exercise.muscles.quadriceps ?? 0) + (exercise.muscles.calves ?? 0),
    'posterior-chain':
      (exercise.muscles.glutes ?? 0) +
      (exercise.muscles.hamstrings ?? 0) +
      (exercise.muscles['lower-back'] ?? 0) * 0.65,
    core:
      (exercise.muscles.abs ?? 0) +
      (exercise.muscles['lower-back'] ?? 0) * 0.35,
    arms:
      (exercise.muscles.biceps ?? 0) +
      (exercise.muscles.triceps ?? 0) +
      (exercise.muscles.forearms ?? 0),
  }

  return (Object.entries(zoneScores).sort((left, right) => right[1] - left[1])[0]?.[0] ??
    'core') as RecoveryZone
}

function shouldReplaceWithAlternative(
  exerciseId: string,
  effectivenessMap: Record<string, ReturnType<typeof calculateEffectivenessScores>[number] | undefined>,
) {
  const item = effectivenessMap[exerciseId]

  if (!item) {
    return false
  }

  return (
    item.usageCount >= 4 &&
    !item.goodProgress &&
    item.progressScore <= 60 &&
    (item.plateauDetected || item.overusePenalty >= 8)
  )
}

function violatesDiversityRules(
  candidate: Exercise,
  selectedExercises: Exercise[],
  strict: boolean,
) {
  const primaryMuscleId = getPrimaryMuscleId(candidate)
  const candidateRecoveryZone = getRecoveryZone(candidate)
  const candidateHighLoadMuscles = new Set(getHighLoadMuscleIds(candidate))
  let samePatternCount = 0
  let samePrimaryMuscleCount = 0
  let sameRecoveryZoneCount = 0
  let similarMovementCount = 0
  let sameMovementTypeCount = 0
  let sameEquipmentCount = 0
  const candidateEquipmentGroup = getEquipmentGroup(candidate)
  const lastSelectedExercise = selectedExercises.at(-1)
  const consecutiveOverlapScore =
    lastSelectedExercise == null ? 0 : getMuscleOverlapScore(candidate, lastSelectedExercise)
  const consecutiveRecoveryZoneMatch =
    lastSelectedExercise != null &&
    getRecoveryZone(lastSelectedExercise) === candidateRecoveryZone
  const consecutiveMovementMatch =
    lastSelectedExercise != null &&
    lastSelectedExercise.movementType === candidate.movementType &&
    consecutiveOverlapScore >= 0.3

  for (const selected of selectedExercises) {
    const overlapScore = getMuscleOverlapScore(candidate, selected)
    const sharesPrimaryMuscle = primaryMuscleId != null && primaryMuscleId === getPrimaryMuscleId(selected)
    const sameMovement = selected.movementType === candidate.movementType
    const sharedHighLoadMuscle = getHighLoadMuscleIds(selected).some((muscleId) =>
      candidateHighLoadMuscles.has(muscleId),
    )

    if (sameMovement && overlapScore >= 0.85) {
      samePatternCount += 1
    }

    if (sharesPrimaryMuscle) {
      samePrimaryMuscleCount += 1
    }

    if (getRecoveryZone(selected) === candidateRecoveryZone) {
      sameRecoveryZoneCount += 1
    }

    if (sharedHighLoadMuscle && overlapScore >= 0.65) {
      similarMovementCount += 1
    }

    if (sameMovement) {
      sameMovementTypeCount += 1
    }

    if (getEquipmentGroup(selected) === candidateEquipmentGroup) {
      sameEquipmentCount += 1
    }
  }

  if (strict) {
    return (
      consecutiveRecoveryZoneMatch ||
      consecutiveMovementMatch ||
      samePatternCount >= 1 ||
      sameRecoveryZoneCount >= 2 ||
      samePrimaryMuscleCount >= 2 ||
      similarMovementCount >= 2 ||
      sameMovementTypeCount >= 2 ||
      (candidateEquipmentGroup === 'dumbbell' && sameEquipmentCount >= 3)
    )
  }

  return (
    samePatternCount >= 2 ||
    sameRecoveryZoneCount >= 3 ||
    samePrimaryMuscleCount >= 3 ||
    sameMovementTypeCount >= 3 ||
    (candidateEquipmentGroup === 'dumbbell' && sameEquipmentCount >= 4)
  )
}

function pickReplacementExercise(
  originalExercise: Exercise,
  scoredExercises: ScoredExercise[],
  usedExerciseIds: Set<string>,
  selectedExercises: Exercise[],
  effectivenessMap: Record<string, ReturnType<typeof calculateEffectivenessScores>[number] | undefined>,
  minimumOverlapScore: number,
) {
  const alternatives = scoredExercises
    .filter(({ exercise }) => {
      if (exercise.id === originalExercise.id || usedExerciseIds.has(exercise.id)) {
        return false
      }

      if (shouldReplaceWithAlternative(exercise.id, effectivenessMap)) {
        return false
      }

      if (getMuscleOverlapScore(originalExercise, exercise) < minimumOverlapScore) {
        return false
      }

      return !violatesDiversityRules(exercise, selectedExercises, true)
    })
    .map(({ exercise, score }) => ({
      exercise,
      score:
        score +
        getMuscleOverlapScore(originalExercise, exercise) * 30 +
        (effectivenessMap[exercise.id]?.score ?? 60) * 0.35 +
        (exercise.movementType !== originalExercise.movementType ? 6 : 0),
    }))
    .sort((left, right) => right.score - left.score)

  return alternatives[0]?.exercise
}

function resolvePlannedExercise(
  exercise: Exercise,
  scoredExercises: ScoredExercise[],
  usedExerciseIds: Set<string>,
  selectedExercises: Exercise[],
  effectivenessMap: Record<string, ReturnType<typeof calculateEffectivenessScores>[number] | undefined>,
) {
  const needsAlternative = shouldReplaceWithAlternative(exercise.id, effectivenessMap)
  const alreadyReserved = usedExerciseIds.has(exercise.id)
  const initialAlternative = needsAlternative
    ? pickReplacementExercise(
        exercise,
        scoredExercises,
        usedExerciseIds,
        selectedExercises,
        effectivenessMap,
        0.8,
      )
    : alreadyReserved
      ? pickReplacementExercise(
          exercise,
          scoredExercises,
          usedExerciseIds,
          selectedExercises,
          effectivenessMap,
          0.35,
        )
      : undefined
  const preferredExercise = initialAlternative ?? exercise

  if (!violatesDiversityRules(preferredExercise, selectedExercises, true)) {
    return {
      exercise: preferredExercise,
      selectionNote:
        initialAlternative != null
          ? needsAlternative
            ? `По упражнению "${exercise.name}" прогресс замедлился, поэтому вместо него выбран близкий вариант "${preferredExercise.name}".`
            : `Чтобы не дублировать "${exercise.name}" в этой тренировке, выбран близкий вариант "${preferredExercise.name}".`
          : undefined,
    }
  }

  const fallbackAlternative = scoredExercises.find(({ exercise: candidateExercise }) => {
    if (usedExerciseIds.has(candidateExercise.id)) {
      return false
    }

    if (shouldReplaceWithAlternative(candidateExercise.id, effectivenessMap)) {
      return false
    }

    return !violatesDiversityRules(candidateExercise, selectedExercises, false)
  })?.exercise

  return {
    exercise: fallbackAlternative,
    selectionNote:
      fallbackAlternative != null
        ? `Чтобы тренировка не состояла из слишком похожих движений, выбран более разнообразный вариант "${fallbackAlternative.name}".`
        : undefined,
  }
}

function createGeneratedEntry(
  exercise: Exercise,
  history: WorkoutHistoryEntry[],
  context: SelectionContext,
  emphasisScore: number,
  selectionNote?: string,
): WorkoutExerciseEntry {
  const draftEntry: WorkoutExerciseEntry = {
    exerciseId: exercise.id,
    sets: 3,
    reps: 10,
    rir: emphasisScore >= 80 ? 1 : emphasisScore >= 60 ? 2 : 3,
    completed: false,
    completedSets: 0,
    setEfforts: getDefaultSetEfforts(
      3,
      getEffortLevelFromRir(emphasisScore >= 80 ? 1 : emphasisScore >= 60 ? 2 : 3),
    ),
  }
  const suggestion = getProgressionSuggestion(
    exercise,
    history,
    draftEntry,
    context.exerciseMap,
  )
  const plannedExercise = suggestion.nextExerciseId
    ? context.exerciseMap[suggestion.nextExerciseId] ?? exercise
    : exercise
  const plannedDraftEntry: WorkoutExerciseEntry = {
    ...draftEntry,
    exerciseId: plannedExercise.id,
  }
  const resolvedSuggestion =
    plannedExercise.id === exercise.id
      ? suggestion
      : getProgressionSuggestion(
          plannedExercise,
          history,
          plannedDraftEntry,
          context.exerciseMap,
        )
  const selectionReasons = buildSelectionReasons(
    plannedExercise,
    context,
    selectionNote,
  )
  const selectionScore = calculateSelectionDisplayScore(
    plannedExercise,
    Object.values(context.needScoreMap).filter((item): item is NonNullable<typeof item> => item != null),
    context.effectivenessMap[plannedExercise.id]?.score,
  )

  return {
    ...plannedDraftEntry,
    sets: resolvedSuggestion.targetSets,
    reps: resolvedSuggestion.targetReps,
    rir: resolvedSuggestion.targetRir,
    setEfforts: getDefaultSetEfforts(
      resolvedSuggestion.targetSets,
      getEffortLevelFromRir(resolvedSuggestion.targetRir),
    ),
    selectionScore,
    selectionReasons,
    progressionHint: selectionNote
      ? `${selectionNote} ${resolvedSuggestion.description}`
      : resolvedSuggestion.description,
    progressionMethod: resolvedSuggestion.method,
  }
}

function buildWorkoutEntriesForDate(
  scoredExercises: ScoredExercise[],
  history: WorkoutHistoryEntry[],
  usedExerciseIds: Set<string>,
  context: SelectionContext,
) {
  const selectedExercises: Exercise[] = []
  const entries: WorkoutExerciseEntry[] = []
  const reservedExerciseIds = new Set(usedExerciseIds)

  function tryAppendEntry(
    exercise: Exercise,
    score: number,
    selectionNote: string | undefined,
    strict: boolean,
  ) {
    const generatedEntry = createGeneratedEntry(
      exercise,
      history,
      context,
      score,
      selectionNote,
    )
    const plannedExercise = context.exerciseMap[generatedEntry.exerciseId] ?? exercise

    if (violatesDiversityRules(plannedExercise, selectedExercises, strict)) {
      return false
    }

    selectedExercises.push(plannedExercise)
    reservedExerciseIds.add(exercise.id)
    reservedExerciseIds.add(plannedExercise.id)
    usedExerciseIds.add(exercise.id)
    usedExerciseIds.add(plannedExercise.id)
    entries.push(generatedEntry)

    return true
  }

  for (const candidate of scoredExercises) {
    if (entries.length >= MAX_EXERCISES_PER_WORKOUT) {
      break
    }

    const resolved = resolvePlannedExercise(
      candidate.exercise,
      scoredExercises,
      reservedExerciseIds,
      selectedExercises,
      context.effectivenessMap,
    )

    if (!resolved.exercise || reservedExerciseIds.has(resolved.exercise.id)) {
      continue
    }

    tryAppendEntry(
      resolved.exercise,
      candidate.score,
      resolved.selectionNote,
      true,
    )
  }

  if (entries.length >= MIN_EXERCISES_PER_WORKOUT) {
    return entries
  }

  for (const candidate of scoredExercises) {
    if (entries.length >= MIN_EXERCISES_PER_WORKOUT) {
      break
    }

    if (reservedExerciseIds.has(candidate.exercise.id)) {
      continue
    }

    tryAppendEntry(
      candidate.exercise,
      candidate.score,
      undefined,
      false,
    )
  }

  return entries
}

export function generateWorkoutPlan(
  exercises: Exercise[],
  muscles: MuscleGroup[],
  history: WorkoutHistoryEntry[],
  todayIsoDate: string,
): PlannedWorkoutEntry {
  return generateWeeklyWorkoutPlans(exercises, muscles, history, todayIsoDate)[0]
}

export function generateWeeklyWorkoutPlans(
  exercises: Exercise[],
  muscles: MuscleGroup[],
  history: WorkoutHistoryEntry[],
  todayIsoDate: string,
): PlannedWorkoutEntry[] {
  const exerciseMap = buildExerciseMap(exercises)
  const hasCompletedWorkoutToday = history.some(
    (entry) =>
      entry.date === todayIsoDate &&
      entry.entries.some((exerciseEntry) => exerciseEntry.completed),
  )
  const currentWeekDates = getWeekTrainingDates(todayIsoDate)
  const currentWeekActiveDates = currentWeekDates.filter((date) => {
    if (date > todayIsoDate) {
      return true
    }

    return date === todayIsoDate && !hasCompletedWorkoutToday
  })
  const weekDates =
    currentWeekActiveDates.length > 0
      ? currentWeekDates
      : getNextWeekTrainingDates(todayIsoDate)
  const activeDates =
    currentWeekActiveDates.length > 0
      ? currentWeekActiveDates
      : weekDates
  const weeklyHistory = buildWeeklyHistory(history, weekDates)
  const projectedWeekEntries = createProjectedEntries(
    weeklyHistory.flatMap((entry) => entry.entries.filter((exerciseEntry) => exerciseEntry.completed)),
  )
  const usedExerciseIds = new Set(
    projectedWeekEntries.map((entry) => entry.exerciseId),
  )
  const weekKey = weekDates[0]
  const effectivenessMap = Object.fromEntries(
    calculateEffectivenessScores(history, exercises, muscles, todayIsoDate).map((item) => [
      item.exerciseId,
      item,
    ]),
  ) as Record<string, ReturnType<typeof calculateEffectivenessScores>[number] | undefined>

  return activeDates.map((date, slotIndex) => {
    const usedMuscleBias = calculateUsedMuscleBiasFromEntries(
      projectedWeekEntries,
      exercises,
    )
    const needScores = calculateMuscleNeedScores(
      history,
      exerciseMap,
      muscles,
      date,
      projectedWeekEntries,
    )
    const scoredExercises = buildScoredExercises(
      exercises,
      needScores,
      usedExerciseIds,
      usedMuscleBias,
      slotIndex,
    )
    const needScoreMap = Object.fromEntries(
      needScores.map((item) => [item.muscleId, item]),
    ) as Record<string, (typeof needScores)[number] | undefined>
    const selectionContext: SelectionContext = {
      exerciseMap,
      muscles,
      todayIsoDate: date,
      needScoreMap,
      effectivenessMap,
      focusMuscleIds: needScores.slice(0, 3).map((item) => item.muscleId),
    }
    const entries = buildWorkoutEntriesForDate(
      scoredExercises,
      history,
      usedExerciseIds,
      selectionContext,
    )
    projectedWeekEntries.push(...createProjectedEntries(entries))

    return {
      id: `planned-${date}`,
      date,
      title: `Сгенерированная тренировка на ${date}`,
      entries,
      source: 'generator',
      weekKey,
    }
  })
}

