import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { del, list, put } from "@vercel/blob";
import express from "express";
import QRCode from "qrcode";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const publicDirectory = fileURLToPath(new URL("../public", import.meta.url));
// 최신 Vercel Blob 연결은 OIDC 자동 인증을 기본으로 사용하므로 장기 토큰이 보이지 않을 수 있습니다.
// Vercel에서는 연결된 Blob 저장소 ID로 준비 상태를 확인하고, 로컬에서는 기존 토큰도 지원합니다.
const storageReady = Boolean(
  process.env.BLOB_READ_WRITE_TOKEN ||
    (process.env.VERCEL && process.env.BLOB_STORE_ID),
);

// 학습용 고정 관리자 코드입니다. 실제 서비스에서는 로그인 기능을 사용하는 것이 안전합니다.
const adminCode = "ADMIN";
const qrPrefix = "qr-codes/";
const visitPrefix = "qr-visits/";

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
    return response.status(401).json({ error: "관리자 코드가 올바르지 않습니다." });
  }

  return next();
}

function requireStorage(_request, response, next) {
  if (!storageReady) {
    return response.status(503).json({
      error: "Vercel 프로젝트에 Blob 저장소를 연결해 주세요.",
    });
  }

  return next();
}

function getPublicBaseUrl(request) {
  const forwardedProtocol = request.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.get("x-forwarded-host")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol || request.protocol || "http";
  const host = forwardedHost || request.get("host") || `localhost:${port}`;
  return `${protocol}://${host}`;
}

// Blob 목록은 한 번에 최대 1,000개씩 읽을 수 있으므로 다음 페이지가 있으면 이어서 읽습니다.
async function listAllBlobs(prefix) {
  const blobs = [];
  let cursor;

  do {
    const page = await list({ prefix, limit: 1000, cursor });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  return blobs;
}

async function readJsonBlob(blob) {
  const result = await fetch(blob.url, { cache: "no-store" });

  if (!result.ok) {
    throw new Error(`Blob 파일을 읽지 못했습니다. 상태 코드: ${result.status}`);
  }

  return result.json();
}

async function getQrRecord(slug) {
  const pathname = `${qrPrefix}${slug}.json`;
  const page = await list({ prefix: pathname, limit: 1 });
  const blob = page.blobs.find((item) => item.pathname === pathname);
  return blob ? readJsonBlob(blob) : null;
}

async function getVisitStats(slug) {
  const visitBlobs = await listAllBlobs(`${visitPrefix}${slug}/`);

  if (visitBlobs.length === 0) {
    return { visitCount: 0, lastVisitedAt: null };
  }

  // 파일 이름이 13자리 시각으로 시작하므로 문자열 정렬만으로 최신 기록을 찾을 수 있습니다.
  visitBlobs.sort((left, right) => left.pathname.localeCompare(right.pathname));
  const lastVisit = visitBlobs.at(-1);

  return {
    visitCount: visitBlobs.length,
    lastVisitedAt: lastVisit?.uploadedAt
      ? new Date(lastVisit.uploadedAt).toISOString()
      : null,
  };
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
    storage: "vercel-blob",
    message: storageReady
      ? "QR 생성 및 방문 통계 서버가 정상적으로 실행 중입니다."
      : "Vercel Blob 저장소 연결이 필요합니다.",
  });
});

// 일반 방문자도 생성된 QR 목록과 방문 통계를 볼 수 있습니다.
app.get("/api/qr", requireStorage, async (request, response, next) => {
  try {
    const recordBlobs = await listAllBlobs(qrPrefix);
    const records = await Promise.all(recordBlobs.map(readJsonBlob));
    records.sort((left, right) => right.created_at.localeCompare(left.created_at));

    const publicBaseUrl = getPublicBaseUrl(request);
    const qrCodes = await Promise.all(
      records.slice(0, 100).map(async (record) => {
        const stats = await getVisitStats(record.slug);

        return {
          ...record,
          visit_count: stats.visitCount,
          last_visited_at: stats.lastVisitedAt,
          tracking_url: `${publicBaseUrl}/r/${record.slug}`,
          image_url: `${publicBaseUrl}/api/qr/${record.slug}/image`,
        };
      }),
    );

    return response.json({ qrCodes });
  } catch (error) {
    return next(error);
  }
});

// ADMIN을 입력한 경우에만 새 QR 정보를 Blob에 저장합니다.
app.post(
  "/api/qr",
  requireStorage,
  requireAdmin,
  async (request, response, next) => {
    try {
      const title = typeof request.body.title === "string" ? request.body.title.trim() : "";
      const url = typeof request.body.url === "string" ? request.body.url.trim() : "";

      if (title.length < 1 || title.length > 100) {
        return response.status(400).json({
          error: "QR 이름은 1자 이상 100자 이내로 입력해 주세요.",
        });
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
        is_active: true,
        created_at: new Date().toISOString(),
      };

      await put(`${qrPrefix}${slug}.json`, JSON.stringify(createdQr), {
        access: "public",
        addRandomSuffix: false,
        contentType: "application/json; charset=utf-8",
      });

      const qrImageDataUrl = await QRCode.toDataURL(trackingUrl, {
        type: "image/png",
        width: 512,
        margin: 2,
        errorCorrectionLevel: "M",
      });

      return response.status(201).json({
        qr: { ...createdQr, visit_count: 0, last_visited_at: null },
        trackingUrl,
        qrImageDataUrl,
      });
    } catch (error) {
      return next(error);
    }
  },
);

// ADMIN을 입력한 관리자만 QR 정보와 해당 QR의 방문 기록을 함께 삭제할 수 있습니다.
app.delete(
  "/api/qr/:slug",
  requireStorage,
  requireAdmin,
  async (request, response, next) => {
    try {
      const qrRecord = await getQrRecord(request.params.slug);

      if (!qrRecord) {
        return response.status(404).json({ error: "삭제할 QR 정보를 찾을 수 없습니다." });
      }

      // QR 정보를 먼저 삭제하면 삭제 도중 새로운 스캔 요청이 들어와도 더 이상 이동되지 않습니다.
      await del(`${qrPrefix}${qrRecord.slug}.json`);

      const visitBlobs = await listAllBlobs(`${visitPrefix}${qrRecord.slug}/`);
      const visitPathnames = visitBlobs.map((blob) => blob.pathname);

      // 한 요청이 지나치게 커지지 않도록 방문 기록을 1,000개씩 나누어 삭제합니다.
      for (let index = 0; index < visitPathnames.length; index += 1000) {
        await del(visitPathnames.slice(index, index + 1000));
      }

      return response.json({
        deleted: true,
        slug: qrRecord.slug,
        deletedVisitCount: visitPathnames.length,
      });
    } catch (error) {
      return next(error);
    }
  },
);

// QR 목록 카드에서 사용할 PNG 이미지를 만들어 내려보냅니다.
app.get(
  "/api/qr/:slug/image",
  requireStorage,
  async (request, response, next) => {
    try {
      const data = await getQrRecord(request.params.slug);

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

// QR을 스캔하면 방문 이벤트 파일을 하나 저장하고 원래 웹 주소로 이동합니다.
app.get("/r/:slug", async (request, response, next) => {
  try {
    if (!storageReady) {
      return response.status(503).send("Vercel Blob 저장소 연결이 필요합니다.");
    }

    const qrRecord = await getQrRecord(request.params.slug);

    if (!qrRecord || !qrRecord.is_active) {
      return response.status(404).send("사용할 수 없거나 존재하지 않는 QR 코드입니다.");
    }

    const visitedAt = new Date().toISOString();
    const eventName = `${Date.now()}-${crypto.randomUUID()}.json`;

    await put(
      `${visitPrefix}${request.params.slug}/${eventName}`,
      JSON.stringify({ visited_at: visitedAt }),
      {
        access: "public",
        addRandomSuffix: false,
        contentType: "application/json; charset=utf-8",
      },
    );

    return response.redirect(302, qrRecord.target_value);
  } catch (error) {
    return next(error);
  }
});

app.use((error, _request, response, _next) => {
  console.error("QR 서버 오류:", error);
  return response.status(500).json({
    error: `Vercel Blob 오류: ${error.message ?? "알 수 없는 오류"}`,
  });
});

export default app;

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`QR 방문 통계 사이트가 http://localhost:${port}에서 실행 중입니다.`);
  });
}
