import axios from "axios";
import { parse } from "dotenv";

export async function sendTelegramMessage(message) {
  const botToken = process.env.botToken;
  const chatId = process.env.chatId;
  if (!botToken || !chatId) {
    return;
  }
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    const response = await axios.post(url, {
      chat_id: chatId,
      text: message,
      parse_mode: "html",
    });
  } catch (error) {
    console.error("Error al enviar mensaje:", error);
  }
}
