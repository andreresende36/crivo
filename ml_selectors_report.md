# Relatório de Seletores HTML - Mercado Livre

Este relatório contém os seletores CSS e observações extraídas das páginas de Ofertas do Dia e da Categoria de Moda Masculina do Mercado Livre para implementação do web scraping com BeautifulSoup.

## 1. Seletores Comuns (Ofertas e Moda)
A estrutura HTML do Mercado Livre atualmente utiliza componentes estilizados com o prefixo `poly-` e `andes-`.

| Elemento                     | Seletor Primário (BeautifulSoup)                             | Seletor Backup / Alternativo                            |
| ---------------------------- | ------------------------------------------------------------ | ------------------------------------------------------- |
| **Container do Card**        | `div.poly-card`                                              | `li.ui-search-layout__item`                             |
| **Título do Produto**        | `a.poly-component__title`                                    | `h2.poly-box.poly-component__title`                     |
| **Link do Produto**          | `a.poly-component__title` (atributo `href`)                  | `a.ui-search-link`                                      |
| **Preço Atual (com desc.)**  | `.poly-price__current .andes-money-amount__fraction`         | `.andes-money-amount__fraction` dentro do card          |
| **Preço Original (riscado)** | `s.poly-price__original .andes-money-amount__fraction`       | `.poly-price__comparison .andes-money-amount__fraction` |
| **Desconto (%)**             | `span.poly-discount` ou `.poly-price__percentage`            | -                                                       |
| **Frete Grátis**             | `div.poly-component__shipping` (buscar texto "Frete grátis") | -                                                       |
| **Badges (Oferta, Vendido)** | `span.poly-component__highlight`                             | -                                                       |
| **Imagem / Thumbnail**       | `div.poly-card__portada img` (usar `data-src`)               | `.poly-component__picture img`                          |

### Imagem de Referência (Ofertas do Dia)
![Página de Ofertas do Dia](/Users/andreresende/.gemini/antigravity/brain/c58e2830-1445-4397-a074-7d9fb50cea9d/ofertas_page_full_1772496643260.png)
*(Os componentes como título, preços e imagens seguem todos a hierarquia interna da classe `.poly-card`)*

---

## 2. Seletores Específicos (Categoria Moda Masculina)
Nas páginas de listagem e categorias específicas (como Moda), existem informações adicionais relacionadas ao vendedor e volume de vendas.

| Elemento                | Seletor Primário (BeautifulSoup)                                | Observações                              |
| ----------------------- | --------------------------------------------------------------- | ---------------------------------------- |
| **Info. do Vendedor**   | `span.poly-component__seller-name`                              | Exibe nome/reputação se for MercadoLíder |
| **Quantidade Vendida**  | `span.poly-component__sales`                                    | Ex: "+100mil vendidos"                   |
| **Nota de Avaliação**   | `span.poly-component__rating-number` ou `.poly-reviews__rating` | Nota numérica (ex: 4.8)                  |
| **Qtde. de Avaliações** | `span.poly-component__rating-sales` ou `.poly-reviews__total`   | Número total de reviews                  |

### Imagem de Referência (Moda Masculina)
![Página de Moda Masculina](/Users/andreresende/.gemini/antigravity/brain/c58e2830-1445-4397-a074-7d9fb50cea9d/moda_masculina_grid_1772497014152.png)

---

## 3. Comportamentos de Página e Dinâmicas

### Lazy Loading de Imagens
- **Status:** **Ativo** nas duas páginas.
- **Impacto no Scraping:** O atributo `src` da imagem inicialmente carrega um placeholder transparente. 
- **Solução no Código:** Nos scrapers com BeautifulSoup, você deverá extrair o URL real da imagem a partir do atributo **`data-src`**. Alternativamente, o Playwright deve realizar scroll até o final da página para forçar o carregamento de todos os `src` antes da extração.

### Paginação e Filtros
- **Página de Ofertas:** Utiliza botões com a classe `.andes-pagination__link`. O botão de avançar geralmente contém o texto auxiliar "Seguinte" ou avança um offset de página internamente.
- **Página de Categoria (Moda):** A estrutura de paginação também utiliza `.andes-pagination__link`. Ao avançar a página, a estrutura modifica a URL diretamente adicionando offsets do estilo `/_Desde_51/` indicando itens de 50 em 50.
- **Filtros (Sidebar):** Aplicar um filtro pela interface altera a URL base. Exemplo: Filtrar Moda por Homem adiciona o path `_GENDER_18549360` ao final de `/lista/_Container_moda-fashion`. Parâmetros de ordenação inserem tags como `_unord_1`.

### Proteções Anti-bot Observadas
- **Status:** Nenhum Captcha explícito da Cloudflare ou desafio de browser (hcaptcha, Datadome) bloqueou a visualização inicial pelo agente headless. 
- **Risco Contínuo:** O Mercado Livre reage a volume/frequência e a _fingerprints_ fáceis de bot. O uso da classe base `BaseScraper` detalhada no Roadmap MVP será essencial, implementando a rotação de *User-Agent* com o contexto de um _real browser_ do Playwright para garantir estabilidade.
