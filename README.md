# HomeWorkoutApp

Приложение домашних тренировок на `React + TypeScript + Vite`.

## Запуск

```bash
npm install
npm run dev
```

## Firebase

Firebase уже подключён на уровне проекта.

Что нужно сделать тебе:

1. Создай файл `.env` в корне проекта рядом с `package.json`.
2. Скопируй в него содержимое из `.env.example`.
3. Вставь значения из Firebase Console:
   `Project settings` -> `Your apps` -> `SDK setup and configuration` -> `Config`

Пример:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

`VITE_FIREBASE_MEASUREMENT_ID` не нужен, если ты не подключаешь Google Analytics.

Готовые файлы:

- `src/services/firebase.ts`
  Здесь инициализируется Firebase App.
- `src/services/index.ts`
  Здесь уже переэкспортированы Firebase-хелперы.

Готовые функции для импорта:

```ts
import {
  getFirebaseApp,
  getFirebaseAuth,
  getFirebaseDb,
  getFirebaseStorage,
  isFirebaseConfigured,
  getFirebaseConfigError,
} from './src/services'
```

Пример использования Firestore:

```ts
import { collection, getDocs } from 'firebase/firestore'
import { getFirebaseDb } from './src/services'

const db = getFirebaseDb()
const snapshot = await getDocs(collection(db, 'workouts'))
```

Если Firebase ещё не заполнен, `getFirebaseApp()` выбросит понятную ошибку с недостающими переменными.
