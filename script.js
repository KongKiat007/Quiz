let questions = [];
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzvst575HdJp-nlmZPjrv_aqUfCqBsL8r8JohKxoSrz8vrXLihuVtOgPtfyLTnvtivI/exec";
let answers = {};
let currentIndex = 0;
let studentName = "";
let startedAt = 0;
let timerInterval = null;

const $ = (id) => document.getElementById(id);
const startScreen = $("start-screen");
const quizScreen = $("quiz-screen");
const resultScreen = $("result-screen");

function parseCSV(text) {
  // รองรับ CSV ที่มี comma หรือเครื่องหมาย quote อยู่ในข้อความ
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(field); field = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some(cell => cell.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows.shift().map(h => h.replace(/^\uFEFF/, "").trim());
  return rows.map(values => {
    const item = {};
    headers.forEach((header, i) => item[header] = (values[i] || "").trim());
    return item;
  });
}

async function loadQuestions() {
  const response = await fetch("questions.csv");
  if (!response.ok) throw new Error("โหลด CSV ไม่สำเร็จ");
  const csvText = await response.text();
  const rows = parseCSV(csvText);
  questions = rows.map(row => ({
    id: row["ข้อ"],
    question: row["คำถาม"],
    choices: [
      { key: "ก", text: row["ตัวเลือก ก"] },
      { key: "ข", text: row["ตัวเลือก ข"] },
      { key: "ค", text: row["ตัวเลือก ค"] },
      { key: "ง", text: row["ตัวเลือก ง"] }
    ],
    answer: row["เฉลย"].trim()
  })).filter(q => q.question && q.answer);
  if (!questions.length) throw new Error("ไม่พบข้อมูลข้อสอบใน CSV");
}

function showQuestion() {
  const q = questions[currentIndex];
  $("progress").textContent = `ข้อ ${currentIndex + 1} / ${questions.length}`;
  $("progress-fill").style.width = `${((currentIndex + 1) / questions.length) * 100}%`;
  $("question").textContent = q.question;
  const choices = $("choices");
  choices.innerHTML = "";
  q.choices.forEach(choice => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice" + (answers[q.id] === choice.key ? " selected" : "");
    const letter = document.createElement("span");
    letter.className = "letter";
    letter.textContent = choice.key;
    const text = document.createElement("span");
    text.textContent = choice.text;
    button.append(letter, text);
    button.addEventListener("click", () => {
      answers[q.id] = choice.key;
      showQuestion();
    });
    choices.appendChild(button);
  });
  $("prev-btn").disabled = currentIndex === 0;
  $("next-btn").disabled = !answers[q.id];
  $("next-btn").textContent = currentIndex === questions.length - 1 ? "ส่งคำตอบ" : "ข้อถัดไป";
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}
function updateTimer() {
  $("timer").textContent = `เวลา ${formatTime(Math.floor((Date.now() - startedAt) / 1000))}`;
}

$("start-btn").addEventListener("click", async () => {
  studentName = $("name-input").value.trim();
  if (!studentName) { $("start-error").textContent = "กรุณากรอกชื่อผู้สอบ"; return; }
  $("start-error").textContent = "กำลังโหลดข้อสอบ...";
  try {
    await loadQuestions();
    answers = {};
    currentIndex = 0;
    startedAt = Date.now();
    startScreen.classList.add("hidden");
    resultScreen.classList.add("hidden");
    quizScreen.classList.remove("hidden");
    $("start-error").textContent = "";
    updateTimer();
    clearInterval(timerInterval);
    timerInterval = setInterval(updateTimer, 1000);
    showQuestion();
  } catch (error) {
    console.error(error);
    $("start-error").textContent = "โหลดข้อสอบไม่ได้ ให้เปิด index.html ผ่าน Live Server และตรวจว่า questions.csv อยู่ในโฟลเดอร์เดียวกัน";
  }
});

$("prev-btn").addEventListener("click", () => {
  if (currentIndex > 0) { currentIndex--; showQuestion(); }
});
$("next-btn").addEventListener("click", () => {
  if (!answers[questions[currentIndex].id]) return;
  if (currentIndex < questions.length - 1) {
    currentIndex++;
    showQuestion();
  } else finishQuiz();
});


async function finishQuiz() {
  clearInterval(timerInterval);

  const score = questions.reduce(
    (sum, q) => sum + (answers[q.id] === q.answer ? 1 : 0),
    0
  );

  const total = questions.length;
  const percentage = Math.round((score / total) * 100);
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  const time = formatTime(elapsed);

  quizScreen.classList.add("hidden");
  resultScreen.classList.remove("hidden");

  $("result-name").textContent = `ชื่อผู้สอบ: ${studentName}`;
  $("result-score").textContent = `${score}/${total}`;
  $("result-percent").textContent = `คิดเป็น ${percentage}%`;
  $("result-time").textContent = `ใช้เวลา ${time} นาที`;

  const saveStatus = $("save-status");
  saveStatus.textContent = "กำลังส่งผลสอบไป Google Sheets...";

  try {
    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        name: studentName,
        score: score,
        total: total,
        percentage: percentage,
        time: time
      })
    });

    saveStatus.textContent =
      "ส่งคำขอบันทึกผลสอบแล้ว กรุณาตรวจสอบ Google Sheets";
  } catch (error) {
    console.error("ส่งผลสอบไม่สำเร็จ:", error);
    saveStatus.textContent =
      "ส่งผลสอบไม่ได้ กรุณาตรวจสอบการเชื่อมต่อ";
  }
}
