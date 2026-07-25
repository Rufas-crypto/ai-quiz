const SITE_NAME = "今日のAIクイズ";
const CHOICE_KEYS = ["A", "B", "C", "D"];
const STORE_PREFIX = "aiquiz:";
const SEGMENT_STORE = "aiquiz:segment";

const SEGMENTS = [
  { id: "student", label: "学生", note: "AIの基礎をやさしく" },
  { id: "business", label: "一般企業", note: "仕事で使うAIの話" },
  { id: "it", label: "IT企業", note: "業界・製品の動向" },
  { id: "engineer", label: "IT技術者", note: "モデル・API・実装" },
];

function pad(n) {
  return String(n).padStart(2, "0");
}

// The site targets Japanese readers, so "today" is always JST regardless of the
// visitor's own clock.
function todayJst() {
  const now = new Date();
  const jst = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 9 * 3600000);
  return `${jst.getFullYear()}-${pad(jst.getMonth() + 1)}-${pad(jst.getDate())}`;
}

function formatDateJa(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = ["日", "月", "火", "水", "木", "金", "土"][new Date(y, m - 1, d).getDay()];
  return `${y}年${m}月${d}日(${wd})`;
}

function segmentLabel(id) {
  const found = SEGMENTS.find((s) => s.id === id);
  return found ? found.label : id;
}

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function sourceLine(source) {
  if (!source || !source.url) return null;
  const p = el("p", "source");
  p.append(document.createTextNode("出典: "));
  const link = el("a", null, source.title || source.url);
  link.href = source.url;
  link.target = "_blank";
  link.rel = "noopener nofollow";
  p.append(link);
  return p;
}

function readStore(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private browsing or a full quota: playing without persistence is fine.
  }
}

/* ---------- quiz page ---------- */

function initQuiz() {
  const root = document.getElementById("quiz-root");
  const tabsHost = document.getElementById("segment-tabs");
  const params = new URLSearchParams(location.search);

  let quiz = null;
  let date = null;
  let active = null;

  start();

  async function start() {
    let index;
    try {
      index = await fetchJson("data/index.json");
    } catch {
      fail("クイズの読み込みに失敗しました。時間をおいて再度お試しください。");
      return;
    }

    const dates = index.map((entry) => entry.date).sort().reverse();
    if (!dates.length) {
      fail("まだクイズが公開されていません。");
      return;
    }

    const today = todayJst();
    const requestedDate = params.get("date");
    if (requestedDate && dates.includes(requestedDate)) {
      date = requestedDate;
    } else if (dates.includes(today)) {
      date = today;
    } else {
      // Generation may have been skipped; fall back to the newest published day
      // so the page always has something playable.
      date = dates.find((d) => d <= today) || dates[0];
    }

    try {
      quiz = await fetchJson(`data/${date}.json`);
    } catch {
      fail("クイズの読み込みに失敗しました。時間をおいて再度お試しください。");
      return;
    }

    document.getElementById("quiz-date").textContent = `${formatDateJa(date)} の一問`;
    document.title = `${formatDateJa(date)}の一問 | ${SITE_NAME}`;

    if (date !== today) {
      const notice = document.getElementById("stale-notice");
      notice.textContent = requestedDate
        ? "過去の問題を表示しています。"
        : "本日の問題はまだ公開されていません。直近の問題を表示しています。";
      notice.classList.remove("hidden");
    }

    const available = SEGMENTS.filter((s) => quiz.questions[s.id]);
    if (!available.length) {
      fail("この日の問題データが不正です。");
      return;
    }

    const requestedSegment = params.get("level");
    const remembered = readStore(SEGMENT_STORE);
    active =
      (available.find((s) => s.id === requestedSegment) ||
        available.find((s) => s.id === remembered) ||
        available[0]).id;

    renderTabs(available);
    renderQuestion();
  }

  function fail(message) {
    root.replaceChildren(el("div", "card", message));
  }

  function renderTabs(available) {
    const list = el("div", "segment-tabs");
    available.forEach((seg) => {
      const btn = el("button", "segment-tab");
      btn.type = "button";
      btn.append(el("span", "segment-label", seg.label), el("span", "segment-note", seg.note));
      if (seg.id === active) btn.classList.add("is-active");
      btn.addEventListener("click", () => {
        if (active === seg.id) return;
        active = seg.id;
        writeStore(SEGMENT_STORE, active);
        renderTabs(available);
        renderQuestion();
      });
      list.append(btn);
    });
    tabsHost.replaceChildren(list);
  }

  function renderQuestion() {
    const q = quiz.questions[active];
    const storeKey = `${STORE_PREFIX}${date}:${active}`;
    const saved = readStore(storeKey);

    const card = el("div", "card");
    card.append(el("p", "level-badge", `${segmentLabel(active)}向け`));
    card.append(el("p", "question", q.q));

    const choices = el("div", "choices");
    const buttons = q.choices.map((text, i) => {
      const btn = el("button", "choice");
      btn.type = "button";
      btn.append(el("span", "choice-key", CHOICE_KEYS[i]), el("span", null, text));
      btn.addEventListener("click", () => {
        writeStore(storeKey, String(i));
        writeStore(SEGMENT_STORE, active);
        reveal(i);
      });
      return btn;
    });
    choices.append(...buttons);
    card.append(choices);

    root.replaceChildren(card);

    if (saved !== null && saved !== "") {
      const picked = Number(saved);
      if (Number.isInteger(picked) && picked >= 0 && picked < q.choices.length) {
        reveal(picked, true);
      }
    }

    function reveal(picked, restored) {
      buttons.forEach((btn, i) => {
        btn.disabled = true;
        if (i === q.answer) btn.classList.add("is-correct");
        else if (i === picked) btn.classList.add("is-wrong");
        else btn.classList.add("is-muted");
      });

      const ok = picked === q.answer;
      const feedback = el("div", "feedback");
      feedback.append(el("p", `verdict ${ok ? "ok" : "ng"}`, ok ? "正解" : "不正解"));
      feedback.append(el("p", "explanation", q.explanation));

      const source = sourceLine(q.source);
      if (source) feedback.append(source);

      if (restored) {
        feedback.append(el("p", "muted small", "この問題はすでに回答済みです。"));
      }

      const actions = el("div", "actions");

      // Score-free share text: nothing here should spoil the day's answer.
      const shareText = `${formatDateJa(date)}の${SITE_NAME}（${segmentLabel(
        active
      )}向け）に挑戦しました。`;
      const share = el("a", "btn", "Xでシェア");
      share.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
        shareText
      )}&url=${encodeURIComponent(location.origin + location.pathname)}`;
      share.target = "_blank";
      share.rel = "noopener";
      actions.append(share);

      const others = SEGMENTS.filter((s) => s.id !== active && quiz.questions[s.id]);
      if (others.length) {
        const next = el("button", "btn btn-ghost", "他の層の問題も解く");
        next.type = "button";
        next.addEventListener("click", () => {
          active = others[0].id;
          writeStore(SEGMENT_STORE, active);
          renderTabs(SEGMENTS.filter((s) => quiz.questions[s.id]));
          renderQuestion();
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
        actions.append(next);
      }

      feedback.append(actions);
      card.append(feedback);
    }
  }
}

/* ---------- archive page ---------- */

async function initArchive() {
  const root = document.getElementById("archive-root");
  let index;
  try {
    index = await fetchJson("data/index.json");
  } catch {
    root.replaceChildren(el("div", "card", "一覧の読み込みに失敗しました。"));
    return;
  }

  const entries = [...index].sort((a, b) => b.date.localeCompare(a.date));
  if (!entries.length) {
    root.replaceChildren(el("div", "card", "まだ公開済みの問題がありません。"));
    return;
  }

  const list = el("ul", "archive-list");
  entries.forEach((entry) => {
    const link = el("a");
    link.href = `index.html?date=${encodeURIComponent(entry.date)}`;
    const labels = (entry.segments || []).map(segmentLabel).join(" / ");
    link.append(
      el("span", "day", formatDateJa(entry.date)),
      el("span", "meta", labels || "")
    );
    const li = el("li");
    li.append(link);
    list.append(li);
  });

  root.replaceChildren(list);
}

const page = document.body.dataset.page;
if (page === "quiz") initQuiz();
else if (page === "archive") initArchive();
