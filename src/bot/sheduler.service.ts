import { Injectable, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { InjectModel, } from '@nestjs/sequelize';
import { SchedulerRegistry } from '@nestjs/schedule';

import { ParserService } from 'src/parser/parser.service';
import { Scheduler, Users } from './models';

@Injectable()
export class ShedulerService implements OnModuleInit {
   constructor(
      @InjectModel(Users)
      private usersRepository: typeof Users,
      @InjectModel(Scheduler)
      private shedulerRepository: typeof Scheduler,
      @Inject(forwardRef(() => ParserService))
      private readonly parserService: ParserService,
      private readonly schedulerRegistry: SchedulerRegistry,
   ) {}

   async onModuleInit() {
      const event = await (await this.findEventDate()).toJSON()
      const currentDate = new Date()
      const eventDate = new Date(event.date)
      if(currentDate < eventDate) {
         try {
            this.scheduleEvent(event.id, eventDate)
         } catch (error) {
            console.log('Ошибка постановки задачи', error)
         }
      }
   }

   scheduleEvent(sheduleId: string, triggerTime: Date): void {
      const jobName = `event_${sheduleId}`;
      const runAt = new Date(triggerTime.getTime() - 120000);
      const now = new Date();
      const delay = runAt.getTime() - now.getTime();

      // Пытаемся удалить старую задачу, игнорируя ошибку, если задачи нет
      try {
         this.schedulerRegistry.deleteTimeout(jobName);
         console.log(`Старая задача ${jobName} удалена`);
      } catch (error) {
         console.log(`Задача ${jobName} не найдена или не может быть удалена:`, error.message);
      }

      // Планируем новую задачу, если время еще не наступило
      if (delay > 0) {
         this.schedulerRegistry.addTimeout(jobName, setTimeout(() => {
            this.parserService.processContacts()
         }, delay));
         console.log(`Задача ${jobName} запланирована на ${runAt.toISOString()} (за 2 минуты до ${triggerTime.toISOString()})`);
      } else {
         console.log(`Время ${runAt.toISOString()} уже прошло, задача не запланирована`);
         this.parserService.processContacts()
      }
   }

   async findEventDate() {
      return this.shedulerRepository.findOne({})
   }

   async updateEventDate(date) {
      let currentDate = await this.findEventDate()
      if(currentDate) {
         currentDate.date = date
         await currentDate.save()
      } else if(!currentDate) {
         currentDate = await this.shedulerRepository.create({
            date: date
         })
      }
      return currentDate
   }

   async findOrCreateUser(userData) {
      let existUser = await this.usersRepository.findOne({
         where: { tgId: userData.tgId }
      })
      if(!existUser) {
         existUser = await this.usersRepository.create(userData)
      }
      return existUser
   }

   async findAllUsers() {
      return this.usersRepository.findAll({})
   }
}