import { Context as ContextTelegraf } from 'telegraf';
import { Scenes } from 'telegraf';

export interface Context extends ContextTelegraf {
   session: {
      scene: string
      profileStep: string
      language: string;
      awaitingInput: string | null;
      user?: {
         tgId?: number
         phone?: string
      }
      date?: {
         day?: string,
         time?: string,
         fullStr: Date | null
      }
   }
   scene: {
      enter: (sceneId: string) => void;
      leave: () => void;
      current: () => string | null;
   }
}

interface CustomSession extends Scenes.SceneSessionData {
}

export interface BotContext extends Scenes.SceneContext<CustomSession> {
   session: Scenes.SceneSession<CustomSession>;
}