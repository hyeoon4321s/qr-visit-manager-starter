const form = document.querySelector("#qr-form");
const titleInput = document.querySelector("#title");
const urlInput = document.querySelector("#url");
const submitButton = document.querySelector("#submit-button");
const formMessage = document.querySelector("#form-message");
const emptyPreview = document.querySelector("#empty-preview");
const qrResult = document.querySelector("#qr-result");
const qrImage = document.querySelector("#qr-image");
const resultTitle = document.querySelector("#result-title");
const resultUrl = document.querySelector("#result-url");
const copyUrlButton = document.querySelector("#copy-url");
const downloadQrLink = document.querySelector("#download-qr");
const savedCount = document.querySelector("#saved-count");
const clearAllButton = document.querySelector("#clear-all");
const emptyList = document.querySelector("#empty-list");
const qrList = document.querySelector("#qr-list");

const storageKey = "simple-qr-history-v1";
const maximumSavedItems = 30;
const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

let savedItems = loadSavedItems();

function loadSavedItems() {
  try {
    const parsedItems = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(parsedItems) ? parsedItems.slice(0, maximumSavedItems) : [];
  } catch {
    return [];
  }
}

function saveItems() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(savedItems));
    return true;
  } catch {
    return false;
  }
}

function setMessage(message, type = "") {
  formMessage.textContent = message;
  formMessage.className = "form-message";

  if (type) {
    formMessage.classList.add(`is-${type}`);
  }
}

function makeSafeFileName(title) {
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, "-").trim();
  return `${safeTitle || "qr-code"}.png`;
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

function removeItem(itemId) {
  savedItems = savedItems.filter((item) => item.id !== itemId);
  saveItems();
  renderSavedItems();
}

function createQrCard(item) {
  const card = createElement("article", "saved-qr-card");
  const imageFrame = createElement("div", "saved-qr-image");
  const image = document.createElement("img");
  image.src = item.image;
  image.alt = `${item.title} QR 코드`;
  image.loading = "lazy";
  imageFrame.append(image);

  const content = createElement("div", "saved-qr-content");
  const title = createElement("h3", "", item.title);
  const urlLink = createElement("a", "saved-qr-url", item.url);
  urlLink.href = item.url;
  urlLink.target = "_blank";
  urlLink.rel = "noopener noreferrer";
  const createdAt = createElement(
    "time",
    "saved-qr-date",
    dateFormatter.format(new Date(item.createdAt)),
  );
  createdAt.dateTime = item.createdAt;
  content.append(title, urlLink, createdAt);

  const actions = createElement("div", "saved-card-actions");
  const copyButton = createElement("button", "icon-button", "주소 복사");
  copyButton.type = "button";
  copyButton.addEventListener("click", () => copyText(item.url, copyButton));

  const downloadLink = createElement("a", "icon-button saved-download", "PNG 받기");
  downloadLink.href = item.image;
  downloadLink.download = makeSafeFileName(item.title);

  const deleteButton = createElement("button", "icon-button danger-button", "삭제");
  deleteButton.type = "button";
  deleteButton.addEventListener("click", () => removeItem(item.id));
  actions.append(copyButton, downloadLink, deleteButton);

  card.append(imageFrame, content, actions);
  return card;
}

function renderSavedItems() {
  qrList.replaceChildren(...savedItems.map(createQrCard));
  emptyList.hidden = savedItems.length > 0;
  clearAllButton.disabled = savedItems.length === 0;
  savedCount.textContent = `${savedItems.length}개`;
}

function showResult(item) {
  qrImage.src = item.image;
  resultTitle.textContent = item.title;
  resultUrl.value = item.url;
  downloadQrLink.href = item.image;
  downloadQrLink.download = makeSafeFileName(item.title);
  emptyPreview.hidden = true;
  qrResult.hidden = false;
}

copyUrlButton.addEventListener("click", () => {
  copyText(resultUrl.value, copyUrlButton);
});

clearAllButton.addEventListener("click", () => {
  if (!window.confirm("브라우저에 저장된 QR 목록을 모두 삭제할까요?")) {
    return;
  }

  savedItems = [];
  saveItems();
  renderSavedItems();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("");

  const url = urlInput.value.trim();
  let title = titleInput.value.trim();

  if (!url) {
    setMessage("웹 주소를 입력해 주세요.", "error");
    return;
  }

  if (!title) {
    try {
      title = new URL(url).hostname;
    } catch {
      title = "새 QR 코드";
    }
  }

  submitButton.disabled = true;
  submitButton.firstElementChild.textContent = "QR을 만드는 중입니다...";

  try {
    const response = await fetch("/api/qr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error ?? "QR 코드를 만들지 못했습니다.");
    }

    const item = {
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      title,
      url: result.url,
      image: result.qrImageDataUrl,
      createdAt: new Date().toISOString(),
    };

    savedItems.unshift(item);
    savedItems = savedItems.slice(0, maximumSavedItems);
    const wasSaved = saveItems();
    renderSavedItems();
    showResult(item);
    setMessage(
      wasSaved
        ? "QR 코드가 생성되고 아래 목록에 저장되었습니다."
        : "QR은 생성되었지만 브라우저 저장 공간이 부족해 목록 저장은 하지 못했습니다.",
      wasSaved ? "success" : "error",
    );
    qrResult.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    submitButton.disabled = false;
    submitButton.firstElementChild.textContent = "QR 코드 만들기";
  }
});

renderSavedItems();
