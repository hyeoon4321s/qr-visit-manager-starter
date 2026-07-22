const form = document.querySelector("#admin-form");
const adminKeyInput = document.querySelector("#admin-key");
const loadButton = document.querySelector("#load-button");
const refreshButton = document.querySelector("#refresh-button");
const adminMessage = document.querySelector("#admin-message");
const dashboard = document.querySelector("#dashboard");
const totalVisits = document.querySelector("#total-visits");
const totalCodes = document.querySelector("#total-codes");
const activeCodes = document.querySelector("#active-codes");
const qrList = document.querySelector("#qr-list");
const emptyList = document.querySelector("#empty-list");
const testModeNote = document.querySelector("#test-mode-note");
const testAdminKey = document.querySelector("#test-admin-key");

const sessionKeyName = "qr-manager-admin-key";
const numberFormatter = new Intl.NumberFormat("ko-KR");
const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

adminKeyInput.value = sessionStorage.getItem(sessionKeyName) ?? "";

function setMessage(message, type = "") {
  adminMessage.textContent = message;
  adminMessage.className = "form-message full-width";

  if (type) {
    adminMessage.classList.add(`is-${type}`);
  }
}

function formatDate(value) {
  return value ? dateFormatter.format(new Date(value)) : "방문 기록 없음";
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  if (text !== undefined) {
    element.textContent = text;
  }

  return element;
}

async function copyTrackingUrl(trackingUrl, button) {
  try {
    await navigator.clipboard.writeText(trackingUrl);
    const previousText = button.textContent;
    button.textContent = "복사됨";
    window.setTimeout(() => {
      button.textContent = previousText;
    }, 1400);
  } catch {
    window.prompt("아래 주소를 복사해 주세요.", trackingUrl);
  }
}

async function downloadQrImage(qrCode, button) {
  const adminKey = adminKeyInput.value.trim();
  const previousText = button.textContent;
  button.disabled = true;
  button.textContent = "준비 중...";

  try {
    const response = await fetch(qrCode.image_url, {
      headers: { "x-admin-key": adminKey },
    });

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error ?? "QR 이미지를 내려받지 못했습니다.");
    }

    const imageBlob = await response.blob();
    const downloadUrl = URL.createObjectURL(imageBlob);
    const downloadLink = document.createElement("a");
    downloadLink.href = downloadUrl;
    downloadLink.download = `qr-${qrCode.slug}.png`;
    document.body.append(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
}

function createQrCard(qrCode) {
  const card = createElement("article", "qr-card");
  const identity = createElement("div", "qr-identity");
  const titleLine = createElement("div", "qr-title-line");
  const title = createElement("h3", "", qrCode.title);
  const state = createElement(
    "span",
    qrCode.is_active ? "state-badge" : "state-badge is-inactive",
    qrCode.is_active ? "사용 중" : "중지됨",
  );
  const targetType = qrCode.target_type === "url" ? "웹 주소" : "안내 문자";
  const target = createElement("span", "qr-target", `${targetType} · ${qrCode.target_value}`);

  target.title = qrCode.target_value;
  titleLine.append(title, state);
  identity.append(titleLine, target);

  const visitBlock = createElement("div", "stat-block");
  visitBlock.append(
    createElement("span", "", "누적 방문"),
    createElement("strong", "", numberFormatter.format(qrCode.visit_count)),
  );

  const latestBlock = createElement("div", "stat-block");
  const latestTime = createElement("time", "", formatDate(qrCode.last_visited_at));

  if (qrCode.last_visited_at) {
    latestTime.dateTime = qrCode.last_visited_at;
  }

  latestBlock.append(createElement("span", "", "최근 방문"), latestTime);

  const actions = createElement("div", "card-actions");
  const copyButton = createElement("button", "icon-button", "추적 주소 복사");
  const downloadButton = createElement("button", "icon-button", "PNG 받기");
  copyButton.type = "button";
  downloadButton.type = "button";
  copyButton.addEventListener("click", () => copyTrackingUrl(qrCode.tracking_url, copyButton));
  downloadButton.addEventListener("click", () => downloadQrImage(qrCode, downloadButton));
  actions.append(copyButton, downloadButton);

  card.append(identity, visitBlock, latestBlock, actions);
  return card;
}

function renderDashboard(qrCodes) {
  const visitSum = qrCodes.reduce((sum, qrCode) => sum + Number(qrCode.visit_count), 0);
  const activeSum = qrCodes.filter((qrCode) => qrCode.is_active).length;

  totalVisits.textContent = numberFormatter.format(visitSum);
  totalCodes.textContent = numberFormatter.format(qrCodes.length);
  activeCodes.textContent = numberFormatter.format(activeSum);
  qrList.replaceChildren(...qrCodes.map(createQrCard));
  emptyList.hidden = qrCodes.length !== 0;
  dashboard.hidden = false;
}

async function loadStatistics() {
  const adminKey = adminKeyInput.value.trim();

  if (!adminKey) {
    setMessage("관리자 키를 입력해 주세요.", "error");
    dashboard.hidden = true;
    return;
  }

  setMessage("통계를 불러오는 중입니다...");
  loadButton.disabled = true;
  refreshButton.disabled = true;

  try {
    const response = await fetch("/api/admin/qr", {
      headers: { "x-admin-key": adminKey },
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error ?? "통계를 불러오지 못했습니다.");
    }

    sessionStorage.setItem(sessionKeyName, adminKey);
    renderDashboard(result.qrCodes);
    setMessage(`${result.qrCodes.length}개의 QR 통계를 불러왔습니다.`, "success");
  } catch (error) {
    dashboard.hidden = true;
    setMessage(error.message, "error");
  } finally {
    loadButton.disabled = false;
    refreshButton.disabled = false;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  loadStatistics();
});

refreshButton.addEventListener("click", loadStatistics);

async function initializePage() {
  try {
    const response = await fetch("/api/test-config", { cache: "no-store" });

    if (response.ok) {
      const config = await response.json();

      if (config.testMode) {
        adminKeyInput.value = config.adminKey;
        adminKeyInput.type = "text";
        testAdminKey.textContent = config.adminKey;
        testModeNote.hidden = false;
        sessionStorage.setItem(sessionKeyName, config.adminKey);
      }
    }
  } catch {
    // 테스트 설정이 없으면 기존 관리자 키 입력 방식을 사용합니다.
  }

  // QR 생성 화면에서 이미 관리자 키를 입력했다면 통계를 자동으로 불러옵니다.
  if (adminKeyInput.value) {
    loadStatistics();
  }
}

initializePage();
