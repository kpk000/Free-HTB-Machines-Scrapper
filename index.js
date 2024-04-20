import { config } from "dotenv";
import picocolors from "picocolors";
import process from "node:process";
import fs from "node:fs/promises";
import path from "node:path";
import logUpdate from "log-update";
import { sendTelegramMessage } from "./bot.mjs";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());
config();
const pc = picocolors;
const emailInput = "#loginEmail";
const passwdInput = "#loginPassword";
const delayPassed = process.argv[2] || 10000;
const filePath = path.join(process.cwd(), "totalMachinesNames.txt");

const httpDelay =
  isCasteableToNumber(delayPassed) && Number(delayPassed) > 10000
    ? Number(delayPassed)
    : 10000;

function isCasteableToNumber(value) {
  return !isNaN(Number(value));
}

async function scrapeMachinesNames() {
  const browser = await puppeteer.launch({ headless: true, slowMo: 10 });
  const page = await browser.newPage();
  console.log("[+] Navigatin to login...");
  await page.goto("https://app.hackthebox.com/login?redirect=%2Fhome");

  //Esperamos a que cargue el formulario
  await page.waitForSelector(emailInput);
  await page.waitForSelector(passwdInput);
  //Escribimos las credenciales
  await page.type(emailInput, process.env.EMAIL);
  await page.type(passwdInput, process.env.PASSWORD);
  console.log(pc.gray("[+] Logging in..."));
  //Enviamos formulario
  try {
    await page.click('button[type="submit"]');
    // Espera para la navegación o para un mensaje de error específico
    await page.waitForNavigation({
      waitUntil: "domcontentloaded",
      timeout: 5000,
    });
    console.log(pc.green("[+] Login successful!"));
    console.log("[+] HTTP Delay: " + pc.magenta(httpDelay) + " ms");
  } catch (error) {
    console.error(pc.red("[-] Login failed! Exiting..."));
    await browser.close();
    process.exit(1);
  }
  let index = 1;
  let machinesFound = [];
  while (true) {
    try {
      await page.goto(
        `https://app.hackthebox.com/machines/list/retired?sort_by=release-date&sort_type=desc&page=${index}`,
        { timeout: 10000 }
      );
      await page.waitForSelector(
        "div .greenOnHover.zIndex.htb-table-text-compact",
        {
          timeout: 10000,
        }
      );

      const machineNames = await page.evaluate(() => {
        let freeMachines = [];
        let notFreeMachines = [];

        let positions = [];
        document
          .querySelectorAll("tr.cursorPointer.tutsListTutorial")
          .forEach((trElement, i) => {
            const spans = trElement.querySelectorAll("span");
            let isFreeFound = false; // Bandera para saber si encontramos "FREE"

            spans.forEach((spanElement, j) => {
              if (spanElement.textContent === "FREE") {
                positions.push(i);
                isFreeFound = true; // Marcamos que encontramos "FREE"
                return;
              } else if (j === spans.length - 1 && !isFreeFound) {
                // Solo entramos aquí si es el último span y no hemos encontrado "FREE"
                const machineName = document
                  .querySelectorAll(
                    "div .greenOnHover.zIndex.htb-table-text-compact"
                  )
                  [i].textContent.trim();
                notFreeMachines.push(machineName);
              }
            });
          });

        for (let i of positions) {
          freeMachines.push(
            document
              .querySelectorAll(
                "div .greenOnHover.zIndex.htb-table-text-compact"
              )
              [i].textContent.trim()
          );
        }

        return { freeMachines, notFreeMachines };
      });
      machinesFound = [...machinesFound, ...machineNames.freeMachines];

      for (const machine of machineNames.notFreeMachines) {
        await removeMachineFromActives(machine.trim());
      }

      logUpdate(
        pc.yellow(`[+] Scraping page: ${index}\n`) +
          machinesFound
            .map((machine) => {
              return (
                " ".repeat(5) +
                pc.green(`[✔]`) +
                pc.bold(pc.blue(` ${machine} `)) +
                pc.underline(pc.green(`FREE`))
              );
            })
            .join("\n")
      );

      await storeMachinesNames(machineNames.freeMachines);

      index++;
      await new Promise((resolve) => setTimeout(resolve, httpDelay));
    } catch (e) {
      //console.log(error)
      console.log(pc.yellow("[+] No more pages to scrap."));
      console.log(pc.cyan("[+] Sending info to telegram bot..."));

      break;
    }
  }

  const data = await fs.readFile(filePath, "utf8");
  const fileMachines = data
    .split("\n")
    .filter((line) => line.trim() !== "")
    .join("\n");
  let activeMachines = `<b>Total retired active machines</b>\n <i>Date:</i> ${new Date().toLocaleString()}\n\n${fileMachines}\n\n`;
  sendTelegramMessage(activeMachines);
  console.log(pc.gray("Exiting..."));

  await browser.close();
  process.exit(0);
}
async function storeMachinesNames(machineNames) {
  try {
    let fileContent = await fs.readFile(filePath, "utf-8");
    let fileLines = fileContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== "");
    let normalizedNames = new Set(fileLines);

    let namesToAdd = [];
    // Comprueba cada nombre en el array
    for (let name of machineNames) {
      let normalizedName = name.trim(); // Normaliza el nombre eliminando espacios en blanco al principio y al final
      if (!normalizedNames.has(normalizedName)) {
        namesToAdd.push(normalizedName.trim()); // Añade el nombre al array si no está en el archivo
        normalizedNames.add(normalizedName.trim()); // Añade el nombre al conjunto para evitar duplicados
        let finalMessage = `<b>New machine found<b/>❗:\n- <i>${normalizedName.trim()}</i>\n`;
        finalMessage += `\n https://app.hackthebox.com/machines/${normalizedName.trim()}`;
        sendTelegramMessage(finalMessage);
      }
    }
    if (namesToAdd.length > 0) {
      // Añade los nombres al archivo solo si hay nombres para añadir
      await fs.appendFile(filePath, namesToAdd.join("\n") + "\n");
    }
  } catch (error) {
    console.log(pc.red("[-] Error storing machines names", error));
    console.log(error);
  }
}

async function removeMachineFromActives(name) {
  try {
    const data = await fs.readFile(filePath, "utf8");
    const lines = data.split("\n");
    const filteredLines = lines.filter(
      (line) => !line.trim().includes(name.trim())
    );
    await fs.writeFile(filePath, filteredLines.join("\n"));
  } catch (error) {
    console.error(pc.red("[-] Error removing machine name", error));
  }
}

scrapeMachinesNames();
