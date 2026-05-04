import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateClientBotMenu() {
  try {
    console.log('🔄 Updating Cartie_Client_Bot configuration...');

    // Update menu buttons with stable callback data
    const updatedConfig = await prisma.botConfig.update({
      where: { botUsername: 'Cartie_Client_Bot' },
      data: {
        menuConfig: {
          buttons: [
            {
              text: '🚗 Знайти авто',
              callback_data: 'open_miniapp_inventory'
            },
            {
              text: '📝 Заявка на авто',
              callback_data: 'open_miniapp_request'
            },
            {
              text: '⭐ Обране',
              callback_data: 'open_miniapp_favorites'
            },
            {
              text: '📊 Статус заявки',
              callback_data: 'open_miniapp_status'
            },
            {
              text: '💰 Продати авто',
              callback_data: 'open_miniapp_sell'
            },
            {
              text: '❓ Підтримка',
              callback_data: 'open_support'
            },
            {
              text: 'ℹ️ Про CarTié',
              callback_data: 'show_about'
            }
          ]
        },
        miniAppConfig: {
          navItems: [
            {
              id: 'home',
              label: 'Головна',
              icon: 'home',
              view: 'HOME'
            },
            {
              id: 'inventory',
              label: 'Каталог',
              icon: 'car',
              view: 'INVENTORY'
            },
            {
              id: 'favorites',
              label: 'Обране',
              icon: 'star',
              view: 'FAVORITES'
            },
            {
              id: 'request',
              label: 'Заявка',
              icon: 'document',
              view: 'REQUEST'
            },
            {
              id: 'status',
              label: 'Статус',
              icon: 'chart',
              view: 'STATUS'
            }
          ]
        },
        welcomeMessage: `👋 Вітаємо в CarTié!

🚗 Знайдіть своє ідеальне авто з нашою допомогою

Використуйте меню нижче для швидкого доступу:
• 🚗 Знайти авто - переглянути каталог
• 📝 Заявка на авто - подати запит на пошук
• ⭐ Обране - ваші обрані авто
• 📊 Статус заявки - перевірити статус
• 💰 Продати авто - продати свій автомобіль
• ❓ Підтримка - зв'язатися з менеджером
• ℹ️ Про CarTié - дізнатися більше про нас

Ми допоможемо вам знайти найкращі пропозиції! 🎯`,
        miniAppUrl: 'https://cartie.com/miniapp'
      }
    });

    console.log('✅ Successfully updated Cartie_Client_Bot configuration');
    console.log('📋 Menu buttons:', updatedConfig.menuConfig?.buttons);
    console.log('🧭 Navigation items:', updatedConfig.miniAppConfig?.navItems);

  } catch (error) {
    console.error('❌ Error updating bot configuration:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the update
updateClientBotMenu()
  .then(() => {
    console.log('🎉 Update completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Update failed:', error);
    process.exit(1);
  });
