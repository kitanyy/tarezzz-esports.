
const crypto = require("crypto");

const COOKIE = "admin_session";
const SESSION_HOURS = 8;

const clean = (value, max = 500) =>
  String(value || "").trim().slice(0, max);

const response = (statusCode, data, headers = {}) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...headers
  },
  body: JSON.stringify(data)
});

function sign(value, secret) {
  return crypto.createHmac("sha256", secret)
    .update(value)
    .digest("base64url");
}

function makeSession(secret) {
  const payload = Buffer.from(JSON.stringify({
    exp: Date.now() + SESSION_HOURS * 60 * 60 * 1000
  })).toString("base64url");

  return payload + "." + sign(payload, secret);
}

function validSession(event, secret) {
  const cookieHeader = Object.entries(event.headers || {})
    .find(([key]) => key.toLowerCase() === "cookie")?.[1] || "";

  const token = cookieHeader
    .split(";")
    .map(x => x.trim())
    .find(x => x.startsWith(COOKIE + "="))
    ?.slice(COOKIE.length + 1);

  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [payload, signature] = parts;
  const expected = sign(payload, secret);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return false;
  }

  try {
    return JSON.parse(
      Buffer.from(payload, "base64url").toString()
    ).exp > Date.now();
  } catch {
    return false;
  }
}

exports.handler = async (event) => {
  if (!["GET", "POST"].includes(event.httpMethod)) {
    return response(405, { error: "Method not allowed" });
  }

  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_SESSION_SECRET;

  if (!password || !secret || secret.length < 32) {
    return response(500, { error: "Admin configuration error" });
  }

  let data = {};

  if (event.httpMethod === "POST") {
    try {
      data = JSON.parse(event.body || "{}");
    } catch {
      return response(400, { error: "Invalid JSON" });
    }
  }

  if (event.httpMethod === "POST" && data.action === "login") {
    const supplied = crypto.createHash("sha256")
      .update(String(data.password || ""))
      .digest();

    const actual = crypto.createHash("sha256")
      .update(password)
      .digest();

    if (!crypto.timingSafeEqual(supplied, actual)) {
      return response(401, { error: "Wrong password" });
    }

    const token = makeSession(secret);

    return response(200, { ok: true }, {
      "Set-Cookie":
        `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`
    });
  }

  if (event.httpMethod === "POST" && data.action === "logout") {
    return response(200, { ok: true }, {
      "Set-Cookie":
        `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`
    });
  }

  if (!validSession(event, secret)) {
    return response(401, { error: "Unauthorized" });
  }

  try {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore("tarezzz-admin");

    if (event.httpMethod === "GET") {
      const saved = await store.get("content", { type: "json" });

      return response(200, saved || {
        news: [],
        matches: []
      });
    }

    if (data.action !== "save") {
      return response(400, { error: "Unknown action" });
    }

    if (
      !data.content ||
      !Array.isArray(data.content.news) ||
      !Array.isArray(data.content.matches) ||
      data.content.news.length > 50 ||
      data.content.matches.length > 50
    ) {
      return response(400, { error: "Invalid content" });
    }

    const content = {
      news: data.content.news.map(item => ({
        id: clean(item.id, 40) || crypto.randomUUID(),
        category: clean(item.category, 50),
        title: clean(item.title, 120),
        text: clean(item.text, 1000),
        date: clean(item.date, 30)
      })),
      matches: data.content.matches.map(item => ({
        id: clean(item.id, 40) || crypto.randomUUID(),
        date: clean(item.date, 30),
        opponent: clean(item.opponent, 100),
        score: clean(item.score, 30),
        status: clean(item.status, 40),
        tournament: clean(item.tournament, 120)
      }))
    };

    await store.setJSON("content", content);

    return response(200, { ok: true });
  } catch (error) {
    return response(500, { error: "Storage error" });
  }
};
