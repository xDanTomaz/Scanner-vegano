# 🌱 EthoScan — Leitor Inteligente de Ingredientes

O **EthoScan** é uma aplicação web desenvolvida para analisar rótulos de alimentos através de leitura ótica de caracteres (OCR) e identificar instantaneamente se um produto é adequado para veganos ou se possui alergénicos/contaminação cruzada.

---

## 🚀 Funcionalidades

* **Leitura Ótica (OCR):** Captura de imagens em tempo real através da câmara traseira do telemóvel ou upload a partir da galeria.
* **Processamento com IA:** Integração com a **Google Cloud Vision API** para extração de texto de rótulos.
* **Filtragem Inteligente de Ruído:** Remoção automática de dados nutricionais (gorduras, sódio, kcal, etc.) para focar na composição química.
* **Análise de Contexto e Proximidade:** Diferenciação entre ingredientes reais (ex: *"Contém Leite"*) e alertas de contaminação cruzada (ex: *"Pode Conter Leite"*).
* **Cruzamento de Dados:** Comparação automatizada com uma base de dados local (`ingredientes.csv`).
* **Veredicto Semafórico:** Exibição clara e visual dos resultados (Produto Vegano, Origem Ambígua, Não Vegano ou Contaminação Cruzada).

---

## 🛠️ Tecnologias Utilizadas

* **HTML5** & **CSS3** (Variáveis CSS, Flexbox e Grid)
* **JavaScript (ES6+)**
* **Google Cloud Vision API**
* **Lucide Icons**

---

## 📄 Estrutura do Projeto

```text
├── index.html        # Página inicial (Landing Page)
├── scanner.html      # Interface da câmara e scanner
├── style_home.css    # Estilos da página inicial
├── style.css         # Estilos da aplicação scanner
├── script_home.js    # Lógica da landing page
├── script.js         # Lógica de OCR, IA e cruzamento de dados
└── ingredientes.csv  # Base de dados local de ingredientes
