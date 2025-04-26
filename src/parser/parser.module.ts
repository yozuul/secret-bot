import { Module, forwardRef } from '@nestjs/common';
import { ParserService } from './parser.service';
import { BotModule } from 'src/bot/bot.module';

@Module({
   imports: [
      forwardRef(() => BotModule)
   ],
   providers: [ParserService],
   exports: [ParserService]
})
export class ParserModule {}
