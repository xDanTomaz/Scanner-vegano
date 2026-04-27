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

// Normalização para evitar erros de acento, espaços e caixa alta
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
            status.innerHTML = "❌ Erro na leitura.";
        }
    } catch (error) {
        status.innerText = "Erro na API do Google.";
    }
}

// ==========================================
// 4. LÓGICA DE PROCESSAMENTO (CONSOLIDADA)
// ==========================================
function processarIngredientes(texto) {
    const textoLimpo = normalizarParaBusca(texto);
    
    // 🛡️ 1. LOCALIZAR O BLOCO REAL DE INGREDIENTES
    const marcadorInicio = "INGREDIENTES";
    const indiceInicio = textoLimpo.indexOf(marcadorInicio);

    if (indiceInicio === -1) {
        status.innerHTML = `<div style="padding:20px; background:#666; border-radius:15px;"><strong>🔍 LISTA NÃO LOCALIZADA</strong></div>`;
        return;
    }

    // 🛡️ 2. DEFINIR O FIM DA LEITURA (Ignora fabricação e rodapés)
    let textoFocado = textoLimpo.substring(indiceInicio);
    const marcadoresFim = ["CONSERVACAO", "VALOR ENERGETICO", "PRODUZIDO POR", "FABRICADO POR", "SAC:", "VALIDADE"];
    
    let indiceFim = textoFocado.length;
    marcadoresFim.forEach(m => {
        const idx = textoFocado.indexOf(m);
        if (idx !== -1 && idx < indiceFim && idx > 15) indiceFim = idx;
    });

    textoFocado = textoFocado.substring(0, indiceFim);

    // 🛡️ 3. FILTRO ANTI-TABELA NUTRICIONAL (O "Pulo do Gato")
    // Vamos quebrar o texto em linhas e remover aquelas que parecem ser da tabela nutricional
    const linhas = textoFocado.split('\n');
    const palavrasTabela = ["VD", "KCAL", "KJ", "PORCAO", "QUANTIDADE", "VALOR", "%"];
    
    const textoFiltrado = linhas.filter(linha => {
        // Se a linha tiver muitas palavras de tabela nutricional, nós a descartamos
        const ehTabela = palavrasTabela.some(p => linha.includes(p));
        return !ehTabela;
    }).join(' ');

    // 🛡️ 4. SEPARAR "PODE CONTER"
    const marcadorAviso = "PODE CONTER";
    const indiceAviso = textoFiltrado.indexOf(marcadorAviso);
    
    let ingredientesReais = textoFiltrado;
    let alertasTracos = "";

    if (indiceAviso !== -1) {
        ingredientesReais = textoFiltrado.substring(0, indiceAviso);
        alertasTracos = textoFiltrado.substring(indiceAviso);
    }

    let encontrados = [];

    // 5. FILTRO DE CHOQUE (Itens Fatais)
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

    // 6. COMPARAÇÃO COM CSV (Apenas no texto filtrado de ingredientes)
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

    const temNaoVegano = lista.some(i => limpar(i.classificacao).includes("NAO"));
    const temAmbiguo = lista.some(i => limpar(i.classificacao).includes("AMBIGUA") || limpar(i.classificacao).includes("DUBIO"));
    
    let htmlSelo = "";

    if (temNaoVegano) {
        htmlSelo = `
            <div style="background:#b71c1c; color:#fff; padding:25px; border-radius:15px; border:5px solid #801111; margin-bottom:20px; box-shadow: 0 5px 15px rgba(0,0,0,0.3);">
                <strong style="font-size:1.6em; display:block;">❌ PRODUTO NÃO VEGANO</strong>
                <p style="margin-top:10px; font-weight:normal; opacity:0.9;">Ingredientes de origem animal confirmados.</p>
            </div>`;
    } else if (temAmbiguo) {
        htmlSelo = `
            <div style="background:#f57f17; color:#fff; padding:25px; border-radius:15px; border:5px solid #c86612; margin-bottom:20px;">
                <strong style="font-size:1.5em; display:block;">⚠️ ORIGEM AMBÍGUA</strong>
                <p style="margin-top:10px; font-weight:normal; opacity:0.9;">Contém itens que exigem cautela.</p>
            </div>`;
    } else {
        htmlSelo = `
            <div style="background:#2d5a27; color:#fff; padding:25px; border-radius:15px; border:5px solid #1e3d1a; margin-bottom:20px;">
                <strong style="font-size:1.5em; display:block;">🌱 PARECE VEGANO</strong>
                <p style="margin-top:10px; font-weight:normal; opacity:0.9;">Nenhum item animal detectado nos ingredientes.</p>
            </div>`;
    }

    let htmlCards = lista.map(item => {
        const cNorm = limpar(item.classificacao);
        let cor = "#2d5a27"; 
        let label = "VEGANO";

        if (cNorm.includes("NAO")) { cor = "#b71c1c"; label = "NÃO VEGANO"; }
        else if (cNorm.includes("AMBIGUA") || cNorm.includes("DUBIO")) { cor = "#f57f17"; label = "ORIGEM AMBÍGUA"; }

        return `
            <div style="border-left:10px solid ${cor}; background:#fff; padding:15px; margin-bottom:12px; border-radius:0 12px 12px 0; text-align:left; box-shadow:0 4px 8px rgba(0,0,0,0.1);">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong style="color:${cor}; font-size:1.15em;">${item.nome}</strong>
                    <span style="background:${cor}; color:#fff; font-size:0.65em; padding:4px 10px; border-radius:6px; font-weight:bold;">${label}</span>
                </div>
                <p style="color:#555; font-size:0.9em; margin-top:8px; line-height:1.4;">${item.descricao}</p>
            </div>`;
    }).join('');

    status.innerHTML = htmlSelo + htmlCards;
}

// Eventos de câmera e upload chamando analisarComGoogleVision(base64)...
btnScan.addEventListener('click', async () => {
    fotoPreview.style.display = "none";
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        prepararContainer();
        video.srcObject = stream;
        video.style.display = "block";
        btnScan.style.display = "none";
        btnCapture.style.display = "block";
    } catch (err) { status.innerText = "Erro na câmera."; }
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
