export interface ExerciseVariantNode {
  exerciseId: string
  progressionGroup: string
  level: number
  label: string
  previousExerciseId?: string
  nextExerciseId?: string
}

export const exerciseVariantNodes: ExerciseVariantNode[] = [
  {
    exerciseId: 'push-ups-classic',
    progressionGroup: 'push-ups',
    level: 1,
    label: 'базовый вариант',
    nextExerciseId: 'push-ups-paused',
  },
  {
    exerciseId: 'push-ups-paused',
    progressionGroup: 'push-ups',
    level: 2,
    label: 'с паузой',
    previousExerciseId: 'push-ups-classic',
    nextExerciseId: 'push-ups-slow',
  },
  {
    exerciseId: 'push-ups-slow',
    progressionGroup: 'push-ups',
    level: 3,
    label: 'медленные',
    previousExerciseId: 'push-ups-paused',
    nextExerciseId: 'push-ups-close',
  },
  {
    exerciseId: 'push-ups-close',
    progressionGroup: 'push-ups',
    level: 4,
    label: 'узкие',
    previousExerciseId: 'push-ups-slow',
  },
  {
    exerciseId: 'bodyweight-squat',
    progressionGroup: 'squats',
    level: 1,
    label: 'обычные',
    nextExerciseId: 'bodyweight-squat-paused',
  },
  {
    exerciseId: 'bodyweight-squat-paused',
    progressionGroup: 'squats',
    level: 2,
    label: 'с паузой',
    previousExerciseId: 'bodyweight-squat',
    nextExerciseId: 'bodyweight-squat-slow',
  },
  {
    exerciseId: 'bodyweight-squat-slow',
    progressionGroup: 'squats',
    level: 3,
    label: 'медленные',
    previousExerciseId: 'bodyweight-squat-paused',
    nextExerciseId: 'bulgarian-split-squat',
  },
  {
    exerciseId: 'bulgarian-split-squat',
    progressionGroup: 'squats',
    level: 4,
    label: 'болгарские выпады',
    previousExerciseId: 'bodyweight-squat-slow',
  },
  {
    exerciseId: 'glute-bridge',
    progressionGroup: 'glute-bridge',
    level: 1,
    label: 'на двух ногах',
    nextExerciseId: 'single-leg-glute-bridge',
  },
  {
    exerciseId: 'single-leg-glute-bridge',
    progressionGroup: 'glute-bridge',
    level: 2,
    label: 'на одной ноге',
    previousExerciseId: 'glute-bridge',
  },
  {
    exerciseId: 'front-raises',
    progressionGroup: 'front-raises',
    level: 1,
    label: 'двумя руками',
    nextExerciseId: 'single-arm-front-raise',
  },
  {
    exerciseId: 'single-arm-front-raise',
    progressionGroup: 'front-raises',
    level: 2,
    label: 'одной рукой',
    previousExerciseId: 'front-raises',
  },
  {
    exerciseId: 'lateral-raises',
    progressionGroup: 'lateral-raises',
    level: 1,
    label: 'двумя руками',
    nextExerciseId: 'single-arm-lateral-raise',
  },
  {
    exerciseId: 'single-arm-lateral-raise',
    progressionGroup: 'lateral-raises',
    level: 2,
    label: 'одной рукой',
    previousExerciseId: 'lateral-raises',
  },
  {
    exerciseId: 'reverse-lunges',
    progressionGroup: 'lunges',
    level: 1,
    label: 'обратные выпады',
    nextExerciseId: 'bulgarian-split-squat',
  },
  {
    exerciseId: 'dumbbell-lunges',
    progressionGroup: 'dumbbell-lunges',
    level: 1,
    label: 'выпады с гантелями',
    nextExerciseId: 'bulgarian-split-squat-dumbbells',
  },
  {
    exerciseId: 'bulgarian-split-squat-dumbbells',
    progressionGroup: 'dumbbell-lunges',
    level: 2,
    label: 'болгарские выпады с гантелями',
    previousExerciseId: 'dumbbell-lunges',
  },
]

export const exerciseVariantMap = Object.fromEntries(
  exerciseVariantNodes.map((node) => [node.exerciseId, node]),
) as Record<string, ExerciseVariantNode | undefined>
