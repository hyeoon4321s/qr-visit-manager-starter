import { fileURLToPath } from "node:url";
import express from "express";
import QRCode from "qrcode";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const publicDirectory = fileURLToPath(new URL("../public", import.meta.url));

app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));
app.use(express.static(publicDirectory, { index: false }));

// http 또는 https로 시작하는 정상적인 웹 주소인지 확인합니다.
function isValidWebUrl(value) {
  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}

// QR 생성 화면을 보여줍니다.
app.get("/", (_request, response) => {
  if (process.env.VERCEL) {
    return response.redirect(302, "/index.html");
  }

  return response.sendFile("index.html", { root: publicDirectory });
});

// 이전 통계 주소로 접속하면 QR 생성 화면으로 이동합니다.
app.get("/admin", (_request, response) => response.redirect(302, "/"));

// 서버 실행 상태를 간단히 확인합니다.
app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    mode: "qr-only",
    message: "QR 생성 서버가 정상적으로 실행 중입니다.",
  });
});

// 전달받은 웹 주소를 QR PNG 데이터로 변환합니다.
// 데이터베이스와 로그인 없이 누구나 사용할 수 있습니다.
app.post("/api/qr", async (request, response, next) => {
  try {
    const url = typeof request.body.url === "string" ? request.body.url.trim() : "";

    if (url.length < 1 || url.length > 2000) {
      return response.status(400).json({
        error: "웹 주소는 1자 이상 2,000자 이내로 입력해 주세요.",
      });
    }

    if (!isValidWebUrl(url)) {
      return response.status(400).json({
        error: "http:// 또는 https://로 시작하는 웹 주소를 입력해 주세요.",
      });
    }

    const qrImageDataUrl = await QRCode.toDataURL(url, {
      type: "image/png",
      width: 512,
      margin: 2,
      errorCorrectionLevel: "M",
    });

    return response.status(201).json({ url, qrImageDataUrl });
  } catch (error) {
    return next(error);
  }
});

app.use((error, _request, response, _next) => {
  console.error("QR 생성 오류:", error);
  response.status(500).json({
    error: "QR 코드를 만드는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  });
});

// Vercel은 이 Express 앱을 서버리스 함수로 사용합니다.
export default app;

// 로컬에서 실행할 때만 개발 서버의 포트를 엽니다.
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`QR 생성 사이트가 http://localhost:${port}에서 실행 중입니다.`);
  });
}
