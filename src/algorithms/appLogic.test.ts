import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { calculateEffectivenessScores } from './effectiveness.ts'
import { calculateRecoveryScores } from './recovery.ts'
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

function createHistoryEntry(
  id: string,
  date: string,
  exerciseId: string,
  reps: number,
): WorkoutHistoryEntry {
  return {
    id,
    date,
    title: `РўСЂРµРЅРёСЂРѕРІРєР° ${date}`,
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

function getRecoveryZone(exerciseId: string) {
  const exercise = exercises.find((item) => item.id === exerciseId)
  expect(exercise).toBeDefined()

  const zoneScores = {
    push:
      (exercise!.muscles.chest ?? 0) +
      (exercise!.muscles.triceps ?? 0) +
      (exercise!.muscles['front-delts'] ?? 0) * 0.85,
    pull:
      (exercise!.muscles.lats ?? 0) +
      (exercise!.muscles['upper-back'] ?? 0) +
      (exercise!.muscles['rear-delts'] ?? 0) * 0.7 +
      (exercise!.muscles.biceps ?? 0) +
      (exercise!.muscles.forearms ?? 0) * 0.5,
    shoulders:
      (exercise!.muscles['front-delts'] ?? 0) +
      (exercise!.muscles['side-delts'] ?? 0) +
      (exercise!.muscles['rear-delts'] ?? 0),
    legs: (exercise!.muscles.quadriceps ?? 0) + (exercise!.muscles.calves ?? 0),
    'posterior-chain':
      (exercise!.muscles.glutes ?? 0) +
      (exercise!.muscles.hamstrings ?? 0) +
      (exercise!.muscles['lower-back'] ?? 0) * 0.65,
    core:
      (exercise!.muscles.abs ?? 0) +
      (exercise!.muscles['lower-back'] ?? 0) * 0.35,
    arms:
      (exercise!.muscles.biceps ?? 0) +
      (exercise!.muscles.triceps ?? 0) +
      (exercise!.muscles.forearms ?? 0),
  }

  return Object.entries(zoneScores).sort((left, right) => right[1] - left[1])[0]?.[0]
}

describe('Workout app logic', () => {
  it('uses only allowed equipment', () => {
    expect(exercises.length).toBeGreaterThanOrEqual(35)

    const uniqueEquipment = new Set(exercises.map((exercise) => exercise.equipment))
    expect(uniqueEquipment.size).toBe(3)
  })

  it('does not suggest increasing dumbbell weight', () => {
    const progressionSource = readFileSync(
      resolve(process.cwd(), 'src/algorithms/progression.ts'),
      'utf8',
    )

    expect(progressionSource).not.toMatch(/РєСѓРїРёС‚СЊ/i)
    expect(progressionSource).not.toMatch(/СѓРІРµР»РёС‡РµРЅРё[РµСЏ]\s+РІРµСЃ/i)
    expect(progressionSource).not.toMatch(/Р±РѕР»СЊС€[Р°-СЏ]*\s+РІРµСЃ/i)
    expect(progressionSource).not.toMatch(/С‚СЏР¶[РµС‘]Р»[Р°-СЏ]*\s+РіР°РЅС‚РµР»/i)
  })

  it('keeps exercise names in Cyrillic', () => {
    for (const exercise of exercises) {
      expect(/\p{Script=Cyrillic}/u.test(exercise.name)).toBe(true)
    }
  })

  it('creates workouts only for Monday, Wednesday, and Friday', () => {
    const weekDates = getWeekTrainingDates(TODAY)
    expect(weekDates).toEqual(['2026-08-10', '2026-08-12', '2026-08-14'])

    const plans = generateWeeklyWorkoutPlans(exercises, muscleGroups, [], TODAY)
    expect(plans.length).toBe(2)

    for (const plan of plans) {
      expect([1, 3, 5]).toContain(new Date(`${plan.date}T00:00:00`).getDay())
    }
  })

  it('boosts score for exercises with good progress', () => {
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

  it('gradually lowers score for plateaued exercises', () => {
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

  it('allows old exercises to return after a pause', () => {
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

  it('distributes muscle load without overloading one primary muscle', () => {
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

  it('alternates recovery zones and keeps one zone from dominating the workout', () => {
    const firstPlan = generateWeeklyWorkoutPlans(exercises, muscleGroups, [], TODAY)[0]

    expect(firstPlan).toBeDefined()
    expect(firstPlan.entries.length).toBeGreaterThanOrEqual(5)

    const recoveryZones = firstPlan.entries.map((entry) => getRecoveryZone(entry.exerciseId))
    const zoneCounts = new Map<string, number>()

    for (let index = 0; index < recoveryZones.length; index += 1) {
      const zone = recoveryZones[index]
      expect(zone).toBeDefined()
      zoneCounts.set(zone!, (zoneCounts.get(zone!) ?? 0) + 1)

      if (index > 0) {
        expect(recoveryZones[index - 1]).not.toBe(zone)
      }
    }

    expect(Math.max(...zoneCounts.values())).toBeLessThanOrEqual(2)
  })

  it('shows daily recovery gain and days until full recovery', () => {
    const recoveryHistory = [
      createHistoryEntry('rec-1', '2026-08-11', 'push-ups-classic', 18),
    ]
    const exerciseMap = Object.fromEntries(exercises.map((exercise) => [exercise.id, exercise]))
    const chestRecovery = calculateRecoveryScores(
      recoveryHistory,
      exerciseMap,
      muscleGroups,
      TODAY,
    ).find((item) => item.muscleId === 'chest')

    expect(chestRecovery).toBeDefined()
    expect(chestRecovery!.dailyRecoveryGain).toBeGreaterThanOrEqual(0)
    expect(chestRecovery!.daysToFullRecovery).toBeGreaterThanOrEqual(0)
  })

  it('keeps calendar statuses aligned with workouts', () => {
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

  it('creates the next weekly plan after Sunday', () => {
    const sunday = '2026-08-16'
    const plans = generateWeeklyWorkoutPlans(exercises, muscleGroups, [], sunday)

    expect(plans.map((plan) => plan.date)).toEqual([
      '2026-08-17',
      '2026-08-19',
      '2026-08-21',
    ])
  })

  it('does not repeat exercises from a completed Monday on Wednesday and Friday', () => {
    const mondayHistory: WorkoutHistoryEntry = {
      id: 'monday-1',
      date: '2026-08-17',
      title: 'РўСЂРµРЅРёСЂРѕРІРєР° 2026-08-17',
      entries: [
        {
          exerciseId: 'push-ups-classic',
          sets: 3,
          reps: 15,
          rir: 2,
          completed: true,
        },
        {
          exerciseId: 'bodyweight-squat',
          sets: 3,
          reps: 18,
          rir: 2,
          completed: true,
        },
        {
          exerciseId: 'plank',
          sets: 3,
          reps: 10,
          rir: 2,
          completed: true,
        },
      ],
    }

    const plans = generateWeeklyWorkoutPlans(
      exercises,
      muscleGroups,
      [mondayHistory],
      '2026-08-18',
    )

    expect(plans.map((plan) => plan.date)).toEqual(['2026-08-19', '2026-08-21'])

    const mondayExerciseIds = new Set(mondayHistory.entries.map((entry) => entry.exerciseId))

    for (const plan of plans) {
      for (const entry of plan.entries) {
        expect(mondayExerciseIds.has(entry.exerciseId)).toBe(false)
      }
    }
  })

  it('includes muscle need reasons in generated workouts', () => {
    const plans = generateWeeklyWorkoutPlans(exercises, muscleGroups, [], TODAY)
    const firstPlan = plans[0]

    expect(firstPlan).toBeDefined()
    expect(firstPlan.entries.length).toBeGreaterThan(0)
    expect(
      firstPlan.entries.some((entry) =>
        entry.selectionReasons?.some((reason) => reason.includes('Muscle Need')),
      ),
    ).toBe(true)
  })
})
