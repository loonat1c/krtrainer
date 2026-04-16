import { useState, useEffect, useRef } from "react";
import { CURRICULUM } from "./data.js";
import { db } from "./firebase.js";
import {
  doc, getDoc, setDoc, updateDoc, arrayUnion, increment, serverTimestamp
} from "firebase/firestore";

// ─────────────────────────────────────────────
// Claude API
// ─────────────────────────────────────────────
async function callClaude(system, user) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text || "Ошибка ответа";
}

// ─────────────────────────────────────────────
// Firebase helpers
// ─────────────────────────────────────────────
const USER_ID = "user_main"; // single-user app

async function loadProgress() {
  try {
    const snap = await getDoc(doc(db, "progress", USER_ID));
    return snap.exists() ? snap.data() : {};
  } catch { return {}; }
}

async function saveVocabResult(chapterId, wordKo, correct) {
  try {
    const ref = doc(db, "progress", USER_ID);
    const field = `vocab.${chapterId}.${wordKo}`;
    await setDoc(ref, {
      [field]: { correct, lastSeen: serverTimestamp() }
    }, { merge: true });
  } catch {}
}

async function saveGrammarPractice(chapterId, pattern) {
  try {
    const ref = doc(db, "progress", USER_ID);
    await setDoc(ref, {
      [`grammar_done.${chapterId}.${pattern}`]: serverTimestamp()
    }, { merge: true });
  } catch {}
}

async function saveCustomWords(words) {
  try {
    const ref = doc(db, "progress", USER_ID);
    await setDoc(ref, { customWords: words }, { merge: true });
  } catch {}
}

async function loadCustomWords() {
  try {
    const snap = await getDoc(doc(db, "progress", USER_ID));
    return snap.exists() ? (snap.data().customWords || []) : [];
  } catch { return []; }
}

// ─────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────
function LoadingDots() {
  return <div className="dots"><span /><span /><span /></div>;
}

function AIBox({ text, variant }) {
  return <div className={`ai-box ${variant || ""}`}>{text}</div>;
}

function getAllChapters(book) {
  return CURRICULUM[book].chapters;
}

// ─────────────────────────────────────────────
// Book + Chapter Selector
// ─────────────────────────────────────────────
function BookChapterSelector({ book, setBook, chapterId, setChapterId, progress }) {
  const chapters = getAllChapters(book);
  return (
    <>
      <div className="pill-row">
        {["3-1", "3-2"].map(b => (
          <button key={b} className={`pill ${book === b ? "on" : ""}`}
            onClick={() => { setBook(b); setChapterId(CURRICULUM[b].chapters[0].id); }}>
            {CURRICULUM[b].labelFull}
          </button>
        ))}
      </div>
      <div className="chapter-scroll">
        {chapters.map(ch => {
          const done = progress?.grammar_done?.[ch.id];
          return (
            <button key={ch.id}
              className={`ch-btn ${chapterId === ch.id ? "on" : ""}`}
              onClick={() => setChapterId(ch.id)}>
              <span className="ch-num">{book === "3-1" ? "3-1" : "3-2"} · {ch.chapterNum}과</span>
              <span className="ch-title">{ch.title}</span>
              <span className="ch-ru">{ch.titleRu}</span>
              {done && <span className="ch-done">✓</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────
// GRAMMAR TAB
// ─────────────────────────────────────────────
function GrammarTab({ progress }) {
  const [book, setBook] = useState("3-1");
  const [chapterId, setChapterId] = useState("3-1-1");
  const [gi, setGi] = useState(0);
  const [mode, setMode] = useState("card"); // card | explain | practice
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [exercise, setExercise] = useState("");
  const [ans, setAns] = useState("");

  const ch = getAllChapters(book).find(c => c.id === chapterId) || getAllChapters(book)[0];
  const g = ch.grammar[gi] || ch.grammar[0];

  useEffect(() => { setGi(0); setMode("card"); setResult(""); setExercise(""); }, [chapterId, book]);
  useEffect(() => { setMode("card"); setResult(""); setExercise(""); }, [gi]);

  async function explain() {
    setMode("explain"); setLoading(true); setResult("");
    const r = await callClaude(
      "Ты преподаватель корейского языка. Объясняй чётко и структурированно на русском языке. Всегда давай примеры с корейским и русским переводом.",
      `Учебник: 재외동포를 위한 한국어 ${book}\nУрок: «${ch.title}» — ${ch.titleRu}\n\nОбъясни конструкцию: ${g.pattern} (${g.meaning})\n\n1) Правило (простым языком)\n2) Структура образования\n3) 4 примера предложения с переводом\n4) Типичные ошибки и как их избежать`
    );
    setResult(r); setLoading(false);
  }

  async function practice() {
    setMode("practice"); setLoading(true); setExercise(""); setResult(""); setAns("");
    const r = await callClaude(
      "Ты преподаватель корейского. Создавай только упражнения, без вступлений и пояснений.",
      `Конструкция: ${g.pattern} (${g.meaning})\nТема урока: ${ch.titleRu}\n\nСоздай 4 упражнения на заполнение пропуска [___].\nФормат:\n1. Корейское предложение с [___] — перевод на русский\n2. ...\nИспользуй контекст темы «${ch.titleRu}».`
    );
    setExercise(r); setLoading(false);
  }

  async function check() {
    if (!ans.trim()) return;
    setLoading(true);
    const r = await callClaude(
      "Ты преподаватель корейского. Проверяй ответы студента детально, давай обратную связь на русском.",
      `Конструкция: ${g.pattern}\nУпражнения:\n${exercise}\nОтветы студента:\n${ans}\n\nПроверь каждый ответ, укажи правильно/неправильно, объясни ошибки.`
    );
    await saveGrammarPractice(chapterId, g.pattern);
    setResult(r); setLoading(false);
  }

  return (
    <div className="tab-body">
      <BookChapterSelector book={book} setBook={setBook}
        chapterId={chapterId} setChapterId={setChapterId} progress={progress} />

      <div className="unit-tag">
        <span className="tag-unit">{ch.unit}</span>
        <span className="tag-skill">📌 {ch.skill} · {ch.skillRu}</span>
      </div>

      {/* Grammar chips */}
      <div className="grammar-chips">
        {ch.grammar.map((gx, i) => (
          <button key={i} className={`chip ${gi === i ? "on" : ""}`} onClick={() => setGi(i)}>
            {gx.pattern}
          </button>
        ))}
      </div>

      {/* Grammar card */}
      <div className="g-card">
        <div className="g-pattern">{g.pattern}</div>
        <div className="g-meaning">{g.meaning}</div>
        <div className="g-block">
          <div className="g-label">Структура</div>
          <div className="g-struct">{g.structure}</div>
        </div>
        <div className="g-block">
          <div className="g-label">Пример</div>
          <div className="g-ex-ko">{g.example}</div>
          <div className="g-ex-ru">{g.exRu}</div>
        </div>
        {g.moreExamples?.map((ex, i) => (
          <div key={i} className="g-more">
            <span className="g-more-ko">{ex.ko}</span>
            <span className="g-more-ru">{ex.ru}</span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="btn-row">
        <button className="btn-main" onClick={explain} disabled={loading}>📖 Объяснение</button>
        <button className="btn-sec" onClick={practice} disabled={loading}>✏️ Практика</button>
      </div>

      {loading && <LoadingDots />}
      {!loading && mode === "explain" && result && <AIBox text={result} />}
      {!loading && mode === "practice" && exercise && (
        <>
          <AIBox text={exercise} variant="ex" />
          <textarea className="t-area"
            placeholder="Ответы: 1) ...  2) ...  3) ...  4) ..."
            rows={4} value={ans} onChange={e => setAns(e.target.value)} />
          <button className="btn-main" onClick={check} disabled={!ans.trim() || loading}>
            ✓ Проверить ответы
          </button>
          {result && <AIBox text={result} variant="check" />}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// VOCAB TAB
// ─────────────────────────────────────────────
function VocabTab({ progress }) {
  const [book, setBook] = useState("3-1");
  const [chapterId, setChapterId] = useState("3-1-1");
  const [mode, setMode] = useState("cards");
  const [cards, setCards] = useState([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [ans, setAns] = useState("");
  const [testRes, setTestRes] = useState(null);
  const [score, setScore] = useState({ c: 0, t: 0 });
  const [aiEx, setAiEx] = useState("");
  const [aiLoad, setAiLoad] = useState(false);
  const [customWords, setCustomWords] = useState([]);
  const [customInput, setCustomInput] = useState("");
  const [addingCustom, setAddingCustom] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const inputRef = useRef();

  const ch = getAllChapters(book).find(c => c.id === chapterId) || getAllChapters(book)[0];

  useEffect(() => {
    loadCustomWords().then(setCustomWords);
  }, []);

  const baseVocab = ch.vocab;
  const allCards = showCustom
    ? customWords
    : [...baseVocab].sort(() => Math.random() - 0.5);

  useEffect(() => {
    setCards([...baseVocab].sort(() => Math.random() - 0.5));
    setIdx(0); setFlipped(false); setAns(""); setTestRes(null);
    setAiEx(""); setScore({ c: 0, t: 0 }); setShowCustom(false);
  }, [chapterId, book]);

  const cur = cards[idx];

  function next() {
    setIdx(i => (i + 1) % cards.length);
    setFlipped(false); setAns(""); setTestRes(null); setAiEx("");
    setTimeout(() => inputRef.current?.focus(), 80);
  }

  async function checkAns() {
    if (!ans.trim() || !cur) return;
    const ok = ans.trim() === cur.ko;
    setTestRes(ok);
    setScore(s => ({ c: s.c + (ok ? 1 : 0), t: s.t + 1 }));
    await saveVocabResult(chapterId, cur.ko, ok);
  }

  async function getEx() {
    if (!cur) return;
    setAiLoad(true); setAiEx("");
    const r = await callClaude(
      "Ты преподаватель корейского. Давай короткие, живые примеры. Отвечай на русском.",
      `Слово: ${cur.ko} (${cur.ru})\nДай 2 примера предложения.\nФормат:\n한국어 문장\n→ Русский перевод`
    );
    setAiEx(r); setAiLoad(false);
  }

  async function addCustomWords() {
    if (!customInput.trim()) return;
    setAddingCustom(true);
    const r = await callClaude(
      "Ты языковой помощник. Отвечай ТОЛЬКО JSON массивом без markdown и пояснений.",
      `Преобразуй в JSON массив [{ko, ru}]. Слова: ${customInput}. Переводи в обе стороны. Верни только JSON.`
    );
    try {
      const parsed = JSON.parse(r.replace(/```json|```/g, "").trim());
      const updated = [...customWords, ...parsed];
      setCustomWords(updated);
      await saveCustomWords(updated);
    } catch {}
    setCustomInput(""); setAddingCustom(false);
  }

  function switchToCustom() {
    setCards([...customWords].sort(() => Math.random() - 0.5));
    setIdx(0); setFlipped(false); setAns(""); setTestRes(null); setAiEx("");
    setScore({ c: 0, t: 0 }); setShowCustom(true);
  }

  function switchToChapter() {
    setCards([...baseVocab].sort(() => Math.random() - 0.5));
    setIdx(0); setFlipped(false); setAns(""); setTestRes(null); setAiEx("");
    setScore({ c: 0, t: 0 }); setShowCustom(false);
  }

  if (!cur) return (
    <div className="tab-body">
      <BookChapterSelector book={book} setBook={setBook}
        chapterId={chapterId} setChapterId={setChapterId} progress={progress} />
      <p className="hint">Нет карточек. Добавь свои слова ниже.</p>
    </div>
  );

  return (
    <div className="tab-body">
      <BookChapterSelector book={book} setBook={setBook}
        chapterId={chapterId} setChapterId={setChapterId} progress={progress} />

      <div className="unit-tag">
        <span className="tag-unit">{ch.unit}</span>
        <span className="tag-skill">📝 {ch.skill}</span>
      </div>

      {/* Source toggle */}
      <div className="pill-row">
        <button className={`pill ${!showCustom ? "on" : ""}`} onClick={switchToChapter}>
          📚 Учебник ({baseVocab.length})
        </button>
        <button className={`pill ${showCustom ? "on" : ""}`} onClick={switchToCustom}
          disabled={customWords.length === 0}>
          ⭐ Мои слова ({customWords.length})
        </button>
      </div>

      {/* Mode toggle */}
      <div className="pill-row">
        <button className={`pill ${mode === "cards" ? "on" : ""}`} onClick={() => setMode("cards")}>🃏 Карточки</button>
        <button className={`pill ${mode === "test" ? "on" : ""}`} onClick={() => setMode("test")}>✏️ Тест</button>
      </div>

      <div className="card-meta">
        {idx + 1} / {cards.length}
        {score.t > 0 && ` · ✅ ${score.c}/${score.t}`}
      </div>

      {mode === "cards" && (
        <>
          <div className={`flashcard ${flipped ? "flipped" : ""}`} onClick={() => setFlipped(!flipped)}>
            <div className="fc-front">
              <div className="fc-ko">{cur.ko}</div>
              <div className="fc-hint">нажми для перевода</div>
            </div>
            <div className="fc-back">
              <div className="fc-ru">{cur.ru}</div>
              <div className="fc-ko-sm">{cur.ko}</div>
            </div>
          </div>
          <div className="btn-row">
            <button className="btn-sec" onClick={getEx} disabled={aiLoad}>
              {aiLoad ? "…" : "💬 Примеры"}
            </button>
            <button className="btn-main" onClick={next}>Дальше →</button>
          </div>
          {aiEx && <AIBox text={aiEx} variant="small" />}
        </>
      )}

      {mode === "test" && (
        <>
          <div className="test-card">
            <div className="test-label">Как написать по-корейски?</div>
            <div className="test-word">{cur.ru}</div>
          </div>
          <input ref={inputRef} className="t-input"
            placeholder="한국어로 쓰세요..."
            value={ans} onChange={e => setAns(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !testRes && checkAns()}
            disabled={!!testRes} autoFocus />
          {!testRes && (
            <button className="btn-main" onClick={checkAns} disabled={!ans.trim()}>
              Проверить
            </button>
          )}
          {testRes !== null && (
            <div className={`fb ${testRes ? "ok" : "no"}`}>
              {testRes ? "✅ Правильно!" : `❌ Правильно: ${cur.ko}`}
            </div>
          )}
          {testRes !== null && (
            <button className="btn-main" onClick={next}>Дальше →</button>
          )}
        </>
      )}

      {/* Custom words panel */}
      <div className="custom-panel">
        <div className="custom-header">⭐ Добавить свои слова</div>
        <input className="t-input"
          placeholder="Слова через запятую (рус. или кор.)"
          value={customInput}
          onChange={e => setCustomInput(e.target.value)} />
        <button className="btn-sec" onClick={addCustomWords}
          disabled={!customInput.trim() || addingCustom}>
          {addingCustom ? "Загружаю…" : "➕ Добавить"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// WRITING TAB
// ─────────────────────────────────────────────
function WritingTab({ progress }) {
  const [book, setBook] = useState("3-1");
  const [chapterId, setChapterId] = useState("3-1-1");
  const [topic, setTopic] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [helpRes, setHelpRes] = useState("");
  const [checkRes, setCheckRes] = useState("");

  const ch = getAllChapters(book).find(c => c.id === chapterId) || getAllChapters(book)[0];
  const activeTopic = topic || customTopic;

  useEffect(() => { setTopic(""); setHelpRes(""); setCheckRes(""); }, [chapterId, book]);

  async function getHelp() {
    if (!activeTopic) return;
    setLoading(true); setHelpRes("");
    const gramList = ch.grammar.map(g => g.pattern).join(", ");
    const r = await callClaude(
      "Ты преподаватель корейского языка. Помогай студентам писать сочинения. Отвечай на русском языке.",
      `Учебник: 재외동포를 위한 한국어 ${book}\nУрок: «${ch.title}» (${ch.titleRu})\nПройденные конструкции: ${gramList}\nТема сочинения: "${activeTopic}"\n\nДай студенту:\n1) План сочинения (3-4 пункта)\n2) Полезные слова и фразы с переводом\n3) Образец абзаца на корейском с переводом\n4) Конструкции, которые стоит использовать`
    );
    setHelpRes(r); setLoading(false);
  }

  async function checkWriting() {
    if (!text.trim()) return;
    setLoading(true); setCheckRes("");
    const gramList = ch.grammar.map(g => g.pattern).join(", ");
    const r = await callClaude(
      "Ты опытный преподаватель корейского языка. Давай подробную, конструктивную обратную связь на русском.",
      `Учебник: 재외동포를 위한 한국어 ${book}\nУрок: «${ch.title}» (${ch.titleRu})\nПройденные конструкции: ${gramList}\nТема: "${activeTopic || "свободная тема"}"\n\nТекст студента:\n${text}\n\nПроверь и дай обратную связь:\n1) ✅ Что сделано хорошо\n2) ❌ Грамматические ошибки с исправлениями\n3) 📌 Использование пройденных конструкций (${gramList})\n4) 💡 Предложения по стилю\n5) 📝 Исправленная версия`
    );
    setCheckRes(r); setLoading(false);
  }

  return (
    <div className="tab-body">
      <BookChapterSelector book={book} setBook={setBook}
        chapterId={chapterId} setChapterId={setChapterId} progress={progress} />

      <div className="unit-tag">
        <span className="tag-unit">{ch.unit}</span>
        <span className="tag-skill">✍️ {ch.skill}</span>
      </div>

      <p className="hint">Темы из учебника:</p>
      <div className="topic-list">
        {ch.writingTopics.map(t => (
          <button key={t} className={`topic-chip ${topic === t ? "on" : ""}`}
            onClick={() => { setTopic(t); setCustomTopic(""); }}>
            {t}
          </button>
        ))}
      </div>

      <input className="t-input" placeholder="Или своя тема…"
        value={customTopic}
        onChange={e => { setCustomTopic(e.target.value); setTopic(""); }} />

      <button className="btn-sec"
        onClick={getHelp} disabled={!activeTopic || loading}>
        💡 Помощь с темой
      </button>

      {loading && <LoadingDots />}
      {!loading && helpRes && <AIBox text={helpRes} />}

      <textarea className="t-area big"
        placeholder="Напишите сочинение на корейском языке…"
        rows={9} value={text} onChange={e => setText(e.target.value)} />

      <button className="btn-main"
        onClick={checkWriting} disabled={!text.trim() || loading}>
        🔍 Проверить сочинение
      </button>
      {!loading && checkRes && <AIBox text={checkRes} variant="check" />}
    </div>
  );
}

// ─────────────────────────────────────────────
// CHECK TAB
// ─────────────────────────────────────────────
function CheckTab() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState("errors");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  async function run() {
    if (!text.trim()) return;
    setLoading(true); setResult("");
    const prompts = {
      errors: `Проверь корейский текст:\n\n${text}\n\n1) Грамматические ошибки с объяснением\n2) Лексические ошибки\n3) Исправленная версия`,
      translate: `Переведи на русский:\n\n${text}\n\n1) Литературный перевод\n2) Дословный (если отличается)\n3) Пояснения к интересным выражениям`,
      analyze: `Грамматический разбор:\n\n${text}\n\n1) Все конструкции и их значения\n2) Частицы и их роль\n3) Формы глаголов (основа + окончание)`,
      indirect: `Определи косвенную речь в тексте:\n\n${text}\n\n1) Выдели конструкции косвенной речи\n2) Объясни значение каждой\n3) Перефразируй в прямую речь`,
    };
    const r = await callClaude(
      "Ты преподаватель корейского языка уровня 재외동포를 위한 한국어 3. Отвечай на русском, структурированно и понятно.",
      prompts[mode]
    );
    setResult(r); setLoading(false);
  }

  return (
    <div className="tab-body">
      <div className="pill-row wrap">
        <button className={`pill ${mode === "errors" ? "on" : ""}`} onClick={() => setMode("errors")}>🔍 Ошибки</button>
        <button className={`pill ${mode === "translate" ? "on" : ""}`} onClick={() => setMode("translate")}>🌐 Перевод</button>
        <button className={`pill ${mode === "analyze" ? "on" : ""}`} onClick={() => setMode("analyze")}>📐 Разбор</button>
        <button className={`pill ${mode === "indirect" ? "on" : ""}`} onClick={() => setMode("indirect")}>💬 Коcв. речь</button>
      </div>

      <textarea className="t-area big"
        placeholder="Вставь корейский текст для проверки…"
        rows={7} value={text} onChange={e => setText(e.target.value)} />

      <button className="btn-main" onClick={run} disabled={!text.trim() || loading}>
        {mode === "errors" ? "Найти ошибки"
          : mode === "translate" ? "Перевести"
          : mode === "analyze" ? "Разобрать"
          : "Найти косв. речь"}
      </button>

      {loading && <LoadingDots />}
      {!loading && result && <AIBox text={result} />}
    </div>
  );
}

// ─────────────────────────────────────────────
// PROGRESS TAB
// ─────────────────────────────────────────────
function ProgressTab({ progress }) {
  const allChapters31 = getAllChapters("3-1");
  const allChapters32 = getAllChapters("3-2");

  function getVocabStats(chId, vocab) {
    const chData = progress?.vocab?.[chId] || {};
    const total = vocab.length;
    const done = Object.values(chData).filter(v => v.correct).length;
    return { done, total };
  }

  function renderBook(book, chapters) {
    return (
      <div className="prog-book">
        <div className="prog-book-title">{CURRICULUM[book].labelFull}</div>
        {chapters.map(ch => {
          const gramDone = Object.keys(progress?.grammar_done?.[ch.id] || {}).length;
          const gramTotal = ch.grammar.length;
          const { done: vDone, total: vTotal } = getVocabStats(ch.id, ch.vocab);
          return (
            <div key={ch.id} className="prog-row">
              <div className="prog-ch">
                <span className="prog-num">{ch.chapterNum}과</span>
                <span className="prog-name">{ch.title}</span>
              </div>
              <div className="prog-bars">
                <div className="prog-bar-row">
                  <span className="prog-bar-label">문법</span>
                  <div className="prog-bar">
                    <div className="prog-fill gram"
                      style={{ width: `${gramTotal ? (gramDone / gramTotal) * 100 : 0}%` }} />
                  </div>
                  <span className="prog-count">{gramDone}/{gramTotal}</span>
                </div>
                <div className="prog-bar-row">
                  <span className="prog-bar-label">어휘</span>
                  <div className="prog-bar">
                    <div className="prog-fill vocab"
                      style={{ width: `${vTotal ? (vDone / vTotal) * 100 : 0}%` }} />
                  </div>
                  <span className="prog-count">{vDone}/{vTotal}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="tab-body">
      <p className="hint" style={{ marginBottom: 8 }}>
        Прогресс по учебникам 3-1 и 3-2
      </p>
      {renderBook("3-1", allChapters31)}
      {renderBook("3-2", allChapters32)}
    </div>
  );
}

// ─────────────────────────────────────────────
// APP
// ─────────────────────────────────────────────
const TABS = [
  { id: "grammar", ko: "문법", ru: "Грамматика", icon: "📖" },
  { id: "vocab",   ko: "어휘", ru: "Словарь",    icon: "🃏" },
  { id: "writing", ko: "작문", ru: "Сочинение",  icon: "✍️" },
  { id: "check",   ko: "교정", ru: "Проверка",   icon: "🔍" },
  { id: "progress",ko: "진도", ru: "Прогресс",   icon: "📊" },
];

export default function App() {
  const [tab, setTab] = useState("grammar");
  const [progress, setProgress] = useState({});

  useEffect(() => {
    loadProgress().then(setProgress);
  }, []);

  // Reload progress when switching to progress tab
  useEffect(() => {
    if (tab === "progress") loadProgress().then(setProgress);
  }, [tab]);

  return (
    <div className="root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&family=DM+Sans:wght@300;400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        :root{
          --bg:#0c0e1a;--s1:#14172a;--s2:#1c2038;--s3:#242848;--bdr:#2a2f52;
          --a1:#6c8eff;--a2:#ff7eb3;--a3:#52ddc8;--a4:#ffb347;
          --tx:#dde3f5;--tx2:#7a88aa;--tx3:#4a5270;
          --ok:#52ddc8;--no:#ff7eb3;--r:10px;
        }
        body{background:var(--bg);color:var(--tx);font-family:'DM Sans','Noto Sans KR',sans-serif;min-height:100vh}
        .root{display:flex;flex-direction:column;min-height:100vh;max-width:700px;margin:0 auto}

        /* HEADER */
        .hdr{padding:14px 16px 2px;text-align:center}
        .hdr-top{font-size:1.2rem;font-weight:600;font-family:'Noto Sans KR',sans-serif;
          background:linear-gradient(120deg,var(--a1),var(--a2));
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .hdr-sub{font-size:0.65rem;color:var(--tx2);margin-top:2px;font-weight:300}

        /* CONTENT */
        .content{flex:1;padding:10px 14px 80px;overflow-y:auto}
        .tab-body{display:flex;flex-direction:column;gap:10px}

        /* NAV */
        .nav{position:fixed;bottom:0;left:50%;transform:translateX(-50%);
          width:100%;max-width:700px;background:var(--s1);
          border-top:1px solid var(--bdr);display:flex;
          padding-bottom:env(safe-area-inset-bottom);z-index:99}
        .nv{flex:1;border:none;background:none;cursor:pointer;
          padding:8px 2px 6px;display:flex;flex-direction:column;
          align-items:center;gap:1px;font-family:inherit;color:var(--tx2);transition:color .2s}
        .nv.on{color:var(--a1)}
        .nv-icon{font-size:1.1rem}
        .nv-ko{font-size:0.63rem;font-family:'Noto Sans KR',sans-serif;font-weight:500}
        .nv-ru{font-size:0.52rem;font-weight:300}

        /* PILLS */
        .pill-row{display:flex;flex-wrap:wrap;gap:6px}
        .pill-row.wrap{flex-wrap:wrap}
        .pill{background:var(--s2);border:1px solid var(--bdr);color:var(--tx2);
          border-radius:20px;padding:5px 13px;font-size:0.72rem;
          font-family:inherit;cursor:pointer;transition:all .18s;white-space:nowrap}
        .pill.on{border-color:var(--a1);color:var(--a1);background:rgba(108,142,255,.12)}

        /* CHAPTER SCROLL */
        .chapter-scroll{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px;
          -webkit-overflow-scrolling:touch;scrollbar-width:none}
        .chapter-scroll::-webkit-scrollbar{display:none}
        .ch-btn{flex-shrink:0;background:var(--s2);border:1px solid var(--bdr);
          border-radius:var(--r);padding:8px 11px;cursor:pointer;
          font-family:inherit;text-align:left;transition:all .18s;
          min-width:140px;position:relative}
        .ch-btn.on{border-color:var(--a2);background:rgba(255,126,179,.1)}
        .ch-num{display:block;font-size:0.62rem;color:var(--tx2);margin-bottom:2px}
        .ch-title{display:block;font-size:0.78rem;color:var(--tx);
          font-family:'Noto Sans KR',sans-serif;font-weight:500}
        .ch-ru{display:block;font-size:0.62rem;color:var(--tx2);margin-top:2px;line-height:1.3}
        .ch-btn.on .ch-title{color:var(--a2)}
        .ch-done{position:absolute;top:6px;right:8px;font-size:0.65rem;color:var(--a3)}

        /* UNIT TAG */
        .unit-tag{display:flex;gap:8px;flex-wrap:wrap}
        .tag-unit{background:rgba(108,142,255,.15);color:var(--a1);
          border-radius:6px;padding:3px 10px;font-size:0.7rem;
          font-family:'Noto Sans KR',sans-serif}
        .tag-skill{font-size:0.7rem;color:var(--tx2)}

        /* GRAMMAR */
        .grammar-chips{display:flex;gap:6px;flex-wrap:wrap}
        .chip{background:var(--s2);border:1px solid var(--bdr);color:var(--tx2);
          border-radius:8px;padding:5px 11px;font-size:0.75rem;
          font-family:'Noto Sans KR',sans-serif;cursor:pointer;transition:all .18s}
        .chip.on{border-color:var(--a3);color:var(--a3);background:rgba(82,221,200,.1)}

        .g-card{background:var(--s2);border:1px solid var(--bdr);
          border-radius:var(--r);padding:14px;display:flex;flex-direction:column;gap:10px}
        .g-pattern{font-size:1.05rem;font-family:'Noto Sans KR',sans-serif;
          color:var(--a1);font-weight:600}
        .g-meaning{font-size:0.78rem;color:var(--tx2)}
        .g-block{background:var(--s3);border-radius:8px;padding:9px}
        .g-label{font-size:0.65rem;color:var(--tx3);margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px}
        .g-struct{font-size:0.78rem;color:var(--tx);font-family:'Noto Sans KR',sans-serif}
        .g-ex-ko{font-size:0.88rem;color:var(--tx);font-family:'Noto Sans KR',sans-serif}
        .g-ex-ru{font-size:0.74rem;color:var(--tx2);margin-top:2px}
        .g-more{display:flex;flex-direction:column;gap:2px;padding:6px 0;
          border-top:1px solid var(--bdr)}
        .g-more-ko{font-size:0.82rem;color:var(--tx);font-family:'Noto Sans KR',sans-serif}
        .g-more-ru{font-size:0.72rem;color:var(--tx2)}

        /* BUTTONS */
        .btn-row{display:flex;gap:8px}
        .btn-main{flex:1;background:var(--a1);border:none;color:#fff;
          border-radius:var(--r);padding:11px;font-size:0.83rem;
          font-weight:600;font-family:inherit;cursor:pointer;transition:opacity .2s}
        .btn-main:disabled{opacity:.35;cursor:not-allowed}
        .btn-sec{flex:1;background:var(--s2);border:1px solid var(--bdr);
          color:var(--tx);border-radius:var(--r);padding:11px;
          font-size:0.83rem;font-family:inherit;cursor:pointer;transition:all .2s}
        .btn-sec:disabled{opacity:.35;cursor:not-allowed}

        /* INPUTS */
        .t-input{width:100%;background:var(--s2);border:1px solid var(--bdr);
          color:var(--tx);border-radius:var(--r);padding:10px 12px;
          font-size:0.9rem;font-family:'Noto Sans KR',sans-serif;transition:border-color .2s}
        .t-input:focus{outline:none;border-color:var(--a1)}
        .t-area{width:100%;background:var(--s2);border:1px solid var(--bdr);
          color:var(--tx);border-radius:var(--r);padding:10px 12px;
          font-size:0.84rem;font-family:'Noto Sans KR',sans-serif;
          resize:vertical;transition:border-color .2s}
        .t-area:focus{outline:none;border-color:var(--a1)}
        .t-area.big{min-height:150px}

        /* AI BOX */
        .ai-box{background:var(--s2);border:1px solid var(--bdr);
          border-radius:var(--r);padding:13px;font-size:0.79rem;
          line-height:1.8;white-space:pre-wrap;color:var(--tx)}
        .ai-box.ex{border-color:rgba(82,221,200,.3)}
        .ai-box.check{border-color:rgba(108,142,255,.4)}
        .ai-box.small{font-size:0.75rem;padding:10px}

        /* FLASHCARD */
        .card-meta{text-align:center;font-size:0.7rem;color:var(--tx2)}
        .flashcard{position:relative;height:165px;width:100%;cursor:pointer;perspective:1000px}
        .fc-front,.fc-back{position:absolute;inset:0;border-radius:14px;
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          gap:6px;backface-visibility:hidden;transition:transform .42s;
          padding:20px;border:1px solid var(--bdr);
          background:linear-gradient(135deg,var(--s2),var(--s3))}
        .fc-front{transform:rotateY(0)}
        .fc-back{transform:rotateY(180deg)}
        .flashcard.flipped .fc-front{transform:rotateY(-180deg)}
        .flashcard.flipped .fc-back{transform:rotateY(0)}
        .fc-ko{font-size:1.9rem;font-family:'Noto Sans KR',sans-serif;font-weight:500;color:var(--a1)}
        .fc-hint{font-size:0.63rem;color:var(--tx2)}
        .fc-ru{font-size:1.2rem;font-weight:600;color:var(--tx)}
        .fc-ko-sm{font-size:0.88rem;color:var(--tx2);font-family:'Noto Sans KR',sans-serif}

        /* TEST */
        .test-card{text-align:center;padding:18px 12px;background:var(--s2);
          border:1px solid var(--bdr);border-radius:var(--r)}
        .test-label{display:block;font-size:0.7rem;color:var(--tx2);margin-bottom:5px}
        .test-word{display:block;font-size:1.45rem;font-weight:600;color:var(--a2)}
        .fb{text-align:center;padding:11px;border-radius:var(--r);font-weight:600;font-size:0.84rem}
        .fb.ok{background:rgba(82,221,200,.15);color:var(--ok)}
        .fb.no{background:rgba(255,126,179,.15);color:var(--no)}

        /* CUSTOM */
        .custom-panel{margin-top:10px;border-top:1px solid var(--bdr);padding-top:12px;
          display:flex;flex-direction:column;gap:8px}
        .custom-header{font-size:0.75rem;color:var(--tx2)}

        /* WRITING */
        .hint{font-size:0.72rem;color:var(--tx2)}
        .topic-list{display:flex;flex-direction:column;gap:6px}
        .topic-chip{background:var(--s2);border:1px solid var(--bdr);color:var(--tx2);
          border-radius:var(--r);padding:9px 12px;font-size:0.77rem;
          font-family:inherit;cursor:pointer;text-align:left;
          transition:all .18s;line-height:1.35}
        .topic-chip.on{border-color:var(--a2);color:var(--a2);background:rgba(255,126,179,.1)}

        /* PROGRESS */
        .prog-book{display:flex;flex-direction:column;gap:6px;margin-bottom:16px}
        .prog-book-title{font-size:0.8rem;font-weight:600;color:var(--a1);
          padding:6px 0;border-bottom:1px solid var(--bdr);margin-bottom:4px}
        .prog-row{background:var(--s2);border:1px solid var(--bdr);
          border-radius:8px;padding:9px 11px}
        .prog-ch{display:flex;align-items:baseline;gap:8px;margin-bottom:6px}
        .prog-num{font-size:0.65rem;color:var(--tx2)}
        .prog-name{font-size:0.78rem;color:var(--tx);
          font-family:'Noto Sans KR',sans-serif}
        .prog-bars{display:flex;flex-direction:column;gap:4px}
        .prog-bar-row{display:flex;align-items:center;gap:6px}
        .prog-bar-label{font-size:0.62rem;color:var(--tx3);width:24px;
          font-family:'Noto Sans KR',sans-serif}
        .prog-bar{flex:1;height:6px;background:var(--s3);
          border-radius:3px;overflow:hidden}
        .prog-fill{height:100%;border-radius:3px;transition:width .3s}
        .prog-fill.gram{background:var(--a3)}
        .prog-fill.vocab{background:var(--a2)}
        .prog-count{font-size:0.62rem;color:var(--tx2);width:30px;text-align:right}

        /* LOADING */
        .dots{display:flex;justify-content:center;gap:6px;padding:16px}
        .dots span{width:7px;height:7px;border-radius:50%;
          background:var(--a1);animation:bl 1.1s infinite}
        .dots span:nth-child(2){animation-delay:.15s}
        .dots span:nth-child(3){animation-delay:.3s}
        @keyframes bl{0%,100%{opacity:.25;transform:scale(1)}50%{opacity:1;transform:scale(1.35)}}

        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:var(--bdr);border-radius:2px}
      `}</style>

      <header className="hdr">
        <div className="hdr-top">재외동포를 위한 한국어 · 3급</div>
        <div className="hdr-sub">Помощник по учебникам 3-1 и 3-2 · На русском языке</div>
      </header>

      <main className="content">
        {tab === "grammar"  && <GrammarTab progress={progress} />}
        {tab === "vocab"    && <VocabTab progress={progress} />}
        {tab === "writing"  && <WritingTab progress={progress} />}
        {tab === "check"    && <CheckTab />}
        {tab === "progress" && <ProgressTab progress={progress} />}
      </main>

      <nav className="nav">
        {TABS.map(t => (
          <button key={t.id} className={`nv ${tab === t.id ? "on" : ""}`}
            onClick={() => setTab(t.id)}>
            <span className="nv-icon">{t.icon}</span>
            <span className="nv-ko">{t.ko}</span>
            <span className="nv-ru">{t.ru}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
