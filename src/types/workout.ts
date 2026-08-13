export interface WorkoutExerciseEntry {
  exerciseId: string
  sets: number
  reps: number
  rir: number
  completed: boolean
  selectionScore?: number
  selectionReasons?: string[]
  progressionHint?: string
  progressionMethod?:
    | 'reps'
    | 'sets'
    | 'rir'
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
  source: 'generator'
  weekKey?: string
}
