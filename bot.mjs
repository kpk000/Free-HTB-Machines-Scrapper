import axios from "axios";

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
    });
  } catch (error) {
    console.error("Error al enviar mensaje:", error);
  }
}
