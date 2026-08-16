export type EffortLevel = 'easy' | 'medium' | 'hard'

export interface WorkoutExerciseEntry {
  exerciseId: string
  sets: number
  reps: number
  rir: number
  completed: boolean
  completedSets?: number
  setEfforts?: EffortLevel[]
  selectionScore?: number
  selectionReasons?: string[]
  progressionHint?: string
  progressionMethod?:
    | 'reps'
    | 'sets'
    | 'effort'
    | 'tempo'
    | 'pause'
    | 'range'
    | 'unilateral'
    | 'variation'
}

export interface WorkoutDraft {
  title: string
  entries: WorkoutExerciseEntry[]
}

export interface WorkoutHistoryEntry {
  id: string
  date: string
  title: string
  entries: WorkoutExerciseEntry[]
}

export interface PlannedWorkoutEntry {
  id: string
  date: string
  title: string
  entries: WorkoutExerciseEntry[]
  source: 'generator' | 'manual'
  weekKey?: string
}
