// Crivo — ML Cookie Extractor
// Extrai cookies de sessão do Mercado Livre e CSRF token,
// formata como variáveis .env e copia para o clipboard.

const ML_DOMAIN = ".mercadolivre.com.br";

// Cookies críticos para a API de afiliados
const CRITICAL_COOKIES = ["_csrf", "ssid", "nsa_rotok", "orguseridp", "orgnickp"];

const btnExtract = document.getElementById("btn-extract");
const btnIcon = document.getElementById("btn-icon");
const btnText = document.getElementById("btn-text");
const statusEl = document.getElementById("status");
const detailsEl = document.getElementById("details");
const cookieCountEl = document.getElementById("cookie-count");
const csrfStatusEl = document.getElementById("csrf-status");

btnExtract.addEventListener("click", handleExtract);

async function extractCsrfToken(cookies) {
  const csrfCookie = cookies.find((c) => c.name === "_csrf");
  let csrfToken = "";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url?.includes("mercadolivre.com.br")) {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractCsrfFromPage,
      });
      if (results?.[0]?.result) {
        csrfToken = results[0].result;
      }
    }
  } catch (e) {
    console.log("Could not inject content script:", e.message);
  }

  return csrfToken || (csrfCookie ? csrfCookie.value : "");
}

function showCopyStatus(missingCritical, csrfToken) {
  detailsEl.classList.remove("hidden");
  const baseMsg = "Copiado para o clipboard!";
  if (missingCritical.length > 0) {
    showStatus("warning", `${baseMsg} (cookies ausentes: ${missingCritical.join(", ")})`);
  } else if (!csrfToken) {
    showStatus("warning", "Cookies copiados! CSRF token nao encontrado — abra o painel de afiliados e tente novamente.");
  } else {
    showStatus("success", baseMsg);
  }
}

async function handleExtract() {
  btnExtract.disabled = true;
  btnText.textContent = "Extraindo...";
  btnIcon.textContent = "\u23F3"; // hourglass
  hideStatus();

  try {
    // 1. Read all cookies from ML domain
    const cookies = await chrome.cookies.getAll({ domain: ML_DOMAIN });

    if (!cookies?.length) {
      showStatus("error", "Nenhum cookie encontrado. Acesse mercadolivre.com.br e faça login.");
      resetButton();
      return;
    }

    const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const foundNames = new Set(cookies.map((c) => c.name));
    const missingCritical = CRITICAL_COOKIES.filter((name) => !foundNames.has(name));
    cookieCountEl.textContent = cookies.length;

    // 2. Extract CSRF token
    const csrfToken = await extractCsrfToken(cookies);
    csrfStatusEl.textContent = csrfToken ? "Encontrado" : "Nao encontrado";
    csrfStatusEl.className = csrfToken ? "found" : "not-found";

    // 3. Format + copy to clipboard
    let output = `ML_SESSION_COOKIES=${cookieString}`;
    if (csrfToken) output += `\nML_CSRF_TOKEN=${csrfToken}`;
    await navigator.clipboard.writeText(output);

    // 4. Show result
    showCopyStatus(missingCritical, csrfToken);
    btnIcon.textContent = "\u2705"; // checkmark
    btnText.textContent = "Copiado!";
    setTimeout(resetButton, 3000);
  } catch (err) {
    showStatus("error", `Erro: ${err.message}`);
    resetButton();
  }
}

// Injected into the active tab to extract CSRF token from the page
function extractCsrfFromPage() {
  // Try meta tag
  const metaTag = document.querySelector('meta[name="csrf-token"]');
  if (metaTag) return metaTag.getAttribute("content");

  // Try common ML global variables
  if (globalThis.__PRELOADED_STATE__?.csrfToken) {
    return globalThis.__PRELOADED_STATE__.csrfToken;
  }

  // Try hidden input
  const hiddenInput = document.querySelector('input[name="_csrf"]');
  if (hiddenInput) return hiddenInput.value;

  // Try to find in script tags (ML sometimes embeds it)
  const scripts = document.querySelectorAll("script");
  for (const script of scripts) {
    const text = script.textContent;
    const match = text.match(/csrf[_-]?token["':\s]+["']([^"']+)["']/i);
    if (match) return match[1];
  }

  return null;
}

function showStatus(type, message) {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.classList.remove("hidden");
}

function hideStatus() {
  statusEl.classList.add("hidden");
  detailsEl.classList.add("hidden");
}

function resetButton() {
  btnExtract.disabled = false;
  btnIcon.textContent = "\uD83D\uDD12"; // lock
  btnText.textContent = "Copiar Cookies";
}
