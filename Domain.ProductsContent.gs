// =============================================================================
// Domain.ProductsContent.gs — SGA
// Descritivos comerciais FALLBACK (PT-BR), chaveados por CÓDIGO.
// A fonte RICA (shortDesc/fullDesc/características/aplicações) é o
// Domain.HydronixContent.gs — este arquivo cobre os itens que não estão lá
// (acessórios, cabos, dutos, peças de desgaste, variantes de display/hub).
//
// USO: o gerador de proposta busca primeiro a coluna long_description da aba
// PRODUCTS (editável pelo time); se vazia, cai neste dicionário. O seed
// initProductsSheet copia estes textos para a planilha quando a célula está
// vazia — a planilha é a fonte editável, este arquivo é o padrão de fábrica.
//
// Textos autorais da Allegro (resumos técnicos próprios — não copiar
// literalmente material do fabricante). Links de folder/manual: preencher a
// coluna datasheet_url na aba PRODUCTS com a URL do hydronix.com.
// =============================================================================

var ALLEGRO_PRODUCT_DESCRIPTIONS = {

  // ── Sensores ORGANICO ──────────────────────────────────────────────────
  'HMXT01':
    'Sensor digital de micro-ondas para medição contínua de umidade instalado rente ao fluxo do material, em fundos de misturadores, calhas, roscas transportadoras e dutos. Realiza 25 leituras por segundo com face cerâmica de alta resistência à abrasão e corpo em aço inox, fornecendo saídas digitais e analógicas para integração direta ao controle do processo. Indicado para grãos, rações, sementes, açúcar e demais materiais orgânicos.',
  'HMHT01':
    'Versão de alta temperatura do sensor de umidade por micro-ondas Hydro-Mix, projetada para operação contínua em processos quentes como saídas de secadores e resfriadores (até 120 °C no material). Mantém a medição em fluxo com 25 leituras por segundo, face cerâmica antiabrasiva e integração digital/analógica ao sistema de controle.',
  'HPXT02':
    'Sensor de umidade por micro-ondas para materiais orgânicos em descarga de silos, calhas e correias transportadoras. Mede continuamente no fluxo do material com face cerâmica resistente ao desgaste, permitindo controle de secadores, padronização de lotes e redução de perdas por umidade fora de especificação.',
  'HPBX01':
    'Sensor de umidade por micro-ondas concebido para instalação sobre correias transportadoras e leitos de material em movimento, medindo continuamente sem contato direto com partes móveis do transportador. Indicado para biomassa, grãos e materiais a granel em fluxos largos.',
  'HMXT-FS01':
    'Variante Food Safe do Hydro-Mix XT, com materiais de contato adequados ao processamento de alimentos. Medição contínua de umidade em misturadores e fluxos de produto com os mesmos recursos do XT: 25 leituras por segundo, face cerâmica antiabrasiva e saídas digitais/analógicas.',
  'HMXT-EX01':
    'Versão certificada para atmosferas explosivas (ATEX) do Hydro-Mix XT, para instalação em áreas classificadas com poeiras combustíveis — como moagens, secadores e silos de grãos. Mantém a medição contínua em fluxo com a robustez mecânica da linha XT.',
  'HMHT-EX01':
    'Versão de alta temperatura certificada para atmosferas explosivas (ATEX), combinando a operação em processos quentes (até 120 °C) com a aptidão para áreas classificadas. Indicada para saídas de secadores em plantas com poeiras combustíveis.',

  // ── Sistemas de duto / montagem ────────────────────────────────────────
  'DSVHT01':
    'Sistema de duto vertical para instalação do sensor Hydro-Mix HT em fluxo por gravidade, com seção de medição dimensionada para apresentar o material de forma consistente à face do sensor e porta de acesso para inspeção e limpeza.',
  'DSAHT01':
    'Sistema de duto em ângulo para instalação do sensor Hydro-Mix HT em transições de fluxo, garantindo apresentação uniforme do material à face cerâmica e acesso facilitado para manutenção.',
  'DSV02':
    'Sistema de duto vertical para o sensor Hydro-Mix XT em fluxo por gravidade, com seção de medição que uniformiza a passagem do material sobre a face do sensor e porta de inspeção.',
  'DSA02':
    'Sistema de duto em ângulo para o sensor Hydro-Mix XT, indicado para transições e desvios de fluxo, mantendo a leitura estável e o acesso simples para limpeza.',
  'HSXT01':
    'Estrutura (skid) de montagem para o sensor Hydro-Mix XT, facilitando o posicionamento correto, a fixação rígida e a manutenção do conjunto no ponto de medição.',

  // ── Sensores CONCRETO ──────────────────────────────────────────────────
  'HP04':
    'Sensor de umidade por micro-ondas consagrado para agregados de concreto, instalado na descarga de silos ou sobre correias. Face cerâmica de alta resistência à abrasão, 25 leituras por segundo e saídas digitais/analógicas para correção automática de água no traço — reduzindo variabilidade do concreto e consumo de cimento.',
  'HM08':
    'Sensor de umidade por micro-ondas para fundo de misturadores de concreto, medindo a umidade da mistura em tempo real durante o ciclo. Permite o controle preciso da adição de água, homogeneidade entre cargas e rastreabilidade da curva de mistura.',
  'ORB3':
    'Sensor de umidade rotativo para misturadores planetários e de turbina: o braço sensor acompanha o movimento da mistura, medindo no seio do material. Braço de medição substituível em campo, ideal para concreto e processos com pás varrendo o fundo do misturador.',
  'ORBA2C-700':
    'Braço sensor de reposição (700 mm) para o Hydro-Probe Orbiter — item de desgaste substituível em campo, restaurando a medição sem troca do corpo do sensor.',
  'ORBR3-A':
    'Conjunto de conectores rotativos para o Hydro-Probe Orbiter, responsável pela transmissão de sinal e alimentação entre a parte fixa e o braço em rotação.',
  '0900':
    'Kit de reposição com disco cerâmico e anel de proteção para sensores Hydro-Mix — itens de desgaste que restauram a face de medição à condição original, prolongando a vida útil do sensor.',
  '0930':
    'Anel de proteção de reposição com fixações para sensores Hydro-Mix, protegendo a borda da face cerâmica contra impacto e abrasão do fluxo de material.',

  // ── Interface / cabos / fixação ────────────────────────────────────────
  'SIM-02A':
    'Módulo de interface USB para configuração, diagnóstico e calibração dos sensores Hydronix a partir de um computador com o software Hydro-Com — ferramenta padrão de comissionamento e manutenção.',
  '0957A':
    'Cabo blindado de 4 m para interligação de sensores Hydronix (HM08/HP04), com conector dedicado e blindagem para ambientes industriais.',
  '0975A-25M':
    'Cabo blindado de 25 m para interligação de sensores Hydronix (HM08/HP04), permitindo a instalação do sensor distante do painel de controle com integridade de sinal.',
  '5015':
    'Placa de fixação para montagem do sensor Hydro-Mix XT no ponto de medição, garantindo posicionamento correto da face em relação ao fluxo.',
  '0025':
    'Suporte de montagem em caixa para o sensor Hydro-Probe, padronizando a fixação na descarga de silos e calhas.',
  '0026':
    'Luva de extensão de montagem para o sensor Hydro-Probe, permitindo ajustar a profundidade de inserção da face de medição no fluxo do material.',

  // ── Display / Hub ──────────────────────────────────────────────────────
  'HV05':
    'IHM industrial Hydro-View com tela sensível ao toque para visualização em tempo real, configuração e calibração de sensores Hydronix — leituras, tendências e ajuste de receitas direto no campo, sem necessidade de computador.',
  'HV05E-1187':
    'IHM Hydro-View com interface PROFIBUS integrada, unindo a visualização e calibração local dos sensores à comunicação direta com o CLP da planta.',
  'HV05-1188':
    'IHM Hydro-View com interface EtherNet/IP integrada, para integração nativa dos dados de umidade à rede industrial e ao sistema de controle.',
  'HV05-1189':
    'IHM Hydro-View com interface PROFINET integrada, conectando a medição de umidade diretamente à arquitetura de automação da planta.',
  'PHV05':
    'Painel elétrico montado e testado com IHM Hydro-View e infraestrutura de conexão dos sensores — solução pronta para instalar, com bornes, proteção e comunicação fieldbus conforme a variante.',
  'HH01':
    'Hub de conectividade Hydro-Hub para sensores Hydronix: concentra a alimentação e a comunicação dos sensores e disponibiliza os dados de umidade para o sistema de controle e para configuração remota.',
  'HH01-1187':
    'Hub Hydro-Hub com interface PROFIBUS, concentrando os sensores da planta e entregando as medições diretamente à rede do CLP.',
  'HH01-1188':
    'Hub Hydro-Hub com interface EtherNet/IP, integrando os sensores de umidade à rede industrial Ethernet da planta.',
  'HH01-1189':
    'Hub Hydro-Hub com interface PROFINET, para integração nativa dos sensores à automação PROFINET.',
  'PHH01':
    'Painel elétrico montado e testado com Hydro-Hub e infraestrutura de conexão dos sensores — pronto para instalação em campo, com comunicação fieldbus conforme a variante.'
};
