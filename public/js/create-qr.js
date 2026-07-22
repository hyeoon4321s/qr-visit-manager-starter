const form = document.querySelector("#qr-form");
const adminKeyInput = document.querySelector("#admin-key");
const toggleKeyButton = document.querySelector("#toggle-key");
const titleInput = document.querySelector("#title");
const targetValueInput = document.querySelector("#target-value");
const targetLabel = document.querySelector("#target-label");
const targetHelp = document.querySelector("#target-help");
const characterCount = document.querySelector("#character-count");
const submitButton = document.querySelector("#submit-button");
const formMessage = document.querySelector("#form-message");
const emptyPreview = document.querySelector("#empty-preview");
const qrResult = document.querySelector("#qr-result");
const qrImage = document.querySelector("#qr-image");
const resultTitle = document.querySelector("#result-title");
const trackingUrlInput = document.querySelector("#tracking-url");
const copyUrlButton = document.querySelector("#copy-url");
const downloadQrLink = document.querySelector("#download-qr");
const targetTypeInputs = document.querySelectorAll('input[name="targetType"]');
const testKeyGuide = document.querySelector("#test-key-guide");
const testAdminKey = document.querySelector("#test-admin-key");

const sessionKeyName = "qr-manager-admin-key";

// 관리자 키는 브라우저를 닫아도 남는 저장소가 아닌 현재 탭의 세션에만 보관합니다.
adminKeyInput.value = sessionStorage.getItem(sessionKeyName) ?? "";

async function loadTestConfig() {
  try {
    const response = await fetch("/api/test-config", { cache: "no-store" });

    if (!response.ok) {
      return;
    }

    const config = await response.json();

    if (!config.testMode) {
      return;
    }

    adminKeyInput.value = config.adminKey;
    adminKeyInput.type = "text";
    toggleKeyButton.textContent = "숨기기";
    toggleKeyButton.setAttribute("aria-label", "관리자 키 숨기기");
    testAdminKey.textContent = config.adminKey;
    testKeyGuide.hidden = false;
    sessionStorage.setItem(sessionKeyName, config.adminKey);
  } catch {
    // 테스트 설정을 불러오지 못해도 일반 관리자 키 입력 방식은 그대로 사용할 수 있습니다.
  }
}

function setMessage(message, type = "") {
  formMessage.textContent = message;
  formMessage.className = "form-message";

  if (type) {
    formMessage.classList.add(`is-${type}`);
  }
}

function getSelectedTargetType() {
  return document.querySelector('input[name="targetType"]:checked').value;
}

function updateTargetField() {
  const isUrl = getSelectedTargetType() === "url";
  targetLabel.textContent = isUrl ? "웹 주소" : "안내 문자";
  targetValueInput.placeholder = isUrl
    ? "https://example.com"
    : "예: A구역 운영 시간은 오전 10시부터 오후 6시까지입니다.";
  targetHelp.textContent = isUrl
    ? "http:// 또는 https://로 시작하는 주소를 입력하세요."
    : "QR을 스캔한 사람에게 이 문자가 화면으로 표시됩니다.";
}

function makeSafeFileName(title) {
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, "-").trim();
  return `${safeTitle || "qr-code"}.png`;
}

async function copyText(value, button) {
  try {
    await navigator.clipboard.writeText(value);
    const previousText = button.textContent;
    button.textContent = "복사됨";
    window.setTimeout(() => {
      button.textContent = previousText;
    }, 1400);
  } catch {
    trackingUrlInput.select();
    document.execCommand("copy");
    button.textContent = "복사됨";
  }
}

for (const input of targetTypeInputs) {
  input.addEventListener("change", updateTargetField);
}

targetValueInput.addEventListener("input", () => {
  characterCount.textContent = targetValueInput.value.length.toLocaleString("ko-KR");
});

toggleKeyButton.addEventListener("click", () => {
  const willShow = adminKeyInput.type === "password";
  adminKeyInput.type = willShow ? "text" : "password";
  toggleKeyButton.textContent = willShow ? "숨기기" : "보기";
  toggleKeyButton.setAttribute("aria-label", willShow ? "관리자 키 숨기기" : "관리자 키 표시");
});

copyUrlButton.addEventListener("click", () => {
  copyText(trackingUrlInput.value, copyUrlButton);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("");

  const adminKey = adminKeyInput.value.trim();
  const title = titleInput.value.trim();
  const targetType = getSelectedTargetType();
  const targetValue = targetValueInput.value.trim();

  if (!adminKey || !title || !targetValue) {
    setMessage("관리자 키, QR 이름, 연결 정보를 모두 입력해 주세요.", "error");
    return;
  }

  submitButton.disabled = true;
  submitButton.firstElementChild.textContent = "QR을 만들고 있습니다...";

  try {
    const response = await fetch("/api/admin/qr", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": adminKey,
      },
      body: JSON.stringify({ title, targetType, targetValue }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error ?? "QR 코드를 만들지 못했습니다.");
    }

    sessionStorage.setItem(sessionKeyName, adminKey);
    qrImage.src = result.qrImageDataUrl;
    resultTitle.textContent = result.qr.title;
    trackingUrlInput.value = result.trackingUrl;
    downloadQrLink.href = result.qrImageDataUrl;
    downloadQrLink.download = makeSafeFileName(result.qr.title);
    emptyPreview.hidden = true;
    qrResult.hidden = false;
    setMessage("QR 정보가 데이터베이스에 저장되었습니다.", "success");
    qrResult.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    submitButton.disabled = false;
    submitButton.firstElementChild.textContent = "QR 코드 만들기";
  }
});

updateTargetField();
loadTestConfig();
