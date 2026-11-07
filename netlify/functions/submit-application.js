const CHAT_ID = "1918211551";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { statusCode: 500, body: JSON.stringify({ error: "Telegram is not configured" }) };
  }

  try {
    const data = JSON.parse(event.body || "{}");
    const clean = (v, max) => String(v || "").trim().slice(0, max);

    const nick = clean(data.nick, 60);
    const cups = clean(data.cups, 20);
    const rank = clean(data.rank, 40);
    const contact = clean(data.contact, 100);
    const about = clean(data.about, 500);

    if (!nick || !cups || !rank || !contact) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
    }

    const message = `📩 НОВА ЗАЯВКА — TAREZZZ ESPORTS

🎮 Нік: ${nick}
🏆 Кубки: ${cups}
⚔️ Ranked: ${rank}
📬 Контакт: ${contact}
📝 Про себе: ${about || "—"}`;

    const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text: message })
    });

    const result = await tg.json();

    if (!tg.ok || !result.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: "Telegram delivery failed" }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request" }) };
  }
};
