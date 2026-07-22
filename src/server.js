import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import express from "express";
import QRCode from "qrcode";
import { createClient } from "@supabase/supabase-js";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const publicDirectory = fileURLToPath(new URL("../public", import.meta.url));

// 학습용 공개 프로젝트이므로 Supabase 주소와 anon 공개 키를 코드에 직접 넣습니다.
// 이 키는 비밀 키가 아니며 RLS 정책이 허용한 작업만 수행할 수 있습니다.
const supabaseUrl = "https://wezmcgxpkipjjvkvrtmf.supabase.co";
const supabasePublicKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indlem1jZ3hwa2lwamp2a3ZydG1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1MjQ4MzcsImV4cCI6MjEwMDEwMDgzN30.nGYdgoIklTz1KZQ9XJz0T7f9MFiyFWZN4tfS3dRMQZg";

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

const supabase = createClient(supabaseUrl, supabasePublicKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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
  response.json({
    ok: true,
    mode: "public-stats",
    message: "QR 생성 및 방문 통계 서버가 정상적으로 실행 중입니다.",
  });
});

// 관리자 코드가 공개된 학습용 코드임을 화면에 알려줍니다.
app.get("/api/config", (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.json({ adminCode, securityMode: "demo" });
});

// 일반 방문자도 생성된 QR 목록과 방문 통계를 볼 수 있습니다.
app.get("/api/qr", async (request, response, next) => {
  try {
    const { data, error } = await supabase
      .from("qr_codes")
      .select(
        "id, slug, title, target_value, visit_count, is_active, created_at, last_visited_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      throw error;
    }

    const publicBaseUrl = getPublicBaseUrl(request);
    const qrCodes = data.map((qrCode) => ({
      ...qrCode,
      tracking_url: `${publicBaseUrl}/r/${qrCode.slug}`,
      image_url: `${publicBaseUrl}/api/qr/${qrCode.slug}/image`,
    }));

    return response.json({ qrCodes });
  } catch (error) {
    return next(error);
  }
});

// ADMIN을 입력한 경우에만 새로운 QR 정보를 저장하고 QR 이미지를 만듭니다.
app.post(
  "/api/qr",
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
      const { data: createdQr, error } = await supabase
        .from("qr_codes")
        .insert({
          slug,
          title,
          target_type: "url",
          target_value: url,
        })
        .select("id, slug, title, target_value, visit_count, created_at")
        .single();

      if (error) {
        throw error;
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
  },
);

// QR 목록 카드에서 사용할 PNG 이미지를 누구나 내려받을 수 있습니다.
app.get(
  "/api/qr/:slug/image",
  async (request, response, next) => {
    try {
      const { data, error } = await supabase
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
    const { data, error } = await supabase.rpc("record_qr_visit", {
      p_slug: request.params.slug,
    });

    if (error) {
      throw error;
    }

    const qrResult = data?.[0];

    if (!qrResult) {
      return response.status(404).send("사용할 수 없거나 존재하지 않는 QR 코드입니다.");
    }

    return response.redirect(302, qrResult.result_target_value);
  } catch (error) {
    return next(error);
  }
});

app.use((error, _request, response, _next) => {
  console.error("QR 서버 오류:", error);

  if (error.code === "PGRST205" || error.message?.includes("schema cache")) {
    return response.status(500).json({
      error: "Supabase SQL Editor에서 supabase/schema.sql을 먼저 실행해 주세요.",
    });
  }

  if (
    error.code === "PGRST202" ||
    error.message?.includes("record_qr_visit")
  ) {
    return response.status(500).json({
      error: "Supabase SQL Editor에서 supabase/schema.sql을 다시 실행해 주세요.",
    });
  }

  if (
    error.code === "42501" ||
    error.message?.includes("row-level security") ||
    error.message?.includes("permission denied")
  ) {
    return response.status(500).json({
      error: "Supabase SQL Editor에서 supabase/open-demo.sql을 실행해 주세요.",
    });
  }

  return response.status(500).json({
    error: `Supabase 오류: ${error.message ?? "알 수 없는 오류"}`,
  });
});

export default app;

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`QR 방문 통계 사이트가 http://localhost:${port}에서 실행 중입니다.`);
  });
}
