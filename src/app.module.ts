import { resolve } from 'node:path'
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { SequelizeModule } from '@nestjs/sequelize';
import { TelegrafModule } from 'nestjs-telegraf';
import * as LocalSession from 'telegraf-session-local';

import { BotModule } from './bot/bot.module';
import { ParserModule } from './parser/parser.module';

import { Users, Scheduler } from './bot/models';

const sessions = new LocalSession({ database: 'session_db.json' });

@Module({
   imports: [
      ConfigModule.forRoot({
         isGlobal: true,
         envFilePath: '.env',
      }),
      SequelizeModule.forRoot({
         dialect: 'sqlite',
         storage: resolve('database.db'),
         models: [Scheduler, Users],
         autoLoadModels: true,
         logging: false
      }),
      ScheduleModule.forRoot(),
      TelegrafModule.forRoot({
         middlewares: [sessions.middleware()],
         token: process.env.TELEGRAM_BOT_TOKEN,
      }),
      BotModule, ParserModule
   ],
})
export class AppModule {}