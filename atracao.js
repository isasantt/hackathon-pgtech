/**
 * ETECC Telecom - Painel de Atração de Vendas (AaaS)
 * Lógica de inteligência de mercado com Google Gemini Flash
 */

// 1. Configurações da API Gemini (carregada dinamicamente do .env)
let cachedApiKeyAtracao = null;

async function obterChaveGemini() {
    if (cachedApiKeyAtracao) return cachedApiKeyAtracao;
    try {
        const resposta = await fetch(".env");
        if (resposta.ok) {
            const texto = await resposta.text();
            const match = texto.match(/GEMINI_API_KEY\s*=\s*["']?([^"'\r\n]+)["']?/);
            if (match && match[1]) {
                cachedApiKeyAtracao = match[1].trim();
                return cachedApiKeyAtracao;
            }
        }
    } catch (e) {
        console.warn("[Config] Não foi possível ler .env:", e);
    }
    return window.GEMINI_API_KEY || "";
}

/**
 * 2. Coleta de Dados: Faz fetch de 'dados_atracao.json'
 */
async function carregarContextoExterno() {
    try {
        console.log("[Atração] Carregando dados de contexto externo (dados_atracao.json)...");
        const resposta = await fetch("dados_atracao.json");
        if (!resposta.ok) {
            throw new Error(`Arquivo dados_atracao.json não encontrado ou inacessível (Status: ${resposta.status})`);
        }
        const dados = await resposta.json();
        return dados;
    } catch (erro) {
        console.error("[Erro ao carregar contexto externo]:", erro);
        throw erro;
    }
}

/**
 * 3. Integração com Gemini: Envia o contexto para formulação da estratégia agressiva de marketing
 */
async function chamarGeminiAtracao(dados) {
    const promptInstrucao = `Você é um CMO (Diretor de Marketing) de uma empresa de Telecom. Analise o JSON fornecido com o contexto geográfico, sazonalidade e status da concorrência. Formule uma decisão rápida e agressiva de marketing para capturar clientes dos concorrentes afetados. Retorne ESTRITAMENTE um objeto JSON puro, sem markdown, com esta estrutura: { 'sazonalidade': { 'titulo': 'texto curto', 'clima': 'texto curto', 'descricao': 'texto' }, 'concorrencia': { 'titulo': 'Nome da operadora afetada', 'alerta': 'texto curto sobre menções', 'descricao': 'texto do problema' }, 'decisao': { 'nome_campanha': 'Nome criativo', 'acao': 'Texto detalhando onde aplicar anúncios e o que oferecer' } }.

Dados de Contexto para Análise:
${JSON.stringify(dados, null, 2)}`;

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

    // Lista de modelos compatíveis com a API Gemini Flash (com resiliência automática)
    const modelos = ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-1.5-flash"];
    let ultimoErro = null;

    for (const modelo of modelos) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
        try {
            console.log(`[Gemini Atração] Consultando modelo ${modelo}...`);
            const resposta = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!resposta.ok) {
                const erroData = await resposta.json().catch(() => ({}));
                console.warn(`[Gemini Atração] Modelo ${modelo} retornou status ${resposta.status}:`, erroData);
                ultimoErro = new Error(`API Gemini status ${resposta.status}: ${erroData.error?.message || resposta.statusText}`);
                continue;
            }

            const data = await resposta.json();
            const textoBruto = data?.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!textoBruto) {
                throw new Error("A IA respondeu sem conteúdo de texto.");
            }

            // Sanitiza caso o modelo devolva envolvido em markdown ```json
            let sanitized = textoBruto.trim();
            if (sanitized.startsWith("```json")) {
                sanitized = sanitized.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
            } else if (sanitized.startsWith("```")) {
                sanitized = sanitized.replace(/^```\s*/, "").replace(/\s*```$/, "");
            }

            const jsonIA = JSON.parse(sanitized);
            console.log("[Gemini Atração] Decisão estratégica formulada:", jsonIA);
            return jsonIA;
        } catch (err) {
            console.warn(`[Gemini Atração] Falha ao tentar modelo ${modelo}:`, err);
            ultimoErro = err;
        }
    }

    throw ultimoErro || new Error("Não foi possível conectar à API do Gemini.");
}

/**
 * 4. Renderização no DOM: Atualiza os elementos visuais do painel
 */
function renderizarPainelAtracao(jsonIA) {
    if (!jsonIA) return;

    // Vetor 1: Sazonalidade
    const sazoTitulo = document.getElementById("sazoTitulo");
    const sazoClima = document.getElementById("sazoClima");
    const sazoDescricao = document.getElementById("sazoDescricao");

    if (sazoTitulo && jsonIA.sazonalidade?.titulo) sazoTitulo.textContent = jsonIA.sazonalidade.titulo;
    if (sazoClima && jsonIA.sazonalidade?.clima) sazoClima.textContent = jsonIA.sazonalidade.clima;
    if (sazoDescricao && jsonIA.sazonalidade?.descricao) sazoDescricao.textContent = jsonIA.sazonalidade.descricao;

    // Vetor 2: Concorrência
    const concTitulo = document.getElementById("concTitulo");
    const concAlerta = document.getElementById("concAlerta");
    const concDescricao = document.getElementById("concDescricao");

    if (concTitulo && jsonIA.concorrencia?.titulo) concTitulo.textContent = jsonIA.concorrencia.titulo;
    if (concAlerta && jsonIA.concorrencia?.alerta) concAlerta.textContent = jsonIA.concorrencia.alerta;
    if (concDescricao && jsonIA.concorrencia?.descricao) concDescricao.textContent = jsonIA.concorrencia.descricao;

    // Vetor 3: Decisão Algorítmica (IA)
    const decisaoCampanha = document.getElementById("decisaoCampanha");
    const decisaoAcao = document.getElementById("decisaoAcao");

    if (decisaoCampanha && jsonIA.decisao?.nome_campanha) decisaoCampanha.textContent = jsonIA.decisao.nome_campanha;
    if (decisaoAcao && jsonIA.decisao?.acao) decisaoAcao.textContent = jsonIA.decisao.acao;

    // Atualiza status do Radar
    const statusRadar = document.getElementById("statusRadar");
    if (statusRadar) {
        statusRadar.className = "bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-2 transition-colors";
        statusRadar.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500"></span> Radar Ativo`;
    }
}

/**
 * 5. Exibe estado de carregamento inicial
 */
function exibirLoadingAtracao() {
    const statusRadar = document.getElementById("statusRadar");
    if (statusRadar) {
        statusRadar.className = "bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-2 transition-colors";
        statusRadar.innerHTML = `<span class="w-2 h-2 rounded-full bg-blue-600 animate-ping"></span> Processando IA...`;
    }

    const sazoTitulo = document.getElementById("sazoTitulo");
    const concTitulo = document.getElementById("concTitulo");
    const decisaoCampanha = document.getElementById("decisaoCampanha");

    if (sazoTitulo) sazoTitulo.textContent = "Calculando sazonalidade...";
    if (concTitulo) concTitulo.textContent = "Analisando concorrência...";
    if (decisaoCampanha) decisaoCampanha.textContent = "Formulando decisão rápida...";
}

/**
 * 6. Pipeline Principal
 */
async function inicializarAtracao() {
    exibirLoadingAtracao();

    try {
        const dados = await carregarContextoExterno();
        const jsonIA = await chamarGeminiAtracao(dados);
        renderizarPainelAtracao(jsonIA);
    } catch (erro) {
        console.error("[Erro na inicialização de Atração]:", erro);
        const statusRadar = document.getElementById("statusRadar");
        if (statusRadar) {
            statusRadar.className = "bg-red-100 text-red-700 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-2";
            statusRadar.innerHTML = `<span class="w-2 h-2 rounded-full bg-red-600"></span> Erro no Radar`;
        }
    }
}

// 7. Execução automática no carregamento da página
document.addEventListener("DOMContentLoaded", () => {
    inicializarAtracao();
});
