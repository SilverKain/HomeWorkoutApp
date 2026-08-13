import type { Exercise } from '../types/exercise.ts'
import type { WorkoutDraft, WorkoutExerciseEntry } from '../types/workout.ts'
import { getDefaultSetEfforts } from './effort.ts'

export function createWorkoutEntry(exerciseId: string): WorkoutExerciseEntry {
  return {
    exerciseId,
    sets: 3,
    reps: 10,
    rir: 2,
    completed: false,
    completedSets: 0,
    setEfforts: getDefaultSetEfforts(3),
  }
}

export function createWorkoutDraft(selectedExercises: Exercise[]): WorkoutDraft {
  return {
    title: 'Тренировка на сегодня',
    entries: selectedExercises.map((exercise) => createWorkoutEntry(exercise.id)),
  }
}
