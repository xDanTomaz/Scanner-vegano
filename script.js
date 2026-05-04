// ==========================================
// 1. CONFIGURAÇÕES E ELEMENTOS
// ==========================================
const API_KEY = 'AIzaSyBY6nlwbC7vwA5NVkQcrDWrmkIVusFG60I'; 

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const btnScan = document.getElementById('btn-scan');
const btnCapture = document.getElementById('btn-capture');
const fileUpload = document.getElementById('file-upload');
const status = document.getElementById('status');
const fotoPreview = document.getElementById('foto-preview');
const instrucoes = document.getElementById('instrucoes');
const containerPreview = document.getElementById('container-preview');

let bancoDadosVegano = [];

const normalizarParaBusca = (str) => {
    return str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim() : "";
};

function prepararContainer() {
    if (instrucoes) instrucoes.style.display = "none";
    if (containerPreview) containerPreview.classList.add('active');
}

// 2. Carregar Banco de Dados
async function carregarBancoDeDados() {
    try {
        const resposta = await fetch('ingredientes.csv');
        const texto = await resposta.text();
        const linhas = texto.split('\n').slice(1); 
        bancoDadosVegano = linhas.map(linha => {
            const colunas = linha.split(';'); 
            if (colunas.length >= 3) {
                return {
                    nome: colunas[0].trim().toUpperCase(),
                    classificacao: colunas[1].trim().toUpperCase(),
                    descricao: colunas[2].trim()
                };
            }
            return null;
        }).filter(item => item !== null);
        status.innerText = "Pronto para escanear!";
    } catch (erro) {
        status.innerText = "Erro ao carregar banco de dados.";
    }
}

// 3. Integração Google Vision
async function analisarComGoogleVision(base64Image) {
    status.innerHTML = `<div class="spinner"></div> Analisando composição...`;
    const content = base64Image.replace(/^data:image\/(png|jpg|jpeg);base64,/, "");
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({
                requests: [{ image: { content: content }, features: [{ type: "TEXT_DETECTION" }] }]
            })
        });
        const data = await response.json();
        const textoDetectado = data.responses[0].fullTextAnnotation ? data.responses[0].fullTextAnnotation.text : "";
        if (textoDetectado) {
            processarIngredientes(textoDetectado);
        } else {
            status.innerHTML = "❌ Erro na leitura. Tente focar melhor.";
        }
    } catch (error) {
        status.innerText = "Erro na API do Google.";
    }
}

// ==========================================
// 4. LÓGICA DE PROCESSAMENTO (VERSÃO FINAL)
// ==========================================
function processarIngredientes(texto) {
    const textoLimpo = normalizarParaBusca(texto);
    
    // 1. LOCALIZAR O INÍCIO (Garante que ignoramos títulos e slogans no topo)
    const marcadorInicio = "INGREDIENTES";
    const indiceInicio = textoLimpo.indexOf(marcadorInicio);

    if (indiceInicio === -1) {
        status.innerHTML = `<div style="padding:20px; background:#666; border-radius:15px;"><strong>🔍 LISTA NÃO LOCALIZADA</strong></div>`;
        return;
    }

    let textoFocado = textoLimpo.substring(indiceInicio);

    // 2. DEFINIR O FIM DA LEITURA
    const marcadoresFim = ["CONSERVACAO", "VALOR ENERGETICO", "PRODUZIDO POR", "SAC:", "VALIDADE", "PESO"];
    let indiceFim = textoFocado.length;
    marcadoresFim.forEach(m => {
        const idx = textoFocado.indexOf(m);
        if (idx !== -1 && idx < indiceFim && idx > 10) indiceFim = idx;
    });
    textoFocado = textoFocado.substring(0, indiceFim);

    // 🛡️ 3. FILTRO DE RUÍDO NUTRICIONAL (LIMPEZA DE TABELA)
    const termosTabela = [
        "GORDURAS", "GORDURAS TOTAIS","GORDURAS SATURADAS", "SODIO", "PROTEINAS", "CARBOIDRATOS", 
        "VALOR", "KCAL", "KJ", "PORCAO", "QUANTIDADE", "VD", "%"
    ];

    const linhas = textoFocado.split('\n');
    const textoFinalFiltrado = linhas.map(linha => {
        let linhaLimpa = linha;
        termosTabela.forEach(termo => {
            if (linhaLimpa.includes(termo)) {
                linhaLimpa = linhaLimpa.split(termo)[0];
            }
        });
        return linhaLimpa;
    }).join(' ');

    // 🛡️ 4. SEPARAÇÃO RIGOROSA PARA ALÉRGICOS (MODIFICAÇÃO IMPLEMENTADA)
    const marcadoresAviso = ["PODE CONTER", "ALERGICOS", "TRACOS DE"];
    let pontoDeCorte = textoFinalFiltrado.length;
    marcadoresAviso.forEach(m => {
        const idx = textoFinalFiltrado.indexOf(m);
        if (idx !== -1 && idx < pontoDeCorte) pontoDeCorte = idx;
    });

    const ingredientesReais = textoFinalFiltrado.substring(0, pontoDeCorte);
    const alertasTracos = textoFinalFiltrado.substring(pontoDeCorte);

    let encontrados = [];
    const fatais = [
        { nome: "LEITE", desc: "Origem animal." },
        { nome: "OVOS", desc: "Origem animal." },
        { nome: "MEL", desc: "Origem animal." },
        { nome: "CARNE", desc: "Origem animal." },
        { nome: "SORO", desc: "Derivado de leite animal." }
    ];

    // Busca nos Ingredientes Reais (Gera bloqueio não vegano)
    fatais.forEach(f => {
        const regex = new RegExp(`\\b${f.nome}\\b`, 'gi');
        if (regex.test(ingredientesReais)) {
            encontrados.push({ 
                nome: f.nome, 
                classificacao: "NAO VEGANO", 
                descricao: f.desc 
            });
        } 
        // Busca apenas nos alertas (Gera card branco informativo)
        else if (regex.test(alertasTracos)) {
            encontrados.push({ 
                nome: f.nome, 
                classificacao: "CONTAMINACAO", 
                descricao: `Alerta para alérgicos: Pode conter traços de ${f.nome.toLowerCase()} devido ao processamento.` 
            });
        }
    });

    // Comparação com Banco de Dados CSV (apenas ingredientes reais)
    bancoDadosVegano.forEach(item => {
        const nomeCSV = normalizarParaBusca(item.nome);
        const regexCSV = new RegExp(`\\b${nomeCSV}\\b`, 'gi');
        if (regexCSV.test(ingredientesReais) && !encontrados.some(e => e.nome === nomeCSV)) {
            encontrados.push({ ...item });
        }
    });

    exibirResultadoVeredito(encontrados, ingredientesReais);
}

    // 4. SEPARAR "PODE CONTER"
    const marcadorAviso = "PODE CONTER";
    const indiceAviso = textoFinalFiltrado.indexOf(marcadorAviso);
    
    let ingredientesReais = textoFinalFiltrado;
    let alertasTracos = "";

    if (indiceAviso !== -1) {
        ingredientesReais = textoFinalFiltrado.substring(0, indiceAviso);
        alertasTracos = textoFinalFiltrado.substring(indiceAviso);
    }

    let encontrados = [];

    // 5. FILTRO DE CHOQUE (Fatais)
    const fatais = [
        { nome: "LEITE", desc: "Origem animal." },
        { nome: "OVOS", desc: "Origem animal." },
        { nome: "CARNE", desc: "Origem animal." },
        { nome: "MEL", desc: "Origem animal." }
    ];

    fatais.forEach(f => {
        const regex = new RegExp(`\\b${f.nome}\\b`, 'gi');
        if (regex.test(ingredientesReais)) {
            encontrados.push({ nome: f.nome, classificacao: "NAO VEGANO", descricao: f.desc });
        } else if (regex.test(alertasTracos)) {
            encontrados.push({ nome: f.nome, classificacao: "ORIGEM AMBIGUA", descricao: "Aviso de traços (contaminação)." });
        }
    });

    // 6. COMPARAÇÃO COM CSV (No texto limpo de ruídos nutricionais)
    bancoDadosVegano.forEach(item => {
        const nomeCSV = normalizarParaBusca(item.nome);
        const regexCSV = new RegExp(`\\b${nomeCSV}\\b`, 'gi');
        if (regexCSV.test(ingredientesReais) && !encontrados.some(e => e.nome === nomeCSV)) {
            encontrados.push({ ...item });
        }
    });

    exibirResultadoVeredito(encontrados, ingredientesReais);
}
// ==========================================
// 5. EXIBIÇÃO (HIERARQUIA DE CORES)
// ==========================================
function exibirResultadoVeredito(lista, textoExibicao) {
    const limpar = (str) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() : "";

    // 1. RESUMO DO TEXTO LIDO
    let resumoLimpo = textoExibicao 
        ? textoExibicao.substring(0, 100).replace(/\n/g, " ").trim() 
        : "Trecho não identificado";

    let htmlHeader = `
        <div style="font-size:0.7em; color:#777; margin-bottom:10px; text-align:center; font-style:italic;">
            Lido: "${resumoLimpo}..."
        </div>`;

    // 2. LÓGICA DE DECISÃO DO SELO PRINCIPAL
    // O sistema ignora itens de "CONTAMINACAO" para decidir se o selo é vermelho ou laranja
    const temNaoVegano = lista.some(i => limpar(i.classificacao).includes("NAO"));
    const temAmbiguo = lista.some(i => limpar(i.classificacao).includes("AMBIGUA") || limpar(i.classificacao).includes("DUBIO"));
    
    let htmlSelo = "";

    if (temNaoVegano) {
        htmlSelo = `<div style="background:#b71c1c; color:#fff; padding:25px; border-radius:15px; border:5px solid #801111; margin-bottom:20px; box-shadow: 0 5px 15px rgba(0,0,0,0.3);"><strong>❌ PRODUTO NÃO VEGANO</strong></div>`;
    } else if (temAmbiguo) {
        htmlSelo = `<div style="background:#f57f17; color:#fff; padding:25px; border-radius:15px; border:5px solid #c86612; margin-bottom:20px;"><strong>⚠️ ORIGEM AMBÍGUA</strong></div>`;
    } else {
        // Se houver apenas "CONTAMINACAO" (ou nada), o produto continua com selo verde
        htmlSelo = `<div style="background:#2d5a27; color:#fff; padding:25px; border-radius:15px; border:5px solid #1e3d1a; margin-bottom:20px;"><strong>🌱 PARECE VEGANO</strong></div>`;
    }

    // 3. GERAÇÃO DOS CARDS INDIVIDUAIS
    let htmlCards = lista.map(item => {
        const cNorm = limpar(item.classificacao);
        
        // Definição de cores e etiquetas
        let cor = "#2d5a27"; // Verde padrão
        let label = "VEGANO";
        let bgColor = "#fff";

        if (cNorm.includes("NAO")) { 
            cor = "#b71c1c"; 
            label = "NÃO VEGANO"; 
        } else if (cNorm.includes("AMBIGUA") || cNorm.includes("DUBIO")) { 
            cor = "#f57f17"; 
            label = "ORIGEM AMBÍGUA"; 
        } else if (cNorm.includes("CONTAMINACAO")) { 
            // Estilo para Contaminação Cruzada: Branco com borda cinza
            cor = "#ddd"; 
            label = "CONTAMINAÇÃO CRUZADA";
            bgColor = "#f9f9f9"; 
        }

        // Ajuste de cores de texto para o card de contaminação (branco)
        let textTitleColor = (cNorm.includes("CONTAMINACAO")) ? "#444" : cor;
        let labelTextColor = (cNorm.includes("CONTAMINACAO")) ? "#666" : "#fff";
        let labelBorderStyle = (cNorm.includes("CONTAMINACAO")) ? "1px solid #ccc" : "none";

        return `
            <div style="border-left:10px solid ${cor}; background:${bgColor}; padding:15px; margin-bottom:12px; border-radius:0 12px 12px 0; text-align:left; box-shadow:0 4px 8px rgba(0,0,0,0.1); border-top: 1px solid #eee; border-right: 1px solid #eee; border-bottom: 1px solid #eee;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong style="color:${textTitleColor};">${item.nome}</strong>
                    <span style="background:${cor}; color:${labelTextColor}; font-size:10px; padding:3px 8px; border-radius:5px; font-weight:bold; border:${labelBorderStyle};">${label}</span>
                </div>
                <p style="color:#555; font-size:0.9em; margin-top:8px;">${item.descricao}</p>
            </div>`;
    }).join('');

    // 4. ATUALIZAÇÃO DO STATUS
    status.innerHTML = htmlHeader + htmlSelo + htmlCards;
}

// ==========================================
// 6. EVENTOS E CÂMERA (COM FOCO AUTOMÁTICO)
// ==========================================
btnScan.addEventListener('click', async () => {
    fotoPreview.style.display = "none";
    
    const constraints = {
        video: {
            facingMode: "environment",
            width: { ideal: 1920 },
            height: { ideal: 1080 }
        }
    };

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        prepararContainer();
        video.srcObject = stream;
        video.style.display = "block";
        btnScan.style.display = "none";
        btnCapture.style.display = "block";

        // Tentar forçar foco contínuo se o hardware permitir
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities();
        if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
            await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
        }
    } catch (err) { status.innerText = "Erro ao acessar câmera."; }
});

// Toque no vídeo para tentar refocar manualmente
video.addEventListener('click', async () => {
    const track = video.srcObject.getVideoTracks()[0];
    if (track.getCapabilities().focusMode) {
        await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
    }
});

btnCapture.addEventListener('click', () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const base64 = canvas.toDataURL('image/jpeg');
    
    prepararContainer();
    fotoPreview.src = base64;
    fotoPreview.style.display = "block";

    video.srcObject.getTracks().forEach(t => t.stop());
    video.style.display = "none";
    btnCapture.style.display = "none";
    btnScan.style.display = "block";

    analisarComGoogleVision(base64);
});

fileUpload.addEventListener('change', (e) => {
    const reader = new FileReader();
    reader.onload = () => {
        prepararContainer();
        fotoPreview.src = reader.result;
        fotoPreview.style.display = "block";
        analisarComGoogleVision(reader.result);
    };
    reader.readAsDataURL(e.target.files[0]);
});

carregarBancoDeDados();
