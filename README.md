# 한국어 학습 도우미
### Помощник по корейскому языку — 재외동포를 위한 한국어 3-1 & 3-2

---

## Что внутри

- 📖 **문법** — Грамматика: все конструкции 3-1 и 3-2 с объяснением и практикой
- 🃏 **어휘** — Словарь: карточки + тест по каждому уроку, свои слова
- ✍️ **작문** — Сочинение: помощь, проверка с учётом пройденных конструкций
- 🔍 **교정** — Проверка: ошибки, перевод, разбор, косвенная речь
- 📊 **진도** — Прогресс: отслеживание по каждому уроку (Firebase)

---

## Шаг 1 — Firebase (хранение прогресса)

1. Зайди на [console.firebase.google.com](https://console.firebase.google.com)
2. Создай новый проект (например, `korean-study-app`)
3. В левом меню: **Build → Firestore Database → Create database**
   - Выбери **"Start in test mode"** → выбери регион → нажми Enable
4. В левом меню: **Project Overview → Add app → Web (`</>`)**
   - Введи название приложения
   - Скопируй объект `firebaseConfig`
5. Открой файл `src/firebase.js` и вставь свои данные вместо `REPLACE_WITH_...`

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:123...",
};
```

---

## Шаг 2 — GitHub репозиторий

1. Создай новый репозиторий на GitHub (например, `korean-study-app`)
2. Загрузи все файлы проекта в репозиторий
3. В настройках репо: **Settings → Pages**
   - Source: **GitHub Actions**

---

## Шаг 3 — Anthropic API ключ (для Claude)

1. Зайди на [console.anthropic.com](https://console.anthropic.com)
2. Создай API ключ
3. В GitHub репозитории: **Settings → Secrets and variables → Actions**
4. Добавь секрет: `VITE_ANTHROPIC_API_KEY` = твой ключ

> ⚠️ API ключ также нужно добавить в код — в файле `src/App.jsx`
> найди функцию `callClaude` и добавь заголовок авторизации:
> ```js
> headers: {
>   "Content-Type": "application/json",
>   "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
>   "anthropic-version": "2023-06-01",
>   "anthropic-dangerous-direct-browser-access": "true",
> }
> ```

---

## Шаг 4 — Настрой имя репозитория

В файле `vite.config.js` замени `korean-study-app` на название своего репо:

```js
base: "/korean-study-app/",  // ← своё название
```

---

## Шаг 5 — Деплой

После загрузки всех файлов на GitHub:
- GitHub Actions автоматически запустит сборку и деплой
- Через 1-2 минуты сайт будет доступен по адресу:
  `https://ВАШ_GITHUB_USERNAME.github.io/korean-study-app/`

### Локальный запуск (для разработки)
```bash
npm install
npm run dev
```

---

## Структура файлов

```
korean-study-app/
├── src/
│   ├── App.jsx       — главное приложение
│   ├── data.js       — весь контент учебников 3-1 и 3-2
│   ├── firebase.js   — конфиг Firebase
│   └── main.jsx      — точка входа React
├── index.html
├── vite.config.js    — замени base на название репо
├── package.json
└── .github/
    └── workflows/
        └── deploy.yml — автодеплой на GitHub Pages
```
