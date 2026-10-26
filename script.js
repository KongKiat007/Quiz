
let questions = [];

const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbzvst575HdJp-nlmZPjrv_aqUfCqBsL8r8JohKxoSrz8vrXLihuVtOgPtfyLTnvtivI/exec";

let answers = {};
let submittedAnswers = {};
let currentIndex = 0;

let studentId = "";
let studentName = "";

let startedAt = 0;
let timerInterval = null;
let isFinishing = false;

const $ = (id) => document.getElementById(id);

const startScreen = $("start-screen");
const quizScreen = $("quiz-screen");
const resultScreen = $("result-screen");


// =====================================
// อ่านไฟล์ CSV
// =====================================

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  text = text.replace(/^\uFEFF/, "");

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

    if (row.some(cell => cell.trim() !== "")) {
      rows.push(row);
    }
  }

  if (!rows.length) return [];

  const headers = rows.shift().map(h => h.trim());

  return rows.map(values => {
    const item = {};

    headers.forEach((header, i) => {
      item[header] = (values[i] || "").trim();
    });

    return item;
  });
}


// =====================================
// โหลดข้อสอบ
// =====================================

async function loadQuestions() {
  const response = await fetch("questions.csv", {
    cache: "no-store"
  });

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

  for (const q of questions) {
    if (
      q.choices.some(c => !c.text) ||
      !q.choices.some(c => c.key === q.answer)
    ) {
      throw new Error(
        `ตรวจสอบข้อ ${q.id}: ตัวเลือกไม่ครบหรือค่าเฉลยไม่ใช่ ก ข ค ง`
      );
    }
  }
}


// =====================================
// เริ่มทำข้อสอบ
// =====================================

$("start-btn").addEventListener("click", async () => {
  studentId = $("student-id").value.trim();
  studentName = $("name-input").value.trim();

  if (!studentId || !studentName) {
    $("start-error").textContent =
      "กรุณากรอกรหัสนักศึกษาและชื่อผู้สอบให้ครบ";

    if (!studentId) {
      $("student-id").focus();
    } else {
      $("name-input").focus();
    }

    return;
  }

  $("start-error").textContent = "";
  $("start-btn").disabled = true;

  try {
    await loadQuestions();

    answers = {};
    submittedAnswers = {};
    currentIndex = 0;
    isFinishing = false;

    startedAt = Date.now();

    startScreen.classList.add("hidden");
    resultScreen.classList.add("hidden");
    quizScreen.classList.remove("hidden");

    updateTimer();

    clearInterval(timerInterval);
    timerInterval = setInterval(updateTimer, 1000);

    showQuestion();

  } catch (error) {
    console.error(error);

    $("start-error").textContent =
      "โหลดข้อสอบไม่ได้ ตรวจสอบ questions.csv และรูปแบบข้อมูล";

  } finally {
    $("start-btn").disabled = false;
  }
});


// =====================================
// แสดงคำถามและเฉลย
// =====================================

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

  let feedback = $("answer-feedback");

  if (!feedback) {
    feedback = document.createElement("p");
    feedback.id = "answer-feedback";
    feedback.className = "answer-feedback";
    choices.after(feedback);
  }

  if (isAnswered && answers[q.id] === q.answer) {
    feedback.textContent = "✓ ถูกต้อง! เก่งมาก 🎉";
    feedback.className = "answer-feedback correct-text";

  } else if (isAnswered) {
    const correctChoice = q.choices.find(
      choice => choice.key === q.answer
    );

    feedback.textContent =
      `✗ ยังไม่ถูก เฉลย: ${q.answer}` +
      (correctChoice ? ` ${correctChoice.text}` : "");

    feedback.className = "answer-feedback incorrect-text";

  } else {
    feedback.textContent = "เลือกคำตอบเพื่อดูเฉลยทันที";
    feedback.className = "answer-feedback";
  }

  $("prev-btn").disabled = currentIndex === 0;
  $("next-btn").disabled = !isAnswered;

  $("next-btn").textContent =
    currentIndex === questions.length - 1
      ? "ส่งคำตอบ"
      : "ข้อถัดไป";
}


// =====================================
// จับเวลา
// =====================================

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString().padStart(2, "0");

  const seconds = (totalSeconds % 60)
    .toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function updateTimer() {
  if (!startedAt) return;

  const elapsed = Math.floor(
    (Date.now() - startedAt) / 1000
  );

  $("timer").textContent = `เวลา ${formatTime(elapsed)}`;
}


// =====================================
// ย้อนกลับ
// =====================================

$("prev-btn").addEventListener("click", () => {
  if (currentIndex > 0 && !isFinishing) {
    currentIndex--;
    showQuestion();
  }
});


// =====================================
// ข้อถัดไป / ส่งข้อสอบ
// =====================================

$("next-btn").addEventListener("click", () => {
  if (isFinishing) return;

  const q = questions[currentIndex];

  if (!submittedAnswers[q.id]) return;

  if (currentIndex < questions.length - 1) {
    currentIndex++;
    showQuestion();
  } else {
    finishQuiz();
  }
});


// =====================================
// สรุปคะแนนและส่งข้อมูล
// =====================================

async function finishQuiz() {
  if (isFinishing) return;

  isFinishing = true;
  $("next-btn").disabled = true;
  $("prev-btn").disabled = true;

  clearInterval(timerInterval);

  const score = questions.reduce((sum, q) => {
    return sum + (answers[q.id] === q.answer ? 1 : 0);
  }, 0);

  const total = questions.length;
  const percentage = Math.round((score / total) * 100);

  const elapsed = Math.floor(
    (Date.now() - startedAt) / 1000
  );

  const time = formatTime(elapsed);

  quizScreen.classList.add("hidden");
  resultScreen.classList.remove("hidden");

  $("result-name").textContent =
    `รหัสนักศึกษา: ${studentId} | ชื่อผู้สอบ: ${studentName}`;

  $("result-score").textContent = `${score}/${total}`;
  $("result-percent").textContent = `คิดเป็น ${percentage}%`;
  $("result-time").textContent = `ใช้เวลา ${time}`;

  const saveStatus = $("save-status");
  saveStatus.textContent = "กำลังส่งผลสอบไป Google Sheets...";

  const payload = {
    studentId: studentId,
    name: studentName,
    score: score,
    total: total,
    percentage: percentage,
    time: time,
    submittedAt: new Date().toISOString()
  };

  try {
    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    saveStatus.textContent =
      "ส่งคำขอบันทึกแล้ว กรุณาตรวจสอบ Google Sheets";

  } catch (error) {
    console.error("ส่งผลสอบไม่สำเร็จ:", error);

    saveStatus.textContent =
      "ส่งผลสอบไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต";
  }
}


// =====================================
// กลับไปเริ่มใหม่
// =====================================

$("restart-btn").addEventListener("click", () => {
  clearInterval(timerInterval);

  answers = {};
  submittedAnswers = {};
  currentIndex = 0;
  studentId = "";
  studentName = "";
  startedAt = 0;
  isFinishing = false;

  $("student-id").value = "";
  $("name-input").value = "";
  $("start-error").textContent = "";
  $("save-status").textContent = "";

  $("start-btn").innerHTML = "เริ่มทำข้อสอบ";
  $("timer").textContent = "เวลา 00:00";

  resultScreen.classList.add("hidden");
  quizScreen.classList.add("hidden");
  startScreen.classList.remove("hidden");
});
