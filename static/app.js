const refreshButton = document.querySelector("#refresh-button");
const environmentStatus = document.querySelector("#environment-status");
const environmentLabel = document.querySelector("#environment-label");
const environmentDescription = document.querySelector("#environment-description");
const services = [
    { id: "app", url: document.body.dataset.appHealth, success: "El servidor está disponible y responde correctamente." },
    { id: "db", url: document.body.dataset.dbHealth, success: "La conexión está activa. Consulta de prueba completada." },
];

async function checkService(service) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const started = performance.now();
    try {
        const response = await fetch(service.url, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok || data.status !== "ok") {
            return { ok: false, message: service.id === "db" ? "No se pudo conectar a MySQL. Revisa la base de datos y la red." : "El servidor no respondió correctamente." };
        }
        return { ok: true, message: service.success, latency: Math.round(performance.now() - started) };
    } catch (error) {
        return { ok: false, message: error.name === "AbortError" ? "La comprobación superó el tiempo de espera." : "No se pudo consultar el servicio. Comprueba la conexión." };
    } finally {
        clearTimeout(timeout);
    }
}

async function refreshHealth() {
    if (refreshButton.disabled) return;
    refreshButton.disabled = true;
    refreshButton.querySelector("span").textContent = "Comprobando…";
    environmentStatus.dataset.state = "pending";
    environmentLabel.textContent = "Comprobando conexión…";
    environmentDescription.textContent = "Consultando los servicios de tu aplicación.";
    for (const service of services) {
        document.querySelector(`#${service.id}-card`).dataset.state = "pending";
        document.querySelector(`#${service.id}-status`).textContent = "Comprobando…";
        document.querySelector(`#${service.id}-description`).textContent = "Esperando la respuesta del servicio…";
        document.querySelector(`#${service.id}-latency`).textContent = "—";
    }

    const results = await Promise.all(services.map(checkService));
    results.forEach((result, index) => {
        const id = services[index].id;
        document.querySelector(`#${id}-card`).dataset.state = result.ok ? "ok" : "error";
        document.querySelector(`#${id}-status`).textContent = result.ok ? "Disponible" : "No disponible";
        document.querySelector(`#${id}-description`).textContent = result.message;
        document.querySelector(`#${id}-latency`).textContent = result.ok ? `${result.latency} ms · respuesta HTTP` : "Sin respuesta válida";
    });
    const allHealthy = results.every(result => result.ok);
    environmentStatus.dataset.state = allHealthy ? "ok" : "error";
    environmentLabel.textContent = allHealthy ? "Todo está conectado" : "Una conexión necesita atención";
    environmentDescription.textContent = allHealthy ? "Aplicación y base de datos disponibles." : "Consulta el detalle de cada servicio abajo.";
    const now = new Date();
    const lastCheck = document.querySelector("#last-check");
    lastCheck.dateTime = now.toISOString();
    lastCheck.textContent = now.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    refreshButton.disabled = false;
    refreshButton.querySelector("span").textContent = "Comprobar conexión";
}

refreshButton.addEventListener("click", refreshHealth);
refreshHealth();
