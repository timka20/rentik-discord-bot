const { Client, GatewayIntentBits, Partials } = require('discord.js');
const axios = require('axios');

const CONFIG = {
  DISCORD_TOKEN: 'YOUR_DISCORD_TOKEN_HERE', // Ваш Discord токен
  RENTIK_API_ID: 123456789, // Ваш RentikAI API ID
  RENTIK_API_URL: 'https://ai.timka20.ru/api/create',
  ALLOWED_CHANNELS: [ // ID разрешенных каналов
    'CHANNEL_ID_1',
    'CHANNEL_ID_2'
  ]
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ],
  partials: [
    Partials.Channel,
    Partials.Message
  ]
});

function isAllowedChannel(channelId) {
  return CONFIG.ALLOWED_CHANNELS.includes(channelId);
}

function extractMediaUrls(message) {
  const media = {
    img: null,
    video: null,
    file: null,
    audio: null
  };

  if (message.attachments.size > 0) {
    message.attachments.forEach(attachment => {
      const url = attachment.url;
      const contentType = attachment.contentType || '';
      
      if (contentType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(url)) {
        if (!media.img) media.img = url;
      }
      else if (contentType.startsWith('video/') || /\.(mp4|avi|mov|mkv|webm)$/i.test(url)) {
        if (!media.video) media.video = url;
      }
      else if (contentType.startsWith('audio/') || /\.(mp3|wav|ogg|m4a)$/i.test(url)) {
        if (!media.audio) media.audio = url;
      }
      else if (/\.(pdf|doc|docx|txt|zip|rar)$/i.test(url)) {
        if (!media.file) media.file = url;
      }
      else {
        if (!media.file) media.file = url;
      }
    });
  }

  return media;
}

async function callRentikAPI(text, username, media = {}) {
  try {
    const payload = {
      id: CONFIG.RENTIK_API_ID,
      text: text,
      role: 'rentik',
      username: username
    };

    if (media.img) payload.img = media.img;
    if (media.video) payload.video = media.video;
    if (media.file) payload.file = media.file;
    if (media.audio) payload.audio = media.audio;

    console.log('📤 Отправка запроса:', { text: text.substring(0, 50), username, hasMedia: !!(media.img || media.video || media.file || media.audio) });

    const response = await axios.post(CONFIG.RENTIK_API_URL, payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 35000
    });

    console.log('📥 Получен ответ:', response.data);

    return response.data;
  } catch (error) {
    console.error('❌ Ошибка API запроса:', error.response?.data || error.message);
    
    if (error.code === 'ECONNABORTED') {
      return {
        error: 'true',
        check_answer: 'Превышено время ожидания ответа от сервера. Попробуйте еще раз.'
      };
    }
    
    return {
      error: 'true',
      check_answer: 'Произошла ошибка при обращении к API. Попробуйте позже.'
    };
  }
}

function splitMessage(text, maxLength = 2000) {
  const messages = [];
  let currentMessage = '';

  const lines = text.split('\n');
  
  for (const line of lines) {
    if ((currentMessage + line + '\n').length > maxLength) {
      if (currentMessage) {
        messages.push(currentMessage.trim());
        currentMessage = '';
      }
      
      if (line.length > maxLength) {
        for (let i = 0; i < line.length; i += maxLength) {
          messages.push(line.slice(i, i + maxLength));
        }
      } else {
        currentMessage = line + '\n';
      }
    } else {
      currentMessage += line + '\n';
    }
  }
  
  if (currentMessage.trim()) {
    messages.push(currentMessage.trim());
  }
  
  return messages.length > 0 ? messages : [text];
}

client.on('ready', () => {
  console.log('\n╔════════════════════════════════════╗');
  console.log(`║  🤖 Бот ${client.user.tag} запущен!`);
  console.log('╚════════════════════════════════════╝');
  console.log(`📡 Активных каналов: ${CONFIG.ALLOWED_CHANNELS.length}`);
  
  client.user.setPresence({
    activities: [{ name: 'с RentikAI | @mention меня' }],
    status: 'online'
  });
});

client.on('messageCreate', async (message) => {
  
  try {
    if (message.author.bot) {
      return;
    }

    const channelAllowed = isAllowedChannel(message.channel.id);

    if (!channelAllowed) {
      return;
    }

    let messageText = message.content.replace(/<@!?\d+>/g, '').trim();
    
    if (!messageText && message.attachments.size > 0) {
      messageText = 'Что ты можешь сказать об этом файле/медиа?';
    }

    if (!messageText) {
      return;
    }    
    await message.channel.sendTyping();

    const media = extractMediaUrls(message);
    
    if (media.img || media.video || media.file || media.audio) {
      console.log('Вложения:', Object.entries(media).filter(([k, v]) => v).map(([k]) => k).join(', '));
    }
    const response = await callRentikAPI(
      messageText,
      message.author.username,
      media
    );

    if (response.check_answer) {
      const answer = response.check_answer;
      
      if (answer === 'timeout') {
        await message.reply('⏱️ Превышено время ожидания ответа от сервера. Попробуйте еще раз.');
        return;
      }

      const messageParts = splitMessage(answer);
      await message.reply(messageParts[0]);

      for (let i = 1; i < messageParts.length; i++) {
        await message.channel.sendTyping();
        await new Promise(resolve => setTimeout(resolve, 500));
        await message.channel.send(messageParts[i]);
      }
    } else {
      await message.reply('❌ Не удалось получить ответ от RentikAI. Попробуйте позже.');
    }

  } catch (error) {
    try {
      await message.reply('⚠️ Произошла ошибка при обработке вашего запроса. Попробуйте еще раз.');
    } catch (replyError) {
      console.error('❌ Не удалось отправить сообщение об ошибке:', replyError);
    }
  }
});

client.on('error', (error) => {
  console.error('\n❌ Ошибка Discord клиента:', error);
});

client.on('warn', (warning) => {
  console.warn('⚠️ Предупреждение:', warning);
});

client.on('debug', (info) => {
  if (info.includes('heartbeat')) return;
  console.log('🐛 Debug:', info);
});

client.login(CONFIG.DISCORD_TOKEN).catch(error => {
  console.error('\nОШИБКА АВТОРИЗАЦИИ:', error.message);
  console.error('Проверьте:');
  console.error('1. Правильность токена');
  console.error('2. Включены ли intents в Discord Developer Portal:');
  console.error('   - SERVER MEMBERS INTENT');
  console.error('   - MESSAGE CONTENT INTENT');
  console.error('3. Приглашен ли бот на сервер');
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n👋 Завершение работы бота...');
  client.destroy();
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled promise rejection:', error);
});