import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import express from "express";
import QRCode from "qrcode";
import { Redis } from "@upstash/redis";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const publicDirectory = fileURLToPath(new URL("../public", import.meta.url));

const redisUrl = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const storageReady = Boolean(redisUrl && redisToken);
const redis = storageReady ? new Redis({ url: redisUrl, token: redisToken }) : null;
const qrIndexKey = "qr-board:index";

// 학습용 고정 관리자 코드입니다. 실제 보안 목적의 비밀 값이 아닙니다.
const adminCode = "ADMIN";

function isValidWebUrl(value) {
  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}

app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(express.json({ limit: "16kb" }));
app.use(express.static(publicDirectory, { index: false }));

function requireAdmin(request, response, next) {
  if (request.get("x-admin-code") !== adminCode) {
    return response.status(401).json({ error: "ADMIN을 정확히 입력해 주세요." });
  }

  return next();
}

function requireStorage(_request, response, next) {
  if (!storageReady) {
    return response.status(503).json({
      error: "Vercel 프로젝트에 Upstash Redis 저장소를 연결해 주세요.",
    });
  }

  return next();
}

function getQrRecordKey(slug) {
  return `qr-board:code:${slug}`;
}

function getVisitCountKey(slug) {
  return `qr-board:visits:${slug}`;
}

function getLastVisitKey(slug) {
  return `qr-board:last-visit:${slug}`;
}

function getPublicBaseUrl(request) {
  const forwardedProtocol = request.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.get("x-forwarded-host")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol || request.protocol || "http";
  const host = forwardedHost || request.get("host") || `localhost:${port}`;
  return `${protocol}://${host}`;
}

app.get("/", (_request, response) => {
  if (process.env.VERCEL) {
    return response.redirect(302, "/index.html");
  }

  return response.sendFile("index.html", { root: publicDirectory });
});

app.get("/admin", (_request, response) => response.redirect(302, "/"));

app.get("/health", (_request, response) => {
  response.status(storageReady ? 200 : 503).json({
    ok: storageReady,
    mode: "public-stats",
    storage: "vercel-upstash-redis",
    message: storageReady
      ? "QR 생성 및 방문 통계 서버가 정상적으로 실행 중입니다."
      : "Vercel에서 Upstash Redis 연결이 필요합니다.",
  });
});

// 관리자 코드가 공개된 학습용 코드임을 화면에 알려줍니다.
app.get("/api/config", (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.json({ adminCode, securityMode: "demo" });
});

// 일반 방문자도 생성된 QR 목록과 방문 통계를 볼 수 있습니다.
app.get("/api/qr", requireStorage, async (request, response, next) => {
  try {
    const slugs = await redis.zrange(qrIndexKey, 0, 99, { rev: true });
    const pipeline = redis.pipeline();

    for (const slug of slugs) {
      pipeline.get(getQrRecordKey(slug));
      pipeline.get(getVisitCountKey(slug));
      pipeline.get(getLastVisitKey(slug));
    }

    const storedValues = slugs.length > 0 ? await pipeline.exec() : [];

    const publicBaseUrl = getPublicBaseUrl(request);
    const qrCodes = slugs
      .map((slug, index) => {
        const qrCode = storedValues[index * 3];

        if (!qrCode) {
          return null;
        }

        return {
          ...qrCode,
          visit_count: Number(storedValues[index * 3 + 1] ?? 0),
          last_visited_at: storedValues[index * 3 + 2] ?? null,
          tracking_url: `${publicBaseUrl}/r/${slug}`,
          image_url: `${publicBaseUrl}/api/qr/${slug}/image`,
        };
      })
      .filter(Boolean);

    return response.json({ qrCodes });
  } catch (error) {
    return next(error);
  }
});

// ADMIN을 입력한 경우에만 새로운 QR 정보를 저장하고 QR 이미지를 만듭니다.
app.post(
  "/api/qr",
  requireStorage,
  requireAdmin,
  async (request, response, next) => {
    try {
      const title = typeof request.body.title === "string" ? request.body.title.trim() : "";
      const url = typeof request.body.url === "string" ? request.body.url.trim() : "";

      if (title.length < 1 || title.length > 100) {
        return response.status(400).json({ error: "QR 이름은 1자 이상 100자 이내로 입력해 주세요." });
      }

      if (url.length < 1 || url.length > 2000 || !isValidWebUrl(url)) {
        return response.status(400).json({
          error: "http:// 또는 https://로 시작하는 웹 주소를 입력해 주세요.",
        });
      }

      const slug = crypto.randomBytes(9).toString("base64url");
      const trackingUrl = `${getPublicBaseUrl(request)}/r/${slug}`;
      const createdQr = {
        id: crypto.randomUUID(),
        slug,
        title,
        target_value: url,
        visit_count: 0,
        is_active: true,
        created_at: new Date().toISOString(),
        last_visited_at: null,
      };

      const pipeline = redis.pipeline();
      pipeline.set(getQrRecordKey(slug), createdQr);
      pipeline.set(getVisitCountKey(slug), 0);
      pipeline.zadd(qrIndexKey, { score: Date.now(), member: slug });
      await pipeline.exec();

      const qrImageDataUrl = await QRCode.toDataURL(trackingUrl, {
        type: "image/png",
        width: 512,
        margin: 2,
        errorCorrectionLevel: "M",
      });

      return response.status(201).json({
        qr: createdQr,
        trackingUrl,
        qrImageDataUrl,
      });
    } catch (error) {
      return next(error);
    }
  },
);

// QR 목록 카드에서 사용할 PNG 이미지를 누구나 내려받을 수 있습니다.
app.get(
  "/api/qr/:slug/image",
  requireStorage,
  async (request, response, next) => {
    try {
      const data = await redis.get(getQrRecordKey(request.params.slug));

      if (!data) {
        return response.status(404).json({ error: "QR 정보를 찾을 수 없습니다." });
      }

      const trackingUrl = `${getPublicBaseUrl(request)}/r/${data.slug}`;
      const pngBuffer = await QRCode.toBuffer(trackingUrl, {
        type: "png",
        width: 512,
        margin: 2,
        errorCorrectionLevel: "M",
      });

      response.setHeader("Content-Type", "image/png");
      response.setHeader("Content-Disposition", `attachment; filename="qr-${data.slug}.png"`);
      return response.send(pngBuffer);
    } catch (error) {
      return next(error);
    }
  },
);

// QR을 스캔하면 방문 횟수를 기록한 다음 원래 웹 주소로 이동합니다.
app.get("/r/:slug", async (request, response, next) => {
  try {
    if (!storageReady) {
      return response.status(503).send("Vercel 저장소 연결이 필요합니다.");
    }

    const qrResult = await redis.get(getQrRecordKey(request.params.slug));

    if (!qrResult || !qrResult.is_active) {
      return response.status(404).send("사용할 수 없거나 존재하지 않는 QR 코드입니다.");
    }

    const visitedAt = new Date().toISOString();
    const pipeline = redis.pipeline();
    pipeline.incr(getVisitCountKey(request.params.slug));
    pipeline.set(getLastVisitKey(request.params.slug), visitedAt);
    await pipeline.exec();

    return response.redirect(302, qrResult.target_value);
  } catch (error) {
    return next(error);
  }
});

app.use((error, _request, response, _next) => {
  console.error("QR 서버 오류:", error);
  return response.status(500).json({
    error: `Vercel 저장소 오류: ${error.message ?? "알 수 없는 오류"}`,
  });
});

export default app;

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`QR 방문 통계 사이트가 http://localhost:${port}에서 실행 중입니다.`);
  });
}
