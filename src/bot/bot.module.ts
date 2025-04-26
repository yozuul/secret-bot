import { Module, forwardRef } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { ParserModule } from 'src/parser/parser.module';
import { BotService } from './bot.service';
import { ShedulerService } from './sheduler.service';
import { Users, Scheduler } from './models';
import { StartedScene } from './scenes/started.scene';

@Module({
   imports: [
      SequelizeModule.forFeature([Users, Scheduler]),
      forwardRef(() => ParserModule)
   ],
   providers: [BotService, ShedulerService, StartedScene],
   exports: [ShedulerService]
})
export class BotModule {}
