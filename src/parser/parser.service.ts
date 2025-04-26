import { resolve } from 'node:path'
import { Injectable, Inject, forwardRef } from '@nestjs/common';
import * as fs from 'fs';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';

import { connect } from 'puppeteer-real-browser';
import { ConfigService } from '@nestjs/config';

import { contacts } from 'data/contacts';
import { ShedulerService } from 'src/bot/sheduler.service';

@Injectable()
export class ParserService {

   constructor(
      @InjectBot()
      private readonly bot: Telegraf,
      private readonly sheduleService: ShedulerService
   ) {}

   private startTime = null
   private timeout = null
   private contacts = contacts
   private configService = new ConfigService();
   private users = []
   private justCheck = false

   async processContacts(ctx?) {
      if(ctx) this.justCheck = true
      this.users = await this.sheduleService.findAllUsers()
      // Запускаем обработку всех контактов параллельно
      const promises = this.contacts.map(contact => this.processContact(contact));
      await Promise.all(promises);
   }

   async processContact(contact) {
      // Полный процесс для каждого контакта выполняется независимо и параллельно
      const browser = await this.launchBrowser(contact);
      if (!browser) return;
      await this.textLog(contact, `Запустили браузер для аккаунта`)
      try {
         await this.openAuthPage(browser, contact);
         await this.delay(1000);
         await this.openOrderPage(browser, contact);
      } catch (error) {
         const errorMessage = `Ошибка обработки контакта ${contact.login}`
         this.textLog(contact, errorMessage,)
         console.error(errorMessage, error);
      } finally {
         await browser.close();
      }
   }

   async launchBrowser(contact?) {
      try {
         this.startTime = Date.now();
         this.timeout = 3 * 60 * 1000;

         const { browser } = await connect({
            headless: false,
            args: [
              '--disable-notifications',
              '--window-size=1920,1020',
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
            ],
            turnstile: true,
            disableXvfb: false,
            ignoreAllFlags: false,
          });
         return browser;
      } catch (error) {
         const errorMessage = 'Не смог запустить браузер'
         await this.textLog(contact, errorMessage)
         console.error(errorMessage, error);
         return null;
      }
   }

   async openAuthPage(browser, contact) {
      const authPage = this.configService.get('AUTH_URL')
      const page = await browser.newPage()
      await this.textLog(
         contact, `Начинаем авторизацию\nЛогин: ${contact.login}, Пароль: ${contact.password}`
      )
      try {
         await page.goto(authPage, {
         waitUntil: 'networkidle2',
            timeout: 30000,
         });
      } catch (error) {
         const errorMessage = 'Не смог загрузить страницу авторизации'
         await this.screenLog(contact, errorMessage, page)
         await browser.close();
         await this.processContacts()
         return;
      }
      try {
         const loginFIeld = await page.$('input[name="USER_LOGIN"]');
         await loginFIeld.type(contact.login);
         await page.evaluate(el => el.dispatchEvent(new Event('change')), loginFIeld);

         const passwordFIeld = await page.$('input[name="USER_PASSWORD"]');
         await passwordFIeld.type(contact.password);
         await page.evaluate(el => el.dispatchEvent(new Event('change')), passwordFIeld);

         await Promise.all([
            page.click('input[name="Login"]'),
            page.waitForNavigation()
         ]);
      } catch (error) {
         console.log('Ошибка авторизации', error)
      }
      const message = 'Успешно авторизованы'
      await this.screenLog(contact, message, page)
      await page.close()
      console.log(message)
   }

   async openOrderPage(browser, contact, page = null) {
      const orderPage = this.configService.get('ORDER_URL')
      const currentPage = page || (await browser.newPage());
      if (!page) {
         await currentPage.setViewport({ width: 1920, height: 1020 });
      }
      await this.textLog(contact, 'Загружаем страницу заказа')
      try {
         await currentPage.goto(orderPage, {
         waitUntil: 'networkidle2',
            timeout: 30000,
         });
      } catch (error) {
         const errorMessage = 'Не смог загрузить страницу заказа, выполняем повторную инициализацию'
         console.log(errorMessage, error);
         await this.textLog(contact, errorMessage)
         if (!page) await currentPage.close();
         await browser.close();
         await this.processContacts()
         return;
      }

      await this.textLog(contact, `Проверяем статус заказа`)
      const checkPageState = async () => {
         return await currentPage.evaluate(() => {
            const products = document.querySelectorAll('.products__wrapper .product');
            if (products.length > 0) {
               return { state: 'products_found', products: products.length };
            }

            const loader = document.querySelector<HTMLElement>('.products__loader');
            if (loader?.innerText?.trim() === 'Прием заявок закрыт') {
               return { state: 'orders_closed' };
            }
            return { state: 'loading' };
         });
      };

      let attempts = 0;
      const maxAttempts = 40;
      const checkInterval = 500;

      let pageState;

      do {
         await this.delay(checkInterval);
         pageState = await checkPageState();
         attempts++;
         console.log('attempts', attempts);

         if (pageState.state === 'orders_closed') {
            const message = 'Прием заявок закрыт. Закрываем браузер.'
            await this.screenLog(contact, message, page || currentPage)
            console.log(message);
            if (!page) await currentPage.close();
            await browser.close();
            return;
         }
      } while (pageState.state === 'loading' && attempts < maxAttempts);

      if (pageState.state === 'products_found') {
         const message = `Найдено товаров: ${pageState.products}`
         await this.textLog(contact, message)
         await this.checkZakaz(browser, currentPage, contact);
      } else if (attempts >= maxAttempts) {
         console.log('Превышено максимальное количество попыток проверки');
         if (!page) await currentPage.close();
         await browser.close();
      }
   }

   async checkZakaz(browser, page, contact) {
         const isButtonsAvialable = await page.evaluate(() => {
            let isButtonsAvialable = true
            const addTocartBtn = document.querySelector(
               '.product .add-to-cart',
            );
            if(addTocartBtn.classList.contains('product--disabled')) {
               isButtonsAvialable = false
            }
            return isButtonsAvialable
         });

         if(!isButtonsAvialable) {
            let message = 'Заказ товара пока недоступен'
            if(this.justCheck) {
               message += '. Тестовая проверка. Таймер не учитывается, закрываем браузер'
            }
            console.log(message)
            if(this.justCheck) {
               await this.screenLog(contact, message, page)
               return
            }
            if(Date.now() - this.startTime < this.timeout) {
               this.textLog(contact, 'Обновляем страницу')
               await this.openOrderPage(browser, contact, page);
            } else if (Date.now() - this.startTime >= this.timeout) {
               console.log('Товары в указанной дате остуствовали')
               console.log('Прошло 4 минуты. Завершаем выполнение...');
            }
            return
         } else {
            this.textLog(contact, 'Товары доступны к бронированию')
            await this.makeOrder(page, contact)
         }
      await browser.close();
   }

   async makeOrder(page, contact) {
      try {
         const buttons = await page.$$('.products__wrapper .product button.add-to-cart');
         if(buttons) {
            for (const button of buttons) {
               await button.click();
               await this.delay(150)
            }
         } else {
            const errorMessage = 'Кнопка добавления товара не найдена'
            this.textLog(contact, errorMessage)
            console.log(errorMessage)
         }
      } catch (error) {
         const errorMessage = 'Ошибка прокликивания кнопок'
         this.textLog(contact, errorMessage)
         console.log(errorMessage, error)
      }
      await this.delay(400)
      try {
         const orderBtn = await page.$('.products__button');
         console.log('orderBtn', orderBtn)
         console.log('typeof', typeof orderBtn)
         if(orderBtn) {
            await orderBtn.click() // Попробовать так
         } else {
            console.log('Кнопка не найдена')
            page.click('.products__button') // и попробовать так
         }
      } catch (error) {
         const errorMessage = 'Ошибка заказа товара'
         this.textLog(contact, errorMessage)
         console.log(errorMessage, error)
      }

      try {
         const surname = await page.$('#surname');
         await surname.type(contact.surname);
         await page.evaluate(el => el.dispatchEvent(new Event('change')), surname);

         const name = await page.$('#name');
         await name.type(contact.name);
         await page.evaluate(el => el.dispatchEvent(new Event('change')), name);

         const phone = await page.$('#phone');
         await phone.type(contact.phone);
         await page.evaluate(el => el.dispatchEvent(new Event('change')), phone);

         const email = await page.$('#email');
         await email.type(contact.email);
         await page.evaluate(el => el.dispatchEvent(new Event('change')), email);

         const formComment = await page.$('#formComment');
         await formComment.type(contact.formComment);
         await page.evaluate(el => el.dispatchEvent(new Event('change')), formComment);
      } catch (error) {
         const errorMessage = 'Ошибка заполнения формы'
         this.textLog(contact, errorMessage)
         console.log(errorMessage, error)
      }

      await this.delay(200)

      try {
         const makeOrderBtn = await page.$('.modal__form button')
         if(makeOrderBtn) {
            await makeOrderBtn.click()
            this.textLog(contact, `Заказ оформлен. Ждём 30 сек`)
            await this.delay(30000)
            await this.screenLog(contact, 'Отчёт. Завершаем работу', page)
         } else {
            const errorMessage = 'Кнопка заказа не найдена'
            this.textLog(contact, errorMessage)
            console.log(errorMessage,)
         }
      } catch (error) {
         const errorMessage = 'Ошибка подтверждения заказа .modal__form button'
         this.textLog(contact, errorMessage)
         console.log(errorMessage, error)
      }
   }

   async textLog(contact, message) {
      this.telegramLog(`[ ${contact.login} ] ${message}`)
   }

   async screenLog(contact, message, page) {
      const screen = await page.screenshot();
      // console.log('screen', screen)
      this.telegramLog(`[ ${contact.login} ] ${message}`, Buffer.from(screen))
   }

   async telegramLog(text, image?) {
      for (let user of this.users) {
         if (!user) continue;
         if(image) {
            try {
               await this.bot.telegram.sendPhoto(user.tgId, { source: image }, { caption: text });
            } catch (error) {
               console.log('Ошибка отправки скрина', error)
            }
         } else {
            try {
               await this.bot.telegram.sendMessage(user.tgId, text)
            } catch (error) {
               console.log('Ошибка отправки сообщения', error)
               console.log(error)
            }
         }
      }
   }

   delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
   }
}
