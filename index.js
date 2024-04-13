import puppeteer from "puppeteer";
import { config } from "dotenv";
import picocolors from "picocolors";
import process from "node:process";
import fs from "node:fs/promises";
import path from "node:path";
import logUpdate from "log-update";
import { log } from "node:console";
import { sendTelegramMessage } from "./bot.mjs";

config();
const pc = picocolors;
const emailInput = "#loginEmail";
const passwdInput = "#loginPassword";
const delayPassed = process.argv[2] || 10000;

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
      timeout: 3000,
    });
    console.log(pc.green("[+] Login successful!"));
    console.log("[+] HTPP Delay: " + pc.magenta(httpDelay) + " ms");
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
        { timeout: 3000 }
      );
      await page.waitForSelector(
        "div .greenOnHover.zIndex.htb-table-text-compact",
        {
          timeout: 30000,
        }
      );

      const machineNames = await page.evaluate(() => {
        let array = [];
        let positions = [];
        document
          .querySelectorAll("tr.cursorPointer.tutsListTutorial")
          .forEach((e, i) => {
            e.querySelectorAll("span").forEach((sp) => {
              if (sp.textContent === "FREE") {
                positions.push(i);
              }
            });
          });
        for (let i of positions) {
          array.push(
            document
              .querySelectorAll(
                "div .greenOnHover.zIndex.htb-table-text-compact"
              )
              [i].textContent.trim()
          );
        }

        return array;
      });
      machinesFound = [...machinesFound, ...machineNames];
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

      await storeMachinesNames(machineNames);

      index++;
      await new Promise((resolve) => setTimeout(resolve, httpDelay));
    } catch (e) {
      console.log(e);
      break;
    }
  }

  await page.goto(
    "https://app.hackthebox.com/machines/list/retired?sort_by=release-date&sort_type=desc"
  );

  await browser.close();
}
async function storeMachinesNames(machineNames) {
  try {
    const filePath = path.join(process.cwd(), "totalMachinesNames.txt");
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
        const finalMessage = `New machine found❗:\n${normalizedName.trim()}\n🤑`;
        sendTelegramMessage(finalMessage);
      }
    }

    if (namesToAdd.length > 0) {
      // Añade los nombres al archivo solo si hay nombres para añadir
      await fs.appendFile(filePath, namesToAdd.join("\n") + "\n");
    }
  } catch (error) {
    console.error(pc.red("[-] Error storing machines names", error));
  }
}

// Ejemplo de uso
//storeMachinesNames([" test", "test3 ", "test3"]);

scrapeMachinesNames();
