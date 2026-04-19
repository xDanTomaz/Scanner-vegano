
const API_KEY = 'AIzaSyBY6nlwbC7vwA5NVkQcrDWrmkIVusFG60I'; // API do google cloud

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const btnScan = document.getElementById('btn-scan');
const btnCapture = document.getElementById('btn-capture');
const fileUpload = document.getElementById('file-upload');
const status = document.getElementById('status');
const fotoPreview = document.getElementById('foto-preview');

let bancoDadosVegano = [];

// carregar o banco de dados CSV
async function carregarBancoDeDados() {
    try {
        const resposta = await fetch('ingredientes.csv');
        const texto = await resposta.text();
        const linhas = texto.split('\n').slice(1); 
        
        bancoDadosVegano = linhas.map(linha => {
            const colunas = linha.split(';'); 
            if (colunas.length >= 3) {
                return {
                    nome: colunas[0].trim(),
                    classificacao: colunas[1].trim(),
                    descricao: colunas[2].trim()
                };
            }
            return null;
        }).filter(item => item !== null);

        status.innerText = "Pronto para escanear!";
    } catch (erro) {
        status.innerText = "Erro ao carregar banco de dados (CSV).";
    }
}

// integração com o google vision
async function analisarComGoogleVision(base64Image) {
    status.innerHTML = `<div style="padding:10px;">🔍 Analisando rótulo com Google Vision...</div>`;
    
    const content = base64Image.replace(/^data:image\/(png|jpg|jpeg);base64,/, "");
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY}`;
    
    const requestBody = {
        requests: [{
            image: { content: content },
            features: [{ type: "TEXT_DETECTION" }]
        }]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify(requestBody)
        });
        const data = await response.json();
        const textoDetectado = data.responses[0].fullTextAnnotation ? data.responses[0].fullTextAnnotation.text : "";
        
        if (textoDetectado) {
            processarIngredientes(textoDetectado);
        } else {
            status.innerHTML = "❌ Não conseguimos ler o texto. Tente focar melhor.";
        }
    } catch (error) {
        console.error(error);
        status.innerText = "Erro de conexão. Verifique o faturamento e a chave da API.";
    }
}

// filtros para a leitura da embalagem
function processarIngredientes(texto) {
    const textoUpper = texto.toUpperCase();
    const marcadorInicio = "INGREDIENTES";
    const indiceInicio = textoUpper.indexOf(marcadorInicio);

    // SEGURANÇA: Se não detectar o bloco de ingredientes, recusa o selo verde
    if (indiceInicio === -1) {
        status.innerHTML = `
            <div style="background:#eee; padding:15px; border-radius:10px; color:#444;">
                ⚠️ <strong>Leitura Incompleta</strong><br>
                Não localizamos a lista de ingredientes na foto. Tente centralizar o texto.
            </div>`;
        return;
    }

    let textoUtil = textoUpper.substring(indiceInicio);
    // O scanner para de ler caso encontre alguma dessas palavras:
    const marcadoresFim = ["FABRICADO POR", "DISTRIBUIDO", "INDUSTRIA BRASILEIRA", "CNPJ", "SAC:", "VALIDADE"];
    let indiceFim = textoUtil.length;

    marcadoresFim.forEach(m => {
        const idx = textoUtil.indexOf(m);
        if (idx !== -1 && idx < indiceFim && idx > 20) indiceFim = idx;
    });

    textoUtil = textoUtil.substring(0, indiceFim);
    const textoBusca = textoUtil.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    let encontrados = [];

    bancoDadosVegano.forEach(item => {
        const nomeFormatado = item.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        
        if (item.classificacao.toLowerCase() !== "vegano") {
            const regex = new RegExp(`\\b${nomeFormatado}\\b`, 'gi');
            if (regex.test(textoBusca)) {
                const eAlergico = textoUtil.includes("ALERGICO") && 
                                  textoUtil.indexOf(item.nome.toUpperCase()) > textoUtil.indexOf("ALERGICO");
                encontrados.push({ ...item, contexto: eAlergico ? "ALERTA DE ALÉRGICOS" : "LISTA DE INGREDIENTES" });
            }
        }
    });

    exibirResultado(encontrados, textoUtil);
}

// Mostra o resultado obtido para o usuário
function exibirResultado(encontrados, trechoLido) {
    const resumo = trechoLido.substring(0, 70).replace(/\n/g, " ") + "...";
    let html = `<div style="font-size:0.6em; color:gray; margin-bottom:10px;">Texto lido: "${resumo}"</div>`;

    if (encontrados.length > 0) {
        const temNaoVegano = encontrados.some(i => i.classificacao.toLowerCase().includes("nao"));
        
        html += `<div style="color:${temNaoVegano ? '#b71c1c' : '#f57f17'}; font-weight:bold; font-size:1.2em; margin-bottom:15px;">
                    ${temNaoVegano ? '❌ PRODUTO NÃO VEGANO' : '⚠️ ATENÇÃO: DÚBIO'}
                 </div>`;

        encontrados.forEach(item => {
            let cor = item.classificacao.toLowerCase().includes("nao") ? "#b71c1c" : "#f57f17";
            html += `
                <div style="border-left:5px solid ${cor}; background:#fff; padding:10px; margin-bottom:8px; text-align:left; border-radius: 0 8px 8px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    <strong style="color:${cor};">${item.nome.toUpperCase()}</strong> 
                    <span style="font-size:0.65em; background:#eee; padding:2px 5px; border-radius:5px; margin-left:5px;">${item.contexto}</span><br>
                    <small style="color:#555;">${item.descricao}</small>
                </div>`;
        });
    } else {
        html += `
            <div style="color:#2d5a27; padding:15px;">
                <span style="font-size:2.5em;">🌱</span><br>
                <strong>NENHUM ITEM ANIMAL DETECTADO</strong><br>
                <p style="font-size:0.8em; color:#444;">O scanner não encontrou ingredientes proibidos. Verifique sempre o selo vegano oficial.</p>
            </div>`;
    }
    status.innerHTML = html;
}

// ==========================================
// 6. Eventos das imagens (camera, captura e upload de imagens)
// ==========================================
btnScan.addEventListener('click', async () => {
    fotoPreview.style.display = "none";
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = stream;
        video.style.display = "block";
        btnScan.style.display = "none";
        btnCapture.style.display = "block";
    } catch (err) { status.innerText = "Erro ao abrir câmera."; }
});

btnCapture.addEventListener('click', () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    
    const base64 = canvas.toDataURL('image/jpeg');
    
    // Mostra o preview da foto
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
        fotoPreview.src = reader.result;
        fotoPreview.style.display = "block";
        analisarComGoogleVision(reader.result);
    };
    reader.readAsDataURL(e.target.files[0]);
});

// iniciar o carregamento do banco de dados CSV
carregarBancoDeDados();