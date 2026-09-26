/**
 * ETECC Telecom - Dashboard de Retenção
 * Fluxo Dinâmico com IA (Google Gemini Flash) e Visualização (ApexCharts Bar Chart)
 */

// 1. Configurações da API Gemini (carregada da Vercel ou do .env local)
let cachedApiKey = null;

async function obterChaveGemini() {
    if (cachedApiKey) return cachedApiKey;

    // A. Tenta obter da rota serverless da Vercel (/api/config)
    try {
        const resApi = await fetch("/api/config");
        if (resApi.ok) {
            const data = await resApi.json();
            if (data?.apiKey) {
                cachedApiKey = data.apiKey.trim();
                return cachedApiKey;
            }
        }
    } catch (_) {}

    // B. Tenta obter do arquivo .env local (desenvolvimento local)
    try {
        const resposta = await fetch(".env");
        if (resposta.ok) {
            const texto = await resposta.text();
            const match = texto.match(/GEMINI_API_KEY\s*=\s*["']?([^"'\r\n]+)["']?/);
            if (match && match[1]) {
                cachedApiKey = match[1].trim();
                return cachedApiKey;
            }
        }
    } catch (e) {
        console.warn("[Config] Não foi possível ler .env local:", e);
    }

    return window.GEMINI_API_KEY || "";
}

const PRIMARY_MODEL = "gemini-3.5-flash-lite";
const FALLBACK_MODEL = "gemini-3.8-flash";

// 2. Elementos do DOM
const sinteseTexto = document.getElementById("sinteseTexto");
const listaTopProblemas = document.getElementById("listaTopProblemas");
const graficoDonut = document.getElementById("graficoDonut");
const graficoDonutLegenda = document.getElementById("graficoDonutLegenda");
const totalAvaliacoesDonut = document.getElementById("totalAvaliacoesDonut");
const seletorMes = document.getElementById("seletorMes");
const statusIA = document.getElementById("statusIA");

// Elementos do Modal de Detalhes
const modal = document.getElementById("churnModal");
const modalDetalheTitulo = document.getElementById("modalDetalheTitulo");
const modalDetalheGravidade = document.getElementById("modalDetalheGravidade");
const modalDetalhePorcentagem = document.getElementById("modalDetalhePorcentagem");
const modalDetalheImpacto = document.getElementById("modalDetalheImpacto");
const modalDetalheAcao = document.getElementById("modalDetalheAcao");
const modalDetalheTempoResolucao = document.getElementById("modalDetalheTempoResolucao");
const btnFecharTopo = document.getElementById("btnFecharModalTopo");
const btnFecharRodape = document.getElementById("btnFecharModalRodape");
const btnExportarPlano = document.getElementById("btnExportarPlano");

// Estado em memória
let dadosDashboardAtuais = null;
let problemaSelecionado = null;
let chartInferiorInstancia = null;

/**
 * 3. Coleta de Dados: Carrega as avaliações do arquivo externo com base no mês selecionado
 */
async function carregarAvaliacoes(mes = "setembro") {
    const nomeArquivo = `dados_${mes}.json`;
    try {
        console.log(`[Coleta de Dados] Carregando arquivo: ${nomeArquivo}...`);
        const resposta = await fetch(nomeArquivo);
        if (!resposta.ok) {
            throw new Error(`Arquivo ${nomeArquivo} não encontrado ou inacessível (Status: ${resposta.status})`);
        }
        const dados = await resposta.json();
        if (!Array.isArray(dados) || dados.length === 0) {
            throw new Error(`O arquivo ${nomeArquivo} está vazio ou com formato inválido.`);
        }
        return dados;
    } catch (erro) {
        console.error("[Erro ao carregar avaliações]:", erro);
        throw new Error(`Falha ao ler ${nomeArquivo}: ${erro.message}`);
    }
}

/**
 * 4. Integração com Gemini Flash API com Novo Prompt (total_avaliacoes e tempo_medio_resolucao_horas)
 */
async function chamarGeminiAPI(avaliacoes) {
    const totalItens = avaliacoes.length;
    const avaliacoesFormatadas = avaliacoes.map((item, index) => {
        return `Avaliação ${index + 1} (${item.canal || "Canal"} - ${item.regiao || "Região"}):\n"${item.avaliacao}"`;
    }).join("\n\n");

    const promptInstrucao = `Você é um analista de retenção. Analise as avaliações e ignore elogios. Retorne ESTRITAMENTE um JSON puro com esta estrutura: { 'total_avaliacoes': ${totalItens}, 'sintese_ia': 'Texto resumo das principais dores', 'grafico_donut': [ { 'cor': '#EF4444', 'porcentagem': 50 }, { 'cor': '#F87171', 'porcentagem': 30 }, { 'cor': '#FCA5A5', 'porcentagem': 20 } ], 'top_problemas': [ { 'titulo': 'Nome', 'porcentagem': 50, 'gravidade': 10, 'impacto': 'texto', 'acao_recomendada': 'texto', 'tempo_medio_resolucao_horas': 48 } ] } . O valor de 'total_avaliacoes' deve refletir o total de itens no array que você processou (${totalItens}). O valor de 'tempo_medio_resolucao_horas' deve ser um número inteiro estimado em horas para resolução do problema com base nos relatos.

Avaliações de Clientes para Análise:
${avaliacoesFormatadas}`;

    const payload = {
        contents: [
            {
                parts: [
                    { text: promptInstrucao }
                ]
            }
        ],
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2
        }
    };

    const apiKey = await obterChaveGemini();
    if (!apiKey) {
        throw new Error("Chave do Gemini não configurada. Crie o arquivo .env com GEMINI_API_KEY.");
    }

    const modelos = [PRIMARY_MODEL, FALLBACK_MODEL];
    let ultimoErro = null;

    for (const modelo of modelos) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
        try {
            console.log(`[Gemini IA] Consultando modelo ${modelo}...`);
            const resposta = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!resposta.ok) {
                const erroJson = await resposta.json().catch(() => ({}));
                console.warn(`[Gemini IA] Erro no modelo ${modelo} (${resposta.status}):`, erroJson);
                ultimoErro = new Error(`API Gemini status ${resposta.status}: ${erroJson.error?.message || resposta.statusText}`);
                continue;
            }

            const resultado = await resposta.json();
            const textoBruto = resultado?.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!textoBruto) {
                throw new Error("A IA respondeu sem texto válido.");
            }

            // Sanitiza caso o modelo envolva em markdown ```json
            let sanitized = textoBruto.trim();
            if (sanitized.startsWith("```json")) {
                sanitized = sanitized.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
            } else if (sanitized.startsWith("```")) {
                sanitized = sanitized.replace(/^```\s*/, "").replace(/\s*```$/, "");
            }

            const dadosParseados = JSON.parse(sanitized);
            console.log("[Gemini IA] Dados estruturados recebidos com sucesso:", dadosParseados);
            return dadosParseados;
        } catch (err) {
            console.warn(`[Gemini IA] Falha na tentativa com ${modelo}:`, err);
            ultimoErro = err;
        }
    }

    throw ultimoErro || new Error("Falha ao comunicar com os modelos do Gemini.");
}

/**
 * 5. Utilitários de Estilos
 */

// Gera o conic-gradient dinâmico para o gráfico donut
function gerarConicGradient(donutArray) {
    if (!Array.isArray(donutArray) || donutArray.length === 0) {
        return "conic-gradient(#EF4444 0% 50%, #F87171 50% 80%, #FCA5A5 80% 100%)";
    }

    let acumulado = 0;
    const partes = donutArray.map((item, index) => {
        const inicio = acumulado;
        acumulado += Number(item.porcentagem) || 0;
        const fim = (index === donutArray.length - 1) ? 100 : Math.min(acumulado, 100);
        return `${item.cor} ${inicio}% ${fim}%`;
    });

    return `conic-gradient(${partes.join(", ")})`;
}

// Estilo de Gravidade
function obterClasseGravidade(gravidade) {
    const valor = Number(gravidade) || 0;
    if (valor >= 9) return "bg-red-600 text-white shadow-sm";
    if (valor >= 7) return "bg-red-500 text-white shadow-sm";
    if (valor >= 5) return "bg-orange-500 text-white shadow-sm";
    return "bg-amber-500 text-white shadow-sm";
}

/**
 * 6. Estados Visuais de Loading Global do Dashboard
 */
function exibirLoadingDashboard() {
    if (statusIA) {
        statusIA.innerHTML = `
            <span class="w-2 h-2 rounded-full bg-red-600 animate-ping"></span>
            <span class="text-red-600 font-semibold">Analisando com IA...</span>
        `;
    }

    if (sinteseTexto) {
        sinteseTexto.innerHTML = `
            <span class="inline-flex items-center gap-2 text-gray-500">
                <svg class="animate-spin w-4 h-4 text-red-600 shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processando avaliações de clientes via Gemini Flash...
            </span>
        `;
    }

    if (listaTopProblemas) {
        listaTopProblemas.innerHTML = `
            <div class="h-14 bg-gray-100 border border-gray-200 rounded-lg animate-pulse"></div>
            <div class="h-14 bg-gray-100 border border-gray-200 rounded-lg animate-pulse"></div>
            <div class="h-14 bg-gray-100 border border-gray-200 rounded-lg animate-pulse"></div>
        `;
    }

    const containerGrafico = document.getElementById("graficoInferior") || document.getElementById("graficoBoxPlot");
    if (containerGrafico) {
        containerGrafico.innerHTML = `
            <div class="flex flex-col items-center justify-center py-16 text-gray-400">
                <div class="w-10 h-10 border-4 border-red-100 border-t-red-600 rounded-full animate-spin mb-3"></div>
                <p class="text-sm">Calculando métricas e gerando Gráfico de Resolução...</p>
            </div>
        `;
    }
}

/**
 * 7. Renderização do Gráfico de Barras Horizontais com ApexCharts
 */
function renderizarGraficoInferior(dados) {
    const container = document.getElementById("graficoInferior") || document.getElementById("graficoBoxPlot");
    if (!container || !window.ApexCharts) {
        console.warn("[ApexCharts] Container indisponível ou biblioteca ApexCharts não carregada.");
        return;
    }

    // Destrói instância anterior se já existir
    if (chartInferiorInstancia) {
        chartInferiorInstancia.destroy();
        chartInferiorInstancia = null;
    }
    container.innerHTML = "";

    const titulos = dados.top_problemas.map(p => p.titulo);
    const valoresHoras = dados.top_problemas.map(p => Number(p.tempo_medio_resolucao_horas) || 0);

    const opcoes = {
        series: [
            {
                name: "Tempo Médio (Horas)",
                data: valoresHoras
            }
        ],
        chart: {
            type: 'bar',
            height: 290,
            toolbar: { show: false },
            fontFamily: 'inherit',
            animations: {
                enabled: true,
                speed: 600
            }
        },
        plotOptions: {
            bar: {
                horizontal: true,
                borderRadius: 6,
                barHeight: '52%',
                distributed: true,
                dataLabels: {
                    position: 'top'
                }
            }
        },
        colors: ['#EF4444', '#F87171', '#FCA5A5'],
        dataLabels: {
            enabled: true,
            formatter: (val) => `${val}h`,
            offsetX: 24,
            style: {
                fontSize: '12px',
                fontWeight: 700,
                colors: ['#374151']
            }
        },
        title: {
            text: "Tempo Médio de Resolução por Categoria (Horas)",
            align: 'left',
            style: {
                fontSize: '16px',
                fontWeight: 700,
                color: '#1F2937'
            }
        },
        xaxis: {
            categories: titulos,
            title: {
                text: 'Horas',
                style: { color: '#6B7280', fontSize: '12px', fontWeight: 600 }
            },
            labels: {
                formatter: (val) => `${val}h`,
                style: { colors: '#6B7280', fontSize: '12px' }
            }
        },
        yaxis: {
            labels: {
                style: { colors: '#374151', fontSize: '12px', fontWeight: 600 },
                maxWidth: 240
            }
        },
        grid: {
            borderColor: '#F3F4F6',
            strokeDashArray: 4
        },
        legend: {
            show: false
        },
        tooltip: {
            y: {
                formatter: (val) => `${val} horas estimadas de resolução`
            }
        }
    };

    chartInferiorInstancia = new ApexCharts(container, opcoes);
    chartInferiorInstancia.render();
}

/**
 * 8. Renderização do Dashboard Principal
 */
function renderizarDashboard(dados) {
    dadosDashboardAtuais = dados;

    // A. Atualiza o texto da síntese
    if (sinteseTexto && dados.sintese_ia) {
        sinteseTexto.textContent = dados.sintese_ia;
    }

    // B. Atualiza o Total no centro do Gráfico Donut
    if (totalAvaliacoesDonut && dados.total_avaliacoes !== undefined) {
        totalAvaliacoesDonut.textContent = dados.total_avaliacoes;
    }

    // C. Atualiza o conic-gradient do Gráfico Donut
    if (graficoDonut && Array.isArray(dados.grafico_donut)) {
        graficoDonut.style.background = gerarConicGradient(dados.grafico_donut);
    }

    // D. Atualiza a legenda do Donut com as cores e nomes reais
    if (graficoDonutLegenda && Array.isArray(dados.top_problemas) && Array.isArray(dados.grafico_donut)) {
        graficoDonutLegenda.innerHTML = dados.top_problemas.map((prob, idx) => {
            const cor = dados.grafico_donut[idx]?.cor || "#EF4444";
            const tituloCurto = prob.titulo.length > 18 ? prob.titulo.substring(0, 16) + "..." : prob.titulo;
            return `
                <div class="flex items-center gap-1.5" title="${prob.titulo}">
                    <div class="w-3 h-3 rounded-full shrink-0" style="background-color: ${cor}"></div>
                    <span class="truncate">${tituloCurto} (${prob.porcentagem}%)</span>
                </div>
            `;
        }).join("");
    }

    // E. Gera dinamicamente os 3 botões do "Top 3 Problemas"
    if (listaTopProblemas && Array.isArray(dados.top_problemas)) {
        listaTopProblemas.innerHTML = "";

        const classesCoresBarra = ["bg-red-500", "bg-red-400", "bg-red-300"];

        dados.top_problemas.forEach((problema, index) => {
            const corBarra = classesCoresBarra[index] || "bg-red-500";
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "w-full text-left flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-red-300 hover:bg-red-50 transition-all group focus:outline-none focus:ring-2 focus:ring-red-400 cursor-pointer";

            btn.innerHTML = `
                <div class="flex-1">
                    <div class="flex justify-between mb-1">
                        <span class="font-medium text-gray-800 group-hover:text-red-700">${index + 1}. ${problema.titulo}</span>
                        <span class="text-sm font-bold text-gray-600">${problema.porcentagem}%</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                        <div class="${corBarra} h-1.5 rounded-full transition-all duration-700" style="width: ${problema.porcentagem}%"></div>
                    </div>
                </div>
                <div class="ml-4 text-gray-400 group-hover:text-red-500 transition-colors">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                    </svg>
                </div>
            `;

            // Atribui o clique para abrir o modal com dados exclusivos deste problema
            btn.onclick = () => {
                abrirModalDetalhe(dados.top_problemas[index]);
            };

            listaTopProblemas.appendChild(btn);
        });
    }

    // F. Renderiza o Gráfico de Barras Horizontais
    renderizarGraficoInferior(dados);

    // G. Atualiza indicador de status no cabeçalho
    if (statusIA) {
        statusIA.innerHTML = `
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span class="text-gray-600 font-medium">IA Gemini Sincronizada</span>
        `;
    }
}

/**
 * 9. Modal de Detalhes de um ÚNICO Problema
 */
function abrirModalDetalhe(problema) {
    if (!problema) return;
    problemaSelecionado = problema;

    // Atualiza Título
    if (modalDetalheTitulo) {
        modalDetalheTitulo.textContent = problema.titulo;
    }

    // Atualiza Porcentagem
    if (modalDetalhePorcentagem) {
        modalDetalhePorcentagem.textContent = `${problema.porcentagem}% das reclamações`;
    }

    // Atualiza Gravidade com classe de cor
    if (modalDetalheGravidade) {
        modalDetalheGravidade.textContent = `Gravidade: ${problema.gravidade}/10`;
        modalDetalheGravidade.className = `${obterClasseGravidade(problema.gravidade)} text-xs font-bold px-2.5 py-1 rounded-md uppercase tracking-wider`;
    }

    // Atualiza Impacto na Retenção
    if (modalDetalheImpacto) {
        modalDetalheImpacto.textContent = problema.impacto;
    }

    // Atualiza Ação Recomendada
    if (modalDetalheAcao) {
        modalDetalheAcao.textContent = problema.acao_recomendada;
    }

    // Atualiza Tempo Médio de Resolução
    if (modalDetalheTempoResolucao) {
        const horas = problema.tempo_medio_resolucao_horas !== undefined ? problema.tempo_medio_resolucao_horas : "--";
        modalDetalheTempoResolucao.textContent = `${horas} h`;
    }

    // Abre o Modal
    modal?.classList.remove("hidden");
    document.body.classList.add("overflow-hidden");
}

function fecharModal() {
    modal?.classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
}

/**
 * 10. Pipeline Principal de Inicialização
 */
async function inicializarDashboard() {
    // 1. Limpa os gráficos atuais
    if (chartInferiorInstancia) {
        chartInferiorInstancia.destroy();
        chartInferiorInstancia = null;
    }

    // 2. Aciona o estado de Loading na tela
    exibirLoadingDashboard();

    try {
        // 3. Captura o valor atual do seletorMes e carrega o JSON correspondente
        const mesSelecionado = document.getElementById("seletorMes")?.value || "setembro";
        const avaliacoes = await carregarAvaliacoes(mesSelecionado);

        // 4. Executa a IA e renderiza o dashboard
        const resultadoIA = await chamarGeminiAPI(avaliacoes);
        renderizarDashboard(resultadoIA);
    } catch (erro) {
        console.error("[Erro na inicialização do dashboard]:", erro);
        if (sinteseTexto) {
            sinteseTexto.innerHTML = `
                <span class="text-red-600 font-medium flex items-center gap-2">
                    <svg class="w-5 h-5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                    Falha ao carregar diagnóstico com IA: ${erro.message}
                </span>
            `;
        }
        if (statusIA) {
            statusIA.innerHTML = `
                <span class="w-2 h-2 rounded-full bg-red-500"></span>
                <span class="text-red-600 font-medium">Erro na Conexão</span>
            `;
        }
    }
}

/**
 * 11. Exportação do Plano de Ação Específico
 */
function exportarPlanoDeAcao() {
    if (!problemaSelecionado) {
        alert("Nenhum problema selecionado para exportação.");
        return;
    }

    let conteudo = `=== ETECC TELECOM - PLANO DE AÇÃO ESPECÍFICO (IA) ===\n`;
    conteudo += `Data: ${new Date().toLocaleDateString("pt-BR")} ${new Date().toLocaleTimeString("pt-BR")}\n`;
    conteudo += `Problema: ${problemaSelecionado.titulo}\n`;
    conteudo += `Participação no Churn: ${problemaSelecionado.porcentagem}%\n`;
    conteudo += `Gravidade: ${problemaSelecionado.gravidade}/10\n`;
    conteudo += `Tempo Médio de Resolução: ${problemaSelecionado.tempo_medio_resolucao_horas || "N/A"} horas\n\n`;
    conteudo += `IMPACTO NA RETENÇÃO:\n${problemaSelecionado.impacto}\n\n`;
    conteudo += `AÇÃO RECOMENDADA:\n${problemaSelecionado.acao_recomendada}\n`;

    const blob = new Blob([conteudo], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Acao_${problemaSelecionado.titulo.replace(/[^a-zA-Z0-9]/g, "_")}.txt`;
    link.click();
    URL.revokeObjectURL(link.href);
}

// 12. Event Listeners

// Fechamento do Modal
btnFecharTopo?.addEventListener("click", fecharModal);
btnFecharRodape?.addEventListener("click", fecharModal);

modal?.addEventListener("click", (e) => {
    if (e.target === modal) fecharModal();
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) {
        fecharModal();
    }
});

btnExportarPlano?.addEventListener("click", exportarPlanoDeAcao);

// Recarrega todo o pipeline de IA ao trocar o mês no dropdown
seletorMes?.addEventListener("change", () => {
    inicializarDashboard();
});

// Inicialização imediata ao carregar o DOM
document.addEventListener("DOMContentLoaded", () => {
    inicializarDashboard();
});
