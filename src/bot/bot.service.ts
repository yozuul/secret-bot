import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Ctx, Message, On, Start, Update } from 'nestjs-telegraf';

import { ShedulerService } from './sheduler.service';
import { Context } from './context.interface';

@Injectable()
@Update()
export class BotService {
   constructor(
      private readonly sheduleService: ShedulerService
   ) {}
   @Start()
   async startCommand(@Ctx() ctx: Context) {
      await this.setMenu(ctx)
      await this.startedMessage(ctx)
   }

   @On('contact')
   async cintactMessage(@Ctx() ctx: Context, @Message() message) {
      const configService = new ConfigService();
      const allowedPhones = configService.get('ALLOWED_PHONES')?.split(',') || [];
      let userPhone = message?.contact?.phone_number
      if(userPhone) {
         userPhone = userPhone.replace(/^\+/, '');
      } else {
         ctx.reply('Ошибка предоставления номера')
         return
      }
      if(allowedPhones.includes(userPhone)) {
         ctx.session.date = {
            day: '', time: '', fullStr: null
         }
         ctx.session.awaitingInput = ''
         ctx.session.user = {
            tgId: message.from.id,
            phone: userPhone
         }
         await this.sheduleService.findOrCreateUser({
            name: message.from?.first_name,
            phone: userPhone,
            tgId: message.from.id.toString(),
         })
         await ctx.scene.enter('STARTED_SCENE')
      } else {
         ctx.reply('У вас нет доступа к боту')
         return
      }
   }

   async startedMessage(ctx: Context) {
      if(!ctx.session.user) {
         await ctx.reply('Предоставьте боту ваш номер телефона', {
            reply_markup: {
               keyboard: [
                  [{ text: 'Предоставить ☎️', request_contact: true }]
               ],
               one_time_keyboard: true,
               resize_keyboard: true,
            },
            parse_mode: 'Markdown'
         });
      } else {
         ctx.scene.enter('STARTED_SCENE')
      }
   }

   async setMenu(@Ctx() ctx: Context) {
      await ctx.telegram.setMyCommands(
         [
            { command: 'start', description: 'Перезапустить бота' }
         ],
         { scope: { type: 'all_private_chats' } }
      );
   }
}
