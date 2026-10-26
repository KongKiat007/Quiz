
let questions = [];

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzvst575HdJp-nlmZPjrv_aqUfCqBsL8r8JohKxoSrz8vrXLihuVtOgPtfyLTnvtivI/exec";

let answers = {};
let submittedAnswers = {};
let currentIndex = 0;
let studentName = "";
let startedAt = 0;
let timerInterval = null;

const $ = (id) => document.getElementById(id);

const startScreen = $("start-screen");
const quizScreen = $("quiz-screen");
const resultScreen = $("result-screen");

// อ่านข้อมูล CSV รองรับ comma และเครื่องหมาย quote
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;

      row.push(field);
      field = "";

      if (row.some(cell => cell.trim() !== "")) {
        rows.push(row);
      }

      row = [];
    } else {
      field += ch;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    if (row.some(cell => cell.trim() !== "")) rows.push(row);
  }

  if (!rows.length) return [];

  const headers = rows.shift().map(
    h => h.replace(/^\uFEFF/, "").trim()
  );

  return rows.map(values => {
    const item = {};

    headers.forEach((header, i) => {
      item[header] = (values[i] || "").trim();
    });

    return item;
  });
}

// โหลดข้อสอบจาก questions.csv
async function loadQuestions() {
  const response = await fetch("questions.csv");

  if (!response.ok) {
    throw new Error("โหลด CSV ไม่สำเร็จ");
  }

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
    answer: (row["เฉลย"] || "").trim()
  })).filter(q => q.question && q.answer);

  if (!questions.length) {
    throw new Error("ไม่พบข้อมูลข้อสอบใน CSV");
  }
}

// แสดงข้อสอบและเฉลยทันทีหลังเลือกคำตอบ
function showQuestion() {
  const q = questions[currentIndex];
  const isAnswered = submittedAnswers[q.id] === true;

  $("progress").textContent =
    `ข้อ ${currentIndex + 1} / ${questions.length}`;

  $("progress-fill").style.width =
    `${((currentIndex + 1) / questions.length) * 100}%`;

  $("question").textContent = q.question;

  const choices = $("choices");
  choices.innerHTML = "";

  q.choices.forEach(choice => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice";

    const isSelected = answers[q.id] === choice.key;
    const isCorrect = choice.key === q.answer;

    if (isAnswered && isCorrect) {
      button.classList.add("correct");
    } else if (isAnswered && isSelected && !isCorrect) {
      button.classList.add("incorrect");
    } else if (isSelected) {
      button.classList.add("selected");
    }

    const letter = document.createElement("span");
    letter.className = "letter";
    letter.textContent = choice.key;

    const text = document.createElement("span");
    text.textContent = choice.text;

    button.append(letter, text);

    if (isAnswered) {
      button.disabled = true;
    } else {
      button.addEventListener("click", () => {
        answers[q.id] = choice.key;
        submittedAnswers[q.id] = true;
        showQuestion();
      });
    }

    choices.appendChild(button);
  });

  // ข้อความบอกผลถูกหรือผิด
  let feedback = $("answer-feedback");

  if (!feedback) {
    feedback = document.createElement("p");
    feedback.id = "answer-feedback";
    feedback.className = "answer-feedback";
    choices.after(feedback);
  }

  if (isAnswered) {
    if (answers[q.id] === q.answer) {
      feedback.textContent = "✓ ถูกต้อง! เก่งมาก 🎉";
      feedback.className =
        "answer-feedback correct-text";
    } else {
      const correctChoice = q.choices.find(
        choice => choice.key === q.answer
      );

      feedback.textContent =
        `✗ ยังไม่ถูก เฉลย: ${q.answer}` +
        (correctChoice ? ` ${correctChoice.text}` : "");

      feedback.className =
        "answer-feedback incorrect-text";
    }
  } else {
    feedback.textContent =
      "เลือกคำตอบเพื่อดูเฉลยทันที";

    feedback.className = "answer-feedback";
  }

  $("prev-btn").disabled = currentIndex === 0;

  $("next-btn").disabled = !isAnswered;

  $("next-btn").textContent =
    currentIndex === questions.length - 1
      ? "ส่งคำตอบ"
      : "ข้อถัดไป";
}

// แปลงวินาทีเป็น นาที:วินาที
function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString().padStart(2, "0");

  const seconds = (totalSeconds % 60)
    .toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
}

// อัปเดตเวลา
function updateTimer() {
  const elapsed = Math.floor(
    (Date.now() - startedAt) / 1000
  );

  $("timer").textContent =
    `เวลา ${formatTime(elapsed)}`;
}

// เริ่มทำข้อสอบ
$("start-btn").addEventListener("click", async () => {
  studentName = $("name-input").value.trim();

  if (!studentName) {
    $("start-error").textContent =
      "กรุณากรอกชื่อผู้สอบ";
    return;
  }

  $("start-error").textContent = "กำลังโหลดข้อสอบ...";

  try {
    await loadQuestions();

    answers = {};
    submittedAnswers = {};
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

    $("start-error").textContent =
      "โหลดข้อสอบไม่ได้ ตรวจสอบว่า questions.csv อยู่ในโฟลเดอร์เดียวกับ index.html และเปิดผ่าน Live Server";
  }
});

// ย้อนกลับไปดูข้อก่อนหน้า
$("prev-btn").addEventListener("click", () => {
  if (currentIndex > 0) {
    currentIndex--;
    showQuestion();
  }
});

// ไปข้อถัดไป หรือส่งคำตอบเมื่อถึงข้อสุดท้าย
$("next-btn").addEventListener("click", () => {
  const q = questions[currentIndex];

  if (!submittedAnswers[q.id]) return;

  if (currentIndex < questions.length - 1) {
    currentIndex++;
    showQuestion();
  } else {
    finishQuiz();
  }
});

// สรุปคะแนนและส่งข้อมูลไป Google Sheets
async function finishQuiz() {
  clearInterval(timerInterval);

  const score = questions.reduce(
    (sum, q) =>
      sum + (answers[q.id] === q.answer ? 1 : 0),
    0
  );

  const total = questions.length;
  const percentage = Math.round((score / total) * 100);

  const elapsed = Math.floor(
    (Date.now() - startedAt) / 1000
  );

  const time = formatTime(elapsed);

  quizScreen.classList.add("hidden");
  resultScreen.classList.remove("hidden");

  $("result-name").textContent =
    `ชื่อผู้สอบ: ${studentName}`;

  $("result-score").textContent = `${score}/${total}`;
  $("result-percent").textContent =
    `คิดเป็น ${percentage}%`;

  $("result-time").textContent =
    `ใช้เวลา ${time} นาที`;

  const saveStatus = $("save-status");

  saveStatus.textContent =
    "กำลังส่งผลสอบไป Google Sheets...";

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

// กลับไปหน้าเริ่มต้นเพื่อทำข้อสอบใหม่
$("restart-btn").addEventListener("click", () => {
  clearInterval(timerInterval);

  answers = {};
  submittedAnswers = {};
  currentIndex = 0;

  $("name-input").value = "";
  $("start-error").textContent = "";
  $("save-status").textContent = "";

  resultScreen.classList.add("hidden");
  quizScreen.classList.add("hidden");
  startScreen.classList.remove("hidden");
});
