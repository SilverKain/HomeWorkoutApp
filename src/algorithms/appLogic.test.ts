import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { calculateEffectivenessScores } from './effectiveness.ts'
import { generateWeeklyWorkoutPlans, getWeekTrainingDates } from './workoutGenerator.ts'
import { exercises } from '../data/exercises.ts'
import { muscleGroups } from '../data/muscleGroups.ts'
import { buildMonthCalendar } from '../utils/calendar.ts'
import type { WorkoutHistoryEntry } from '../types/workout.ts'

const TODAY = '2026-08-12'

beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`))
})

afterAll(() => {
  vi.useRealTimers()
})
const ALLOWED_EQUIPMENT = new Set([
  'Собственный вес',
  '2 гантели по 1 кг',
  '1 гантель 1 кг',
])

function createHistoryEntry(
  id: string,
  date: string,
  exerciseId: string,
  reps: number,
): WorkoutHistoryEntry {
  return {
    id,
    date,
    title: `Тренировка ${date}`,
    entries: [
      {
        exerciseId,
        sets: 3,
        reps,
        rir: 2,
        completed: true,
      },
    ],
  }
}

function getExerciseScore(history: WorkoutHistoryEntry[], exerciseId: string) {
  const item = calculateEffectivenessScores(history, exercises, muscleGroups, TODAY).find(
    (scoreItem) => scoreItem.exerciseId === exerciseId,
  )

  expect(item).toBeDefined()
  return item!
}

describe('Пункт 32: логика приложения', () => {
  it('использует только собственный вес и гантели по 1 кг', () => {
    expect(exercises.length).toBeGreaterThanOrEqual(35)

    for (const exercise of exercises) {
      expect(ALLOWED_EQUIPMENT.has(exercise.equipment)).toBe(true)
    }
  })

  it('не содержит советов увеличивать вес', () => {
    const progressionSource = readFileSync(
      resolve(process.cwd(), 'src/algorithms/progression.ts'),
      'utf8',
    )

    expect(progressionSource).not.toMatch(/купить/i)
    expect(progressionSource).not.toMatch(/увеличени[ея]\s+вес/i)
    expect(progressionSource).not.toMatch(/больш[а-я]*\s+вес/i)
    expect(progressionSource).not.toMatch(/тяж[её]л[а-я]*\s+гантел/i)
  })

  it('все упражнения имеют русские названия', () => {
    for (const exercise of exercises) {
      expect(/\p{Script=Cyrillic}/u.test(exercise.name)).toBe(true)
    }
  })

  it('создаёт тренировки только на понедельник, среду и пятницу', () => {
    const weekDates = getWeekTrainingDates(TODAY)
    expect(weekDates).toEqual(['2026-08-10', '2026-08-12', '2026-08-14'])

    const plans = generateWeeklyWorkoutPlans(exercises, muscleGroups, [], TODAY)
    expect(plans.length).toBe(2)

    for (const plan of plans) {
      expect([1, 3, 5]).toContain(new Date(`${plan.date}T00:00:00`).getDay())
    }
  })

  it('хороший прогресс повышает рейтинг упражнения', () => {
    const progressiveHistory = [
      createHistoryEntry('p1', '2026-07-28', 'push-ups-classic', 10),
      createHistoryEntry('p2', '2026-08-01', 'push-ups-classic', 12),
      createHistoryEntry('p3', '2026-08-05', 'push-ups-classic', 15),
      createHistoryEntry('p4', '2026-08-10', 'push-ups-classic', 18),
    ]

    const emptyScore = getExerciseScore([], 'push-ups-classic')
    const progressiveScore = getExerciseScore(progressiveHistory, 'push-ups-classic')

    expect(progressiveScore.score).toBeGreaterThan(emptyScore.score)
    expect(progressiveScore.goodProgress).toBe(true)
    expect(progressiveScore.progressGain).toBeGreaterThanOrEqual(6)
  })

  it('застой постепенно снижает рейтинг', () => {
    const plateauHistory = [
      createHistoryEntry('s1', '2026-07-25', 'push-ups-classic', 15),
      createHistoryEntry('s2', '2026-07-29', 'push-ups-classic', 15),
      createHistoryEntry('s3', '2026-08-02', 'push-ups-classic', 14),
      createHistoryEntry('s4', '2026-08-06', 'push-ups-classic', 15),
      createHistoryEntry('s5', '2026-08-10', 'push-ups-classic', 15),
    ]
    const progressHistory = [
      createHistoryEntry('g1', '2026-07-28', 'push-ups-classic', 10),
      createHistoryEntry('g2', '2026-08-01', 'push-ups-classic', 12),
      createHistoryEntry('g3', '2026-08-05', 'push-ups-classic', 15),
      createHistoryEntry('g4', '2026-08-10', 'push-ups-classic', 18),
    ]

    const plateauScore = getExerciseScore(plateauHistory, 'push-ups-classic')
    const progressScore = getExerciseScore(progressHistory, 'push-ups-classic')

    expect(plateauScore.plateauDetected).toBe(true)
    expect(plateauScore.plateauPenalty).toBeGreaterThan(0)
    expect(plateauScore.score).toBeLessThan(progressScore.score)
  })

  it('старые упражнения могут вернуться после паузы', () => {
    const recentOveruseHistory = [
      createHistoryEntry('r1', '2026-07-22', 'push-ups-classic', 15),
      createHistoryEntry('r2', '2026-07-29', 'push-ups-classic', 15),
      createHistoryEntry('r3', '2026-08-01', 'push-ups-classic', 15),
      createHistoryEntry('r4', '2026-08-05', 'push-ups-classic', 15),
      createHistoryEntry('r5', '2026-08-10', 'push-ups-classic', 15),
    ]
    const cooledDownHistory = [
      createHistoryEntry('c1', '2026-06-20', 'push-ups-classic', 15),
      createHistoryEntry('c2', '2026-06-24', 'push-ups-classic', 15),
      createHistoryEntry('c3', '2026-06-28', 'push-ups-classic', 15),
      createHistoryEntry('c4', '2026-07-02', 'push-ups-classic', 15),
      createHistoryEntry('c5', '2026-07-04', 'push-ups-classic', 15),
    ]

    const recentScore = getExerciseScore(recentOveruseHistory, 'push-ups-classic')
    const cooledDownScore = getExerciseScore(cooledDownHistory, 'push-ups-classic')

    expect(recentScore.overusePenalty).toBeGreaterThan(0)
    expect(cooledDownScore.overusePenalty).toBe(0)
    expect(cooledDownScore.score).toBeGreaterThan(recentScore.score)
  })

  it('распределяет нагрузку по мышцам без перекоса в одной тренировке', () => {
    const plans = generateWeeklyWorkoutPlans(exercises, muscleGroups, [], TODAY)
    const firstPlan = plans[0]

    expect(firstPlan).toBeDefined()
    expect(firstPlan.entries.length).toBeGreaterThanOrEqual(5)

    const exerciseMap = Object.fromEntries(exercises.map((exercise) => [exercise.id, exercise]))
    const primaryMuscleCounts = new Map<string, number>()
    const movementTypes = new Set<string>()

    for (const entry of firstPlan.entries) {
      const exercise = exerciseMap[entry.exerciseId]
      expect(exercise).toBeDefined()
      movementTypes.add(exercise.movementType)
      const primaryMuscleId = Object.entries(exercise.muscles).sort(
        (left, right) => (right[1] ?? 0) - (left[1] ?? 0),
      )[0]?.[0]

      expect(primaryMuscleId).toBeDefined()
      primaryMuscleCounts.set(
        primaryMuscleId!,
        (primaryMuscleCounts.get(primaryMuscleId!) ?? 0) + 1,
      )
    }

    const distinctPrimaryMuscles = [...primaryMuscleCounts.keys()]
    expect(distinctPrimaryMuscles.length).toBeGreaterThanOrEqual(3)
    expect(movementTypes.size).toBeGreaterThanOrEqual(3)
    expect(Math.max(...primaryMuscleCounts.values())).toBeLessThanOrEqual(
      Math.ceil(firstPlan.entries.length / 2),
    )
  })

  it('календарь корректно связан с тренировками', () => {
    const history = [
      createHistoryEntry('k1', '2026-08-10', 'push-ups-classic', 15),
      createHistoryEntry('k2', '2026-08-12', 'bodyweight-squat', 18),
    ]
    const calendar = buildMonthCalendar(2026, 7, history)
    const completedDay = calendar.find((day) => day.isoDate === '2026-08-10')
    const todayDay = calendar.find((day) => day.isoDate === '2026-08-12')
    const plannedDay = calendar.find((day) => day.isoDate === '2026-08-14')
    const idleDay = calendar.find((day) => day.isoDate === '2026-08-11')

    expect(completedDay?.status).toBe('completed')
    expect(todayDay?.status).toBe('today')
    expect(plannedDay?.status).toBe('planned')
    expect(idleDay?.status).toBe('idle')
  })
})
