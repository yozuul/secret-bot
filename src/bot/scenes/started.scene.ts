import { resolve } from 'node:path'
import { Injectable } from '@nestjs/common';
import { Scene, SceneEnter, Ctx, On, Message, Action, Start, Hears } from 'nestjs-telegraf';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

import { Context } from '../context.interface';
import { BotService } from '../bot.service';
import { ShedulerService } from '../sheduler.service';
import { ParserService } from 'src/parser/parser.service';

@Scene('STARTED_SCENE')
@Injectable()
export class StartedScene {
   constructor(
      private readonly botService: BotService,
      private readonly sheduleService: ShedulerService,
      private readonly parserService: ParserService,
   ) {}

   @SceneEnter()
   async onSceneEnter(@Ctx() ctx: Context) {
      const imagePath = resolve('./data/grinch.png');
      await ctx.replyWithPhoto({
          source: imagePath,
      });
      await this.showStartedKeyboard(ctx, 'Добро пожаловать!')
   }

  @Hears('📅 Указать дату события')
  async setDate(@Ctx() ctx: Context) {
      ctx.session.awaitingInput = 'set_date';
      await ctx.reply('Укажите дату в формате 01-01-2025\nПо две цифры день-месяц, и год полностью через дефис, без пробелов. Максимум на 24 дня вперёд.');
  }

  @Hears('⏰ Проверить дату')
  async getDate(@Ctx() ctx: Context) {
      const eventDate = await this.sheduleService.findEventDate()
      const date = new Date(eventDate.get('date'));
      const currentDate = new Date();
      const formatDate = format(date, 'dd MMMM yyyy в HH:mm', { locale: ru });
      await ctx.reply('📆')
      if(date > currentDate) {
         await ctx.reply(`Событие ${formatDate} ещё не наступило.\nЯ внимательно слежу, и не пропущу его.`)
      } else {
         await this.showStartedKeyboard(ctx, `Событие ${formatDate} уже прошло. \nМожно задать новую дату.`)
      }
      console.log(date)
  }

  @Hears('⚙️ Проверить бота')
  async checkBot(ctx: Context) {
      this.parserService.processContacts(ctx)
  }

   @Start()
   async start(ctx) {
      delete ctx.session.user
      await ctx.scene.leave()
      await this.botService.startedMessage(ctx)
   }

   @On('text')
   async handleTextInput(@Ctx() ctx: Context, @Message() message) {
      if(ctx.session.awaitingInput === 'set_date') {
         try {
            await this.checkDate(ctx, message.text)
         } catch (error) {
            console.log('Ошибка проверки даты')
         }
         return
      }
      if(ctx.session.awaitingInput === 'set_time') {
         try {
            await this.checkTime(ctx, message.text)
         } catch (error) {
            console.log('Ошибка проверки времени')
         }
         return
      }
   }

   @Action('confirmEventDate')
   async saveEventDate(ctx: Context) {
      try {
         const event = await this.sheduleService.updateEventDate(ctx.session.date.fullStr)
         await this.sheduleService.scheduleEvent(
            event.get('id'), new Date(event.get('date'))
         )
         await ctx.reply('🎄')
         await this.showStartedKeyboard(
            ctx, 'Готово! \nКак только наступит указанное время, я сделаю всю работу'
         )
         await ctx.answerCbQuery('Дата сохранена')
      } catch (error) {
         console.log(`Ошибка обработкт @Action('confirmEventDate updateEventDate')`)
      }
      try {
         await ctx.deleteMessage()
      } catch (error) {
         console.log(`Ошибка обработкт @Action('confirmEventDate deleteMessage')`)
      }
   }

   @Action('canselSaveEventDate')
   async canselSaveEventDate(ctx: Context) {
      try {
         await ctx.reply('❌')
         await this.showStartedKeyboard(
            ctx, 'Как будете готовы, воспользуйтесь кнопками внизу экрана'
         )
         await ctx.answerCbQuery('Действие отменено')
      } catch (error) {
         console.log(`Ошибка обработкт @Action('confirmEventDate showStartedKeyboard')`)
      }
      try {
         await ctx.deleteMessage()
      } catch (error) {
         console.log(`Ошибка обработкт @Action('confirmEventDate deleteMessage')`)
      }
   }

   async confirmDate(ctx: Context, { hours, minutes }) {
      const parsedDate = this.parseDate(ctx.session.date.day)
      const datetime = new Date(parsedDate);
      datetime.setHours(hours, minutes);
      const currentDate = new Date()
      const datetimeStr = format(datetime, 'dd MMMM yyyy в HH-mm', { locale: ru });
      // Проверка, что дата не в прошлом
      if(datetime < currentDate) {
         await ctx.reply('❌')
         await this.showStartedKeyboard(
            ctx, `Указанная дата ${datetimeStr} уже прошла\nПопробуйте заново`
         )
         return
      }
      // Проверка, что дата не дальше 24 дней
      const maxDelay = 2_147_483_647; // ~24.8 дня в миллисекундах
      const delay = datetime.getTime() - currentDate.getTime();
      if (delay > maxDelay) {
         await ctx.reply('❌');
         await this.showStartedKeyboard(
            ctx,
            `Указанная дата ${datetimeStr} слишком далеко\nПожалуйста, попробуйте заново, указав дату ближе к текущей (не далее 24 дней)`
         );
         return;
      }
      // Если проверки пройдены, сохраняем дату и запрашиваем подтверждение
      ctx.session.date.fullStr = datetime
      await ctx.reply(`Событие произойдёт ${datetimeStr}, всё верно?`, {
         reply_markup: {
            inline_keyboard: [
               [
                  { text: '👍 Да', callback_data: 'confirmEventDate' },
                  { text: '❌ Отмена', callback_data: 'canselSaveEventDate' }
               ],
            ],
         },
      });
   }

   async checkDate(ctx, date) {
      const parsedDate = this.parseDate(date)
      if (parsedDate) {
         ctx.session.date.day = date
         await ctx.reply('Укажите время в формате 12-00\nПо две цифры час-минуты в 24-часовом формате');
         ctx.session.awaitingInput = 'set_time';
     } else {
         await ctx.reply('Неверный формат! \nУкажите дату в формате 01-01-2025\nПо две цифры день-месяц, и год полностью через дефис, без пробелов. Максимум на 24 дня вперёд.');
     }
   }

   async checkTime(ctx: Context, time: string) {
      const parsedTime = this.parseTime(time)
      if (parsedTime) {
         ctx.session.date.time = time
         ctx.session.awaitingInput = ''
         this.confirmDate(ctx, parsedTime)
     } else {
         await ctx.reply('Неверный формат!!!! \nВведите время в формате 12:00\nПо две цифры час-минуты в 24-часовом формате.');
     }
   }

   private parseDate(text: string): Date | null {
      const [day, month, year] = text.split('-').map(Number);
      if (day && month && year && day <= 31 && month <= 12) {
        const date = new Date(year, month - 1, day);
        if (date.getDate() === day && date.getMonth() === month - 1 && date.getFullYear() === year) {
          return date;
        }
      }
      return null;
   }

    private parseTime(text: string): { hours: number; minutes: number } | null {
      const [hours, minutes] = text.split('-').map(Number);
      if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
        return { hours, minutes };
      }
      return null;
    }

    async showStartedKeyboard(ctx: Context, title) {
      await ctx.reply(title, {
         reply_markup: {
             keyboard: [
                 [{ text: '📅 Указать дату события' }, { text: '⏰ Проверить дату' }],
                 [{ text: '⚙️ Проверить бота' }],
             ],
             resize_keyboard: true,
         },
     });
    }
}