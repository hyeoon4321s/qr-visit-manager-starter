const unlockForm = document.querySelector("#unlock-form");
const adminCodeInput = document.querySelector("#admin-code");
const unlockMessage = document.querySelector("#unlock-message");
const lockChip = document.querySelector("#lock-chip");
const form = document.querySelector("#qr-form");
const titleInput = document.querySelector("#title");
const urlInput = document.querySelector("#url");
const submitButton = document.querySelector("#submit-button");
const formMessage = document.querySelector("#form-message");
const emptyPreview = document.querySelector("#empty-preview");
const qrResult = document.querySelector("#qr-result");
const qrImage = document.querySelector("#qr-image");
const resultTitle = document.querySelector("#result-title");
const trackingUrlInput = document.querySelector("#tracking-url");
const copyUrlButton = document.querySelector("#copy-url");
const downloadQrLink = document.querySelector("#download-qr");
const summaryCount = document.querySelector("#summary-count");
const refreshListButton = document.querySelector("#refresh-list");
const listMessage = document.querySelector("#list-message");
const emptyList = document.querySelector("#empty-list");
const qrList = document.querySelector("#qr-list");
const siteHeader = document.querySelector(".site-header");
const navigationLinks = [...document.querySelectorAll('.nav-link[href^="#"]')];
const sectionJumpLinks = [
  ...document.querySelectorAll('a[href="#create"], a[href="#qr-board"]'),
];

const sessionKey = "qr-board-admin-code";
const demoAdminCode = "ADMIN";
const numberFormatter = new Intl.NumberFormat("ko-KR");
const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

let activeAdminCode = sessionStorage.getItem(sessionKey) ?? "";

// 고정된 상단 메뉴 높이를 제외하고 각 영역의 제목이 정확히 보이도록 이동합니다.
function moveToNavigationTarget(hash, updateAddress = true) {
  const target = document.querySelector(hash);

  if (!target) {
    return;
  }

  const headerHeight = siteHeader?.getBoundingClientRect().height ?? 0;
  const targetTop = window.scrollY + target.getBoundingClientRect().top;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  window.scrollTo({
    top: Math.max(0, targetTop - headerHeight - 18),
    behavior: prefersReducedMotion ? "auto" : "smooth",
  });

  navigationLinks.forEach((link) => {
    link.classList.toggle("is-active", link.hash === hash);
    link.setAttribute("aria-current", link.hash === hash ? "location" : "false");
  });

  if (updateAddress) {
    window.history.replaceState(null, "", hash);
  }
}

// 사용자가 직접 화면을 스크롤해도 현재 보이는 영역에 맞춰 메뉴 상태를 변경합니다.
function updateActiveNavigation() {
  const board = document.querySelector("#qr-board");
  const headerHeight = siteHeader?.getBoundingClientRect().height ?? 0;
  const currentLine = window.scrollY + headerHeight + 40;
  const reachedPageEnd =
    Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 2;
  const activeHash =
    board && (currentLine >= board.offsetTop || reachedPageEnd) ? "#qr-board" : "#create";

  navigationLinks.forEach((link) => {
    const isActive = link.hash === activeHash;
    link.classList.toggle("is-active", isActive);

    if (isActive) {
      link.setAttribute("aria-current", "location");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

sectionJumpLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    moveToNavigationTarget(link.hash);
  });
});

let navigationUpdateRequested = false;
window.addEventListener(
  "scroll",
  () => {
    if (navigationUpdateRequested) {
      return;
    }

    navigationUpdateRequested = true;
    window.requestAnimationFrame(() => {
      updateActiveNavigation();
      navigationUpdateRequested = false;
    });
  },
  { passive: true },
);

window.addEventListener("load", () => {
  if (window.location.hash === "#create" || window.location.hash === "#qr-board") {
    moveToNavigationTarget(window.location.hash, false);
  } else {
    updateActiveNavigation();
  }
});

function setMessage(element, message, type = "") {
  element.textContent = message;
  element.className = "form-message";

  if (type) {
    element.classList.add(`is-${type}`);
  }
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

function makeSafeFileName(title) {
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, "-").trim();
  return `${safeTitle || "qr-code"}.png`;
}

function formatDate(value) {
  return value ? dateFormatter.format(new Date(value)) : "아직 방문 없음";
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
    window.prompt("아래 주소를 복사해 주세요.", value);
  }
}

function unlockCreation(code) {
  if (code !== demoAdminCode) {
    activeAdminCode = "";
    sessionStorage.removeItem(sessionKey);
    form.hidden = true;
    lockChip.textContent = "잠김";
    setMessage(unlockMessage, "관리자 코드가 올바르지 않습니다.", "error");
    return false;
  }

  activeAdminCode = code;
  sessionStorage.setItem(sessionKey, code);
  adminCodeInput.value = code;
  form.hidden = false;
  lockChip.textContent = "생성 가능";
  setMessage(unlockMessage, "관리자 생성 기능이 열렸습니다.", "success");
  return true;
}

function createQrCard(qrCode) {
  const card = createElement("article", "saved-qr-card");
  const imageFrame = createElement("div", "saved-qr-image");
  const image = document.createElement("img");
  image.src = qrCode.image_url;
  image.alt = `${qrCode.title} QR 코드`;
  image.loading = "lazy";
  imageFrame.append(image);

  const content = createElement("div", "saved-qr-content");
  const title = createElement("h3", "", qrCode.title);
  const targetLink = createElement("a", "saved-qr-url", qrCode.target_value);
  targetLink.href = qrCode.tracking_url;
  targetLink.target = "_blank";
  targetLink.rel = "noopener noreferrer";
  const stats = createElement("div", "public-stat-row");
  const visitStat = createElement("div", "public-stat");
  visitStat.append(
    createElement("span", "", "누적 접속"),
    createElement("strong", "", `${numberFormatter.format(qrCode.visit_count)}회`),
  );
  const recentStat = createElement("div", "public-stat");
  recentStat.append(
    createElement("span", "", "최근 접속"),
    createElement("strong", "", formatDate(qrCode.last_visited_at)),
  );
  stats.append(visitStat, recentStat);

  const createdAt = createElement(
    "time",
    "saved-qr-date",
    `생성 ${formatDate(qrCode.created_at)}`,
  );
  createdAt.dateTime = qrCode.created_at;
  content.append(title, targetLink, stats, createdAt);

  const actions = createElement("div", "saved-card-actions");
  const openLink = createElement("a", "icon-button saved-download", "접속하기");
  openLink.href = qrCode.tracking_url;
  openLink.target = "_blank";
  openLink.rel = "noopener noreferrer";

  const copyButton = createElement("button", "icon-button", "주소 복사");
  copyButton.type = "button";
  copyButton.addEventListener("click", () => copyText(qrCode.tracking_url, copyButton));

  const downloadLink = createElement("a", "icon-button saved-download", "PNG 받기");
  downloadLink.href = qrCode.image_url;
  downloadLink.download = makeSafeFileName(qrCode.title);
  actions.append(openLink, copyButton, downloadLink);

  card.append(imageFrame, content, actions);
  return card;
}

async function loadQrCodes() {
  setMessage(listMessage, "QR 목록과 통계를 불러오는 중입니다...");
  refreshListButton.disabled = true;

  try {
    const response = await fetch("/api/qr", { cache: "no-store" });
    const result = await response.json();

    if (!response.ok) {
      const details = Array.isArray(result.problems) ? ` ${result.problems.join(" ")}` : "";
      throw new Error(`${result.error ?? "QR 목록을 불러오지 못했습니다."}${details}`);
    }

    const visitTotal = result.qrCodes.reduce(
      (sum, qrCode) => sum + Number(qrCode.visit_count),
      0,
    );
    qrList.replaceChildren(...result.qrCodes.map(createQrCard));
    emptyList.hidden = result.qrCodes.length > 0;
    summaryCount.textContent = `QR ${numberFormatter.format(result.qrCodes.length)}개 · 방문 ${numberFormatter.format(visitTotal)}회`;
    setMessage(listMessage, "최신 목록과 통계를 불러왔습니다.", "success");
  } catch (error) {
    qrList.replaceChildren();
    emptyList.hidden = true;
    setMessage(listMessage, error.message, "error");
  } finally {
    refreshListButton.disabled = false;
  }
}

unlockForm.addEventListener("submit", (event) => {
  event.preventDefault();
  unlockCreation(adminCodeInput.value.trim());
});

copyUrlButton.addEventListener("click", () => {
  copyText(trackingUrlInput.value, copyUrlButton);
});

refreshListButton.addEventListener("click", loadQrCodes);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(formMessage, "");

  const title = titleInput.value.trim();
  const url = urlInput.value.trim();

  if (!activeAdminCode) {
    setMessage(formMessage, "먼저 관리자 코드를 입력해 주세요.", "error");
    return;
  }

  if (!title || !url) {
    setMessage(formMessage, "QR 이름과 웹 주소를 모두 입력해 주세요.", "error");
    return;
  }

  submitButton.disabled = true;
  submitButton.firstElementChild.textContent = "QR을 만드는 중입니다...";

  try {
    const response = await fetch("/api/qr", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-code": activeAdminCode,
      },
      body: JSON.stringify({ title, url }),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error ?? "QR 코드를 만들지 못했습니다.");
    }

    qrImage.src = result.qrImageDataUrl;
    resultTitle.textContent = result.qr.title;
    trackingUrlInput.value = result.trackingUrl;
    downloadQrLink.href = result.qrImageDataUrl;
    downloadQrLink.download = makeSafeFileName(result.qr.title);
    emptyPreview.hidden = true;
    qrResult.hidden = false;
    form.reset();
    setMessage(formMessage, "QR 코드가 생성되어 공개 목록에 추가되었습니다.", "success");
    await loadQrCodes();
    qrResult.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) {
    setMessage(formMessage, error.message, "error");
  } finally {
    submitButton.disabled = false;
    submitButton.firstElementChild.textContent = "QR 코드 만들기";
  }
});

if (activeAdminCode === demoAdminCode) {
  unlockCreation(activeAdminCode);
}

loadQrCodes();
