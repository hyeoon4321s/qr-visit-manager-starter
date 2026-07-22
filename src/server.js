import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import QRCode from "qrcode";
import { createClient } from "@supabase/supabase-js";

// 새 형식의 Publishable/Secret 키와 기존 Anon/Service Role 키를 모두 지원합니다.
const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabasePublicKey = (
  process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY
)?.trim();
const supabaseServerKey = (
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
)?.trim();
const configuredPublicBaseUrl = process.env.PUBLIC_BASE_URL?.trim();
const configuredAdminKey = process.env.ADMIN_API_KEY?.trim();

function isExampleValue(value) {
  return (
    !value ||
    value.includes("your-project") ||
    value.includes("your_key") ||
    value.includes("your_service") ||
    value.includes("실제프로젝트") ||
    value.includes("변경하세요")
  );
}

function isValidUrl(value) {
  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}

function getLegacyJwtRole(value) {
  try {
    const payloadPart = value.split(".")[1];

    if (!payloadPart) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
    return payload.role ?? null;
  } catch {
    return null;
  }
}

function isValidServerKey(value) {
  return (
    (value?.startsWith("sb_secret_") && value.length > 20) ||
    getLegacyJwtRole(value ?? "") === "service_role"
  );
}

// 로컬 학습 환경에서는 서버 비밀 키가 없어도 공개 키로 테스트할 수 있습니다.
// Vercel 배포 환경에서는 반드시 정상적인 Secret 또는 Service Role 키가 필요합니다.
const localTestMode = !process.env.VERCEL && !isValidServerKey(supabaseServerKey);

const configurationErrors = [];

if (isExampleValue(supabaseUrl) || !isValidUrl(supabaseUrl)) {
  configurationErrors.push("SUPABASE_URL에 Supabase의 실제 프로젝트 주소를 입력해 주세요.");
}

if (isExampleValue(supabasePublicKey)) {
  configurationErrors.push(
    "SUPABASE_PUBLISHABLE_KEY 또는 SUPABASE_ANON_KEY에 실제 공개 키를 입력해 주세요.",
  );
}

if (process.env.VERCEL && !isValidServerKey(supabaseServerKey)) {
  configurationErrors.push(
    "Vercel에서는 SUPABASE_SECRET_KEY 또는 SUPABASE_SERVICE_ROLE_KEY에 실제 서버 비밀 키가 필요합니다.",
  );
}

if (isExampleValue(configuredPublicBaseUrl) || !isValidUrl(configuredPublicBaseUrl)) {
  configurationErrors.push("PUBLIC_BASE_URL에 현재 서비스 주소를 입력해 주세요.");
}

if (isExampleValue(configuredAdminKey) || configuredAdminKey.length < 12) {
  configurationErrors.push("ADMIN_API_KEY를 12자 이상의 새로운 관리자 키로 변경해 주세요.");
}

if (configurationErrors.length > 0) {
  throw new Error(`환경변수 설정을 확인해 주세요:\n- ${configurationErrors.join("\n- ")}`);
}

const app = express();
const port = Number(process.env.PORT ?? 3000);
const publicBaseUrl = configuredPublicBaseUrl.replace(/\/$/, "");
const publicDirectory = fileURLToPath(new URL("../public", import.meta.url));
const adminDatabaseKey = localTestMode ? supabasePublicKey : supabaseServerKey;

// 공개용 클라이언트는 방문 횟수를 기록하는 데이터베이스 함수만 호출합니다.
const publicSupabase = createClient(
  supabaseUrl,
  supabasePublicKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

// 관리자용 클라이언트는 QR 생성과 목록 조회에만 사용합니다.
// 로컬 테스트 모드에서는 공개 키와 테스트용 RLS 정책을 사용합니다.
const adminSupabase = createClient(
  supabaseUrl,
  adminDatabaseKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));
app.use(express.static(publicDirectory, { index: false }));

// 두 문자열을 일정한 시간 동안 비교하여 관리자 키 추측 공격 위험을 줄입니다.
function isSameSecret(receivedValue, expectedValue) {
  const receivedBuffer = Buffer.from(receivedValue ?? "");
  const expectedBuffer = Buffer.from(expectedValue ?? "");

  return (
    receivedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

// QR 생성과 관리자 목록 API에 임시 관리자 키를 적용합니다.
// 실제 서비스에서는 이 부분을 Supabase Auth 관리자 로그인으로 교체할 수 있습니다.
function requireAdmin(request, response, next) {
  const receivedAdminKey = request.get("x-admin-key");

  if (!isSameSecret(receivedAdminKey, configuredAdminKey)) {
    return response.status(401).json({ error: "관리자 키가 올바르지 않습니다." });
  }

  return next();
}

function isValidHttpUrl(value) {
  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}

// 안내 문자를 HTML에 안전하게 표시하기 위한 함수입니다.
function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// QR 생성 화면을 보여줍니다.
app.get("/", (_request, response) => {
  response.sendFile("index.html", { root: publicDirectory });
});

// 누적 방문 통계를 확인하는 관리자 화면을 보여줍니다.
app.get("/admin", (_request, response) => {
  response.sendFile("admin.html", { root: publicDirectory });
});

// 서버가 정상 실행 중인지 확인합니다.
app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    message: "QR 방문 통계 서버가 실행 중입니다.",
    mode: localTestMode ? "local-test" : "secure",
  });
});

// 로컬 테스트 모드에서만 관리자 키를 화면에 자동으로 채워줍니다.
// Vercel에서는 이 주소가 키를 절대 반환하지 않습니다.
app.get("/api/test-config", (_request, response) => {
  response.setHeader("Cache-Control", "no-store");

  if (!localTestMode) {
    return response.status(404).json({ error: "테스트 설정을 사용할 수 없습니다." });
  }

  return response.json({
    testMode: true,
    adminKey: configuredAdminKey,
    visitorKeyRequired: false,
  });
});

// 새로운 QR 정보를 저장하고 내려받을 수 있는 PNG 이미지 데이터를 반환합니다.
app.post("/api/admin/qr", requireAdmin, async (request, response, next) => {
  try {
    const title = typeof request.body.title === "string" ? request.body.title.trim() : "";
    const targetType = request.body.targetType;
    const targetValue =
      typeof request.body.targetValue === "string" ? request.body.targetValue.trim() : "";

    if (title.length < 1 || title.length > 100) {
      return response.status(400).json({ error: "제목은 1자 이상 100자 이내여야 합니다." });
    }

    if (targetType !== "url" && targetType !== "text") {
      return response.status(400).json({ error: "대상 종류는 URL 또는 안내 문자여야 합니다." });
    }

    if (targetValue.length < 1 || targetValue.length > 2000) {
      return response
        .status(400)
        .json({ error: "연결 정보는 1자 이상 2,000자 이내여야 합니다." });
    }

    if (targetType === "url" && !isValidHttpUrl(targetValue)) {
      return response.status(400).json({ error: "http 또는 https로 시작하는 주소를 입력해 주세요." });
    }

    // 충분히 긴 무작위 코드를 만들어 주소가 서로 겹칠 가능성을 매우 낮춥니다.
    const slug = crypto.randomBytes(9).toString("base64url");
    const trackingUrl = `${publicBaseUrl}/r/${slug}`;

    const { data: createdQr, error: createError } = await adminSupabase
      .from("qr_codes")
      .insert({
        slug,
        title,
        target_type: targetType,
        target_value: targetValue,
      })
      .select("id, slug, title, target_type, target_value, visit_count, created_at")
      .single();

    if (createError) {
      throw createError;
    }

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
});

// 관리자 화면에 필요한 QR 목록과 누적 방문 횟수를 반환합니다.
app.get("/api/admin/qr", requireAdmin, async (_request, response, next) => {
  try {
    const { data, error } = await adminSupabase
      .from("qr_codes")
      .select(
        "id, slug, title, target_type, target_value, visit_count, is_active, created_at, last_visited_at",
      )
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const qrCodes = data.map((qrCode) => ({
      ...qrCode,
      tracking_url: `${publicBaseUrl}/r/${qrCode.slug}`,
      image_url: `${publicBaseUrl}/api/admin/qr/${qrCode.slug}/image`,
    }));

    return response.json({ qrCodes });
  } catch (error) {
    return next(error);
  }
});

// 이미 만든 QR 이미지를 다시 내려받을 수 있도록 PNG 파일을 반환합니다.
app.get("/api/admin/qr/:slug/image", requireAdmin, async (request, response, next) => {
  try {
    const { data, error } = await adminSupabase
      .from("qr_codes")
      .select("slug")
      .eq("slug", request.params.slug)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return response.status(404).json({ error: "QR 정보를 찾을 수 없습니다." });
    }

    const trackingUrl = `${publicBaseUrl}/r/${data.slug}`;
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
});

// QR 스캔 때 호출되는 공개 주소입니다.
// 방문 횟수를 기록한 다음 목표 주소로 이동시키거나 안내 문자를 보여줍니다.
app.get("/r/:slug", async (request, response, next) => {
  try {
    const { data, error } = await publicSupabase.rpc("record_qr_visit", {
      p_slug: request.params.slug,
    });

    if (error) {
      throw error;
    }

    const qrResult = data?.[0];

    if (!qrResult) {
      return response.status(404).send("사용할 수 없거나 존재하지 않는 QR 코드입니다.");
    }

    if (qrResult.result_target_type === "url") {
      // 영구 이동은 브라우저가 저장할 수 있으므로 방문 집계를 위해 302를 사용합니다.
      return response.redirect(302, qrResult.result_target_value);
    }

    const safeTitle = "안내 정보";
    const safeText = escapeHtml(qrResult.result_target_value).replaceAll("\n", "<br>");

    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    );
    return response.type("html").send(`<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${safeTitle}</title>
    <style>
      body { margin: 0; padding: 32px 20px; font-family: system-ui, sans-serif; background: #f4f1e8; color: #15352d; }
      main { max-width: 680px; margin: 0 auto; padding: 28px; border: 1px solid #d9ded7; border-radius: 20px; background: white; box-shadow: 0 16px 50px rgba(21,53,45,.1); }
      h1 { margin-top: 0; font-size: 1.5rem; }
      p { margin-bottom: 0; line-height: 1.8; overflow-wrap: anywhere; }
    </style>
  </head>
  <body><main><h1>${safeTitle}</h1><p>${safeText}</p></main></body>
</html>`);
  } catch (error) {
    return next(error);
  }
});

// 처리되지 않은 오류의 내부 내용을 숨기고 공통 응답으로 반환합니다.
app.use((error, _request, response, _next) => {
  console.error("서버 오류:", error);

  if (
    localTestMode &&
    (error.code === "42501" ||
      error.message?.includes("row-level security") ||
      error.message?.includes("permission denied"))
  ) {
    return response.status(500).json({
      error: "Supabase SQL Editor에서 최신 supabase/schema.sql을 다시 실행해 주세요.",
    });
  }

  response.status(500).json({ error: "서버 처리 중 오류가 발생했습니다." });
});

// Vercel은 기본 내보내기를 자동으로 서버 함수로 인식합니다.
export default app;

// 로컬에서 직접 실행할 때만 포트를 열어 개발 서버를 시작합니다.
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`QR 방문 통계 서버가 ${publicBaseUrl}에서 실행 중입니다.`);
    if (localTestMode) {
      console.log("로컬 테스트 모드: 방문자는 키 없이 이용하고 관리자 키는 화면에 표시됩니다.");
    }
  });
}
