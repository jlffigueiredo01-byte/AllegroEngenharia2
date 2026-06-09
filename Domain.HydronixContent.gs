// ============================================================================
// Domain.HydronixContent.gs — ALLEGRO Business System
// Descrições de produtos Hydronix para geração de propostas técnicas
// Fonte: hydronix.com (pesquisado em 2026-06-09)
// ============================================================================

var HYDRONIX_PRODUCTS_CONTENT = {

  // --------------------------------------------------------------------------
  // SENSORES — CONCRETO
  // --------------------------------------------------------------------------

  'HP04': {
    name: 'Hydro-Probe',
    shortDesc: 'Sensor digital de umidade por micro-ondas para instalação em funis, calhas e correias transportadoras, medindo com precisão o teor de umidade em agregados e granéis.',
    fullDesc: [
      'O Hydro-Probe é o sensor de umidade digital por micro-ondas de referência da Hydronix, projetado para instalação em funis, calhas, caixas de mistura e correias transportadoras em plantas de concreto e processamento de agregados. Utilizando tecnologia digital avançada de processamento de sinais, o sensor entrega medições lineares e precisas do teor de umidade em areia, brita e outros materiais granulares, realizando 25 leituras por segundo para detecção contínua de variações no processo.',
      'Com corpo em aço inoxidável e faceplate cerâmico de alta resistência ao desgaste, o Hydro-Probe suporta o contato direto com materiais abrasivos sem necessidade de recalibração frequente. A compensação de temperatura integrada elimina desvios causados por variações ambientais, garantindo leituras estáveis ao longo de todo o turno de produção. O sensor opera com alimentação de 15–30V CC e pode ser interligado a outros sensores numa mesma fonte de energia.',
      'A integração com sistemas de controle é simplificada por duas saídas analógicas configuráveis e comunicação digital RS485 com suporte ao protocolo Modbus RTU. O software Hydro-Com permite configuração e ajuste remoto sem necessidade de intervenção mecânica, reduzindo paradas operacionais. O sensor é compatível com os displays Hydro-View e Hydro-Hub para monitoramento centralizado de múltiplos pontos de medição.'
    ].join('\n\n'),
    characteristics: [
      'Tecnologia de micro-ondas digital com processamento avançado de sinais',
      '25 leituras por segundo para controle contínuo do processo',
      'Precisão de 0,2% para agregados (0,1% em betoneiras)',
      'Compensação automática de temperatura integrada',
      'Corpo em aço inoxidável com faceplate cerâmico resistente ao desgaste',
      'Duas saídas analógicas configuráveis (4–20 mA / 0–10 V)',
      'Comunicação digital RS485 com protocolo Modbus RTU',
      'Alimentação 15–30V CC; múltiplos sensores em uma única fonte',
      'Distância máxima de cabo: 100 m (cabo trançado blindado 22 AWG)',
      'Configuração remota via software Hydro-Com, Hydro-View ou Hydro-Hub',
      'Proteção IP68 — resistente a imersão e ambientes industriais severos'
    ],
    applications: [
      'Fundo de betoneiras para dosagem em tempo real de água de correção',
      'Caixas e funis de agregados (areia e brita) em usinas de concreto',
      'Correias transportadoras de agregados',
      'Calhas de descarga em silos de granéis secos',
      'Sistemas de batelada e pesagem de agregados',
      'Controle de adição de água em processos de mistura'
    ]
  },

  'HM08': {
    name: 'Hydro-Mix',
    shortDesc: 'Sensor de umidade por micro-ondas para montagem rasante em betoneiras e transportadores, com design robusto para materiais abrasivos e medição a 25 leituras por segundo.',
    fullDesc: [
      'O Hydro-Mix é um sensor de umidade digital por micro-ondas desenvolvido especificamente para montagem rasante (flush mount) no piso de betoneiras planetárias, de eixo horizontal e em calhas transportadoras. Seu design robusto e resistente ao desgaste o torna ideal para contato direto com materiais altamente abrasivos como areia, brita e concreto úmido, entregando 25 leituras por segundo para controle preciso de consistência e teor de umidade durante o ciclo de mistura.',
      'A tecnologia de processamento digital de sinais garante medições lineares e estáveis, com precisão de 0,1% no ambiente de betoneira. A compensação de temperatura totalmente integrada elimina desvios causados pela expansão mecânica do sensor durante a operação, dispensando recalibrações por variações térmicas. O sensor opera com alimentação de 15–30V CC e suporta distâncias de cabo de até 100 m sem perda de sinal.',
      'Dois modos de saída analógica e comunicação RS485 Modbus simplificam a integração com CLPs, sistemas SCADA e controladores de batching. Múltiplos modos de medição permitem otimizar o desempenho para diferentes composições de traço. A configuração é realizada remotamente pelo software Hydro-Com, pelo display Hydro-View ou pelo concentrador Hydro-Hub, eliminando a necessidade de acesso físico ao sensor em operação.'
    ].join('\n\n'),
    characteristics: [
      'Design para montagem rasante (flush) em piso de betoneiras e calhas',
      'Corpo e faceplate cerâmico resistentes a materiais abrasivos',
      'Tecnologia digital de micro-ondas — medição linear e precisa',
      '25 leituras por segundo para controle em tempo real do ciclo de mistura',
      'Precisão de 0,1% em betoneiras, 0,2% em agregados',
      'Compensação de temperatura totalmente integrada',
      'Múltiplos modos de medição para diferentes composições de traço',
      'Duas saídas analógicas e RS485 Modbus para integração com CLP/SCADA',
      'Alimentação 15–30V CC; cabo blindado até 100 m',
      'Configuração remota via Hydro-Com, Hydro-View ou Hydro-Hub',
      'Saída de temperatura do material disponível'
    ],
    applications: [
      'Piso de betoneiras planetárias e de eixo horizontal em usinas de concreto',
      'Calhas e dutos de transporte de agregados',
      'Correias transportadoras de areia e brita',
      'Controle de adição de água de amassamento em dosadores automáticos',
      'Sistemas de batelada e pesagem com correção automática de umidade',
      'Processamento de agregados reciclados'
    ]
  },

  'ORB3': {
    name: 'Hydro-Probe Orbiter',
    shortDesc: 'Sensor de umidade por micro-ondas para betoneiras de cuba giratória (pan mixers), com braço rotativo que mantém o sensor em contato com o material durante toda a rotação da cuba.',
    fullDesc: [
      'O Hydro-Probe Orbiter é um sensor de umidade digital por micro-ondas desenvolvido especificamente para betoneiras de cuba giratória (pan mixers / ring mixers), onde a geometria da máquina impede a montagem rasante convencional. O sensor é montado em um braço de detecção rotativo que acompanha a rotação da cuba, garantindo contato constante com os agregados durante todo o ciclo de mistura e entregando 25 leituras por segundo para controle preciso da consistência do concreto.',
      'Construído para suportar o estresse mecânico repetitivo inerente à rotação contínua, o Orbiter combina um faceplate cerâmico de alta resistência ao desgaste com processamento digital avançado de sinais para minimizar ruídos mecânicos e garantir leituras estáveis. A compensação de temperatura integrada assegura que variações térmicas durante o processo não comprometam a precisão das medições. A precisão alcançada é de 0,1% na aplicação de betoneira.',
      'A integração com o sistema de controle da usina é realizada por duas saídas analógicas configuráveis e comunicação RS485 Modbus, tornando o Orbiter compatível com os principais controladores de batching do mercado. O sistema é complementado pelo braço de detecção ORBA2C-700 e pelos conectores rotativos ORBR3-A, que permitem a transmissão contínua de sinal elétrico sem enrolamento de cabos durante a rotação da cuba.'
    ].join('\n\n'),
    characteristics: [
      'Projetado exclusivamente para betoneiras de cuba giratória (pan mixers)',
      'Braço rotativo que acompanha a rotação da cuba durante a mistura',
      'Faceplate cerâmico de alta resistência ao desgaste abrasivo',
      'Processamento digital avançado de sinais para minimizar ruído mecânico',
      '25 leituras por segundo — medição contínua durante o ciclo de mistura',
      'Precisão de 0,1% no ambiente de betoneira',
      'Compensação de temperatura totalmente integrada',
      'Duas saídas analógicas e RS485 Modbus RTU',
      'Alimentação 15–30V CC; cabo blindado até 100 m',
      'Compatível com braço ORBA2C-700 e conectores rotativos ORBR3-A',
      'Configuração remota via Hydro-Com, Hydro-View ou Hydro-Hub'
    ],
    applications: [
      'Betoneiras de cuba giratória (pan mixers / ring mixers) em usinas de concreto',
      'Usinas de concreto de alto volume com misturas contínuas',
      'Produção de pré-fabricados e pré-moldados de concreto',
      'Controle de consistência e fator água/cimento em concretos especiais',
      'Integração com sistemas automáticos de dosagem e correção de água'
    ]
  },

  // --------------------------------------------------------------------------
  // SENSORES — ORGANICO / GRÃOS / BIOMASSA
  // --------------------------------------------------------------------------

  'HMXT01': {
    name: 'Hydro-Mix XT',
    shortDesc: 'Sensor compacto de umidade e temperatura por micro-ondas para montagem rasante em misturadores, transportadores e sistemas de dutagem, com saída de temperatura e operação em ambientes severos.',
    fullDesc: [
      'O Hydro-Mix XT é a versão de nova geração do sensor Hydro-Mix, com design compacto otimizado para montagem rasante em misturadores, transportadores e sistemas de dutagem (ducting). Além da medição de umidade por micro-ondas com tecnologia digital, o sensor incorpora medição de temperatura ambiente como saída adicional, tornando-o ideal para processos em que o controle térmico do material é igualmente relevante — como secagem de grãos, processamento de ração animal e condicionamento de biomassa.',
      'Com corpo em aço inoxidável e faceplate cerâmico resistente ao desgaste, o Hydro-Mix XT realiza 25 leituras por segundo e oferece precisão de 0,1% em misturadores e 0,2% em agregados. A compensação de temperatura totalmente integrada elimina desvios causados por variações mecânicas e térmicas durante a operação. Múltiplos modos de medição permitem otimizar o desempenho para diferentes materiais e condições de processo sem necessidade de recalibração física.',
      'Duas saídas analógicas configuráveis e comunicação digital RS485 com suporte ao protocolo Modbus RTU facilitam a integração com sistemas de automação e controle. O sensor é compatível com os displays Hydro-View e concentradores Hydro-Hub para monitoramento e configuração remota centralizada. Versões certificadas para ambientes com atmosfera explosiva (ATEX/Ex) e para aplicações food-safe estão disponíveis como variantes do mesmo modelo base.'
    ].join('\n\n'),
    characteristics: [
      'Design compacto para montagem rasante em misturadores, transportadores e dutagem',
      'Medição simultânea de umidade e temperatura do material',
      'Tecnologia de micro-ondas digital — medição linear e precisa',
      '25 leituras por segundo para controle contínuo do processo',
      'Precisão de 0,1% em misturadores, 0,2% em agregados, 0,5% em outros materiais',
      'Compensação de temperatura totalmente integrada',
      'Múltiplos modos de medição para diferentes materiais',
      'Duas saídas analógicas e RS485 Modbus para integração com CLP/SCADA',
      'Alimentação 15–30V CC; cabo blindado de até 100 m',
      'Configuração remota via Hydro-Com, Hydro-View ou Hydro-Hub',
      'Variantes disponíveis: ATEX (atmosfera explosiva) e Food Safe'
    ],
    applications: [
      'Misturadores e condicionadores de ração animal e alimentos',
      'Secadores de grãos, sementes e biomassa',
      'Transportadores e correias de produtos orgânicos',
      'Sistemas de dutagem (ducting) para grãos e granéis',
      'Controle de umidade em processamento de madeira e pellets de biomassa',
      'Silos e armazéns com monitoramento contínuo de umidade',
      'Usinas de concreto e processamento de agregados'
    ]
  },

  'HMHT01': {
    name: 'Hydro-Mix HT',
    shortDesc: 'Sensor de umidade e temperatura por micro-ondas de alta temperatura (até 120 °C) para instalação em secadores, misturadores e transportadores em processos industriais com elevado calor.',
    fullDesc: [
      'O Hydro-Mix HT é um sensor digital de umidade por micro-ondas projetado para operar em ambientes de alta temperatura, suportando temperaturas de material de até 120 °C. Ideal para instalação diretamente em secadores rotativos, misturadores industriais aquecidos, dutos de condicionamento e transportadores de processos térmicos, o sensor entrega medições precisas e lineares de umidade mesmo nas condições mais exigentes de temperatura e abrasão, realizando 25 leituras por segundo.',
      'A tecnologia de processamento digital de sinais, combinada com compensação de temperatura totalmente integrada, garante que as variações térmicas severas do processo não comprometam a precisão das medições. O sensor permite ajuste fino por meio de múltiplos modos de medição, adequando sua resposta a diferentes materiais — de grãos e ração animal a biomassa e cascas de arroz. A precisão alcançada é de 0,2% para materiais granulares e 0,5% para outros materiais.',
      'A integração com sistemas de controle é realizada por duas saídas analógicas configuráveis e comunicação digital RS485 com protocolo Modbus RTU, compatível com os principais controladores industriais. Versão certificada para atmosfera explosiva (ATEX/Ex) está disponível. O sensor é gerenciado remotamente pelo software Hydro-Com ou pelos sistemas Hydro-View e Hydro-Hub, permitindo ajustes de calibração e configuração sem necessidade de parar o processo.'
    ].join('\n\n'),
    characteristics: [
      'Operação em altas temperaturas — material de até 120 °C',
      'Tecnologia de micro-ondas digital com processamento avançado de sinais',
      '25 leituras por segundo para monitoramento contínuo',
      'Compensação de temperatura totalmente integrada',
      'Precisão de 0,2% para granulares, 0,5% para outros materiais',
      'Múltiplos modos de medição para diferentes materiais e processos',
      'Duas saídas analógicas e RS485 Modbus RTU',
      'Alimentação 15–30V CC; cabo blindado de até 100 m',
      'Montagem rasante (flush) em piso de secadores, misturadores e dutos',
      'Versão ATEX disponível (HMHT-EX01) para atmosferas explosivas',
      'Configuração remota via Hydro-Com, Hydro-View ou Hydro-Hub'
    ],
    applications: [
      'Secadores rotativos de grãos, sementes, café e biomassa',
      'Misturadores industriais aquecidos de ração animal e aditivos',
      'Condicionadores de vapor em processamento de pellets',
      'Transportadores e dutos de processos com alta temperatura',
      'Secagem e processamento de cascas de arroz, bagaço e resíduos agroindustriais',
      'Controle de umidade em saída de secadores industriais',
      'Processos de bienergia com material em alta temperatura'
    ]
  },

  'HPXT02': {
    name: 'Hydro-Probe XT',
    shortDesc: 'Sensor digital de umidade e temperatura por micro-ondas para instalação em funis, calhas e correias transportadoras, com design robusto para materiais abrasivos e saída de temperatura integrada.',
    fullDesc: [
      'O Hydro-Probe XT é um sensor digital de umidade e temperatura por micro-ondas projetado para instalação em funis de silos, calhas de descarga, caixas de passagem e correias transportadoras. Com design robusto e resistente ao desgaste abrasivo, o sensor entrega 25 leituras por segundo para monitoramento contínuo de umidade e temperatura em materiais granulares como grãos, sementes, ração animal, biomassa e agregados.',
      'A tecnologia de processamento digital avançado de sinais garante medições lineares e precisas, com precisão de 0,2% para materiais granulares. A compensação automática de temperatura integrada elimina desvios causados por variações mecânicas e térmicas, mantendo a estabilidade das leituras ao longo de toda a jornada de operação. Múltiplos modos de medição permitem otimizar a resposta do sensor para diferentes tipos de material sem necessidade de recalibração física.',
      'Duas saídas analógicas configuráveis e comunicação digital RS485 com protocolo Modbus RTU tornam a integração com CLPs e sistemas SCADA simples e direta. O sensor opera com alimentação de 15–30V CC, com distância máxima de cabo de 100 m. Configuração e ajuste remoto são realizados pelo software Hydro-Com ou pelos sistemas Hydro-View e Hydro-Hub, evitando paradas para manutenção preventiva de calibração.'
    ].join('\n\n'),
    characteristics: [
      'Projetado para instalação em funis, calhas e correias transportadoras',
      'Design robusto para materiais abrasivos',
      'Medição simultânea de umidade e temperatura do material',
      '25 leituras por segundo — detecção contínua de variações',
      'Precisão de 0,2% para materiais granulares, 0,5% para outros',
      'Compensação automática de temperatura integrada',
      'Múltiplos modos de medição para diferentes materiais',
      'Duas saídas analógicas e RS485 Modbus RTU',
      'Alimentação 15–30V CC; cabo blindado de até 100 m',
      'Configuração remota via Hydro-Com, Hydro-View ou Hydro-Hub',
      'Proteção IP68 para ambientes industriais severos'
    ],
    applications: [
      'Funis de descarga de silos de grãos, sementes e granéis',
      'Calhas e caixas de passagem em processos de beneficiamento',
      'Correias transportadoras de grãos, café, milho, soja e semelhantes',
      'Sistemas de secagem e condicionamento de ração animal',
      'Controle de umidade em moinhos e processos de moagem',
      'Embalagem e armazenamento com controle de qualidade por umidade',
      'Processamento de biomassa, pellets e materiais orgânicos',
      'Usinas de concreto e processamento de agregados'
    ]
  },

  // --------------------------------------------------------------------------
  // SISTEMAS DE DUTAGEM (DUCTING)
  // --------------------------------------------------------------------------

  'DSV02': {
    name: 'Ducting System V (Hydro-Mix XT)',
    shortDesc: 'Sistema de instalação em "V" para o sensor Hydro-Mix XT em linhas de transporte por dutos ou calhas, garantindo contato ideal do sensor com o fluxo de material granular.',
    fullDesc: [
      'O Ducting System V (DSV02) é um sistema mecânico de montagem projetado para instalar o sensor Hydro-Mix XT em calhas ou dutos de transporte de materiais granulares. A geometria em "V" do sistema concentra o fluxo do material diretamente sobre a face ativa do sensor, maximizando o contato e garantindo medições representativas da umidade do material em transporte. É indicado para linhas onde o material escoa por gravidade ou transporte pneumático.',
      'Fabricado em aço com acabamento adequado para ambientes industriais, o Ducting System V oferece instalação prática e robusta, integrando o sensor ao duto existente sem necessidade de grandes modificações estruturais. O sistema é fornecido já preparado para receber o Hydro-Mix XT, reduzindo o tempo de instalação e comissionamento.',
      'A combinação do DSV02 com o sensor Hydro-Mix XT forma uma solução completa de medição contínua de umidade em linha para aplicações de grãos, sementes, ração animal e biomassa, integrando-se a sistemas de controle via as saídas analógicas e digital do sensor.'
    ].join('\n\n'),
    characteristics: [
      'Geometria em "V" para concentração do material sobre o sensor',
      'Projetado exclusivamente para o Hydro-Mix XT',
      'Instalação em calhas e dutos de transporte por gravidade',
      'Fabricação em aço para uso em ambientes industriais',
      'Minimiza modificações na linha de transporte existente',
      'Reduz tempo de instalação e comissionamento',
      'Fornecido preparado para receber o sensor HMXT01'
    ],
    applications: [
      'Linhas de transporte de grãos, sementes e granéis por gravidade',
      'Dutos de descarga de silos e armazéns',
      'Sistemas de processamento de ração animal e alimentos',
      'Transporte de biomassa e materiais orgânicos',
      'Linhas de condicionamento e secagem com controle de umidade em tempo real'
    ]
  },

  'DSA02': {
    name: 'Ducting System A (Hydro-Mix XT)',
    shortDesc: 'Sistema de instalação em "A" para o sensor Hydro-Mix XT em calhas e dutos, com geometria alternativa para linhas de transporte onde a instalação em "V" não é aplicável.',
    fullDesc: [
      'O Ducting System A (DSA02) é um sistema mecânico de montagem que posiciona o sensor Hydro-Mix XT em calhas ou dutos de transporte de materiais granulares, com geometria em "A" — uma alternativa ao DSV02 para instalações onde a configuração em "V" não é viável devido ao layout da linha ou ao perfil do duto. O sistema garante o posicionamento correto e o contato adequado do sensor com o fluxo de material para medições representativas de umidade.',
      'Assim como o DSV02, o DSA02 é fabricado em aço para suportar as condições de ambientes industriais e é fornecido já preparado para integrar o sensor Hydro-Mix XT, simplificando a instalação. A escolha entre o sistema "A" e o sistema "V" é definida em função das características físicas da linha de transporte existente.',
      'A combinação do DSA02 com o Hydro-Mix XT entrega medição contínua e em tempo real da umidade de materiais em fluxo, com integração direta a sistemas de controle de processo via saídas analógicas e comunicação RS485 Modbus do sensor.'
    ].join('\n\n'),
    characteristics: [
      'Geometria em "A" — alternativa ao Ducting System V para layouts específicos',
      'Projetado exclusivamente para o Hydro-Mix XT',
      'Instalação em calhas e dutos de transporte industrial',
      'Fabricação em aço para ambientes industriais',
      'Posicionamento correto do sensor para medições representativas',
      'Fornecido preparado para receber o sensor HMXT01',
      'Selecionado conforme o layout e perfil do duto existente'
    ],
    applications: [
      'Linhas de transporte de grãos, sementes e granéis',
      'Dutos com geometria incompatível com o sistema "V"',
      'Processamento de ração animal, alimentos e granéis orgânicos',
      'Sistemas de condicionamento e secagem com controle de umidade em tempo real',
      'Instalações com espaço reduzido para montagem'
    ]
  },

  // --------------------------------------------------------------------------
  // DISPLAYS E CONCENTRADORES
  // --------------------------------------------------------------------------

  'HV05': {
    name: 'Hydro-View',
    shortDesc: 'Display touchscreen de 10,1" para monitoramento e configuração centralizada de até 16 sensores Hydronix, com interface web e suporte a protocolos industriais Profibus, Profinet e EtherNet/IP.',
    fullDesc: [
      'O Hydro-View é um sistema de display touchscreen de 10,1" desenvolvido para monitoramento em tempo real e gerenciamento centralizado de redes de sensores Hydronix em ambientes industriais. A unidade conecta e gerencia simultaneamente até 16 sensores, exibindo ao vivo as medições de até 6 sensores na tela principal, com acesso completo a históricos, alarmes e configuração de calibração remota sem necessidade de intervenção física nos sensores.',
      'Com porta Ethernet integrada, o Hydro-View oferece interface via navegador web e Web API, possibilitando acesso remoto às medições e configurações a partir de qualquer dispositivo na rede local da planta. Suporta até 256 calibrações por sensor, permitindo múltiplos materiais e receitas sem perda de dados de calibração anteriores. A unidade pode ser instalada em painéis de operador existentes ou em caixas de aço fornecidas pela Hydronix.',
      'Para integração com sistemas SCADA e redes industriais de planta, o Hydro-View é compatível com módulos de expansão para Profibus, Profinet e EtherNet/IP, tornando-o adequado para plantas com infraestrutura de automação já estabelecida. A versão PHV05 inclui painel de aço completo com todas as interfaces de campo e industriais já instaladas, reduzindo o tempo de instalação em campo.'
    ].join('\n\n'),
    characteristics: [
      'Display touchscreen de 10,1" para operação em ambiente industrial',
      'Gerencia até 16 sensores Hydronix simultaneamente',
      'Visualização ao vivo de até 6 sensores na tela principal',
      'Calibração e configuração remota de todos os sensores conectados',
      'Suporte a 256 calibrações por sensor (múltiplos materiais e receitas)',
      'Porta Ethernet com interface via navegador web e Web API',
      'Comunicação RS485 Modbus com os sensores',
      'Módulos opcionais: Profibus (HV05E-1187), EtherNet/IP (HV05-1188), Profinet (HV05-1189)',
      'Instalação em painel do operador ou em caixa de aço Hydronix',
      'Versão PHV05 com painel completo e todas as interfaces inclusas',
      'Alimentação 15–30V CC'
    ],
    applications: [
      'Central de monitoramento de umidade em usinas de concreto',
      'Sala de controle de cooperativas de armazenamento de grãos',
      'Supervisão de processos de secagem e condicionamento de ração animal',
      'Integração com sistemas SCADA em plantas de processamento industrial',
      'Monitoramento de múltiplos pontos de medição em linhas de produção',
      'Gestão de calibrações para diferentes receitas e materiais em batelada'
    ]
  },

  'HH01': {
    name: 'Hydro-Hub',
    shortDesc: 'Concentrador de rede para até 16 sensores Hydronix com interface web Ethernet, montagem em trilho DIN e compatibilidade com protocolos industriais Profibus, EtherNet/IP e Profinet.',
    fullDesc: [
      'O Hydro-Hub é um concentrador de rede compacto que conecta até 16 sensores Hydronix a sistemas de automação e redes de planta simultaneamente. Montado em trilho DIN conforme IEC/EN 60715, é indicado para instalações em painéis elétricos e armários de automação onde espaço é limitado e não há necessidade de um display local dedicado. Assim como o Hydro-View, o Hydro-Hub oferece interface via navegador web com Ethernet integrada e Web API para acesso remoto às medições e configurações.',
      'O Hydro-Hub suporta até 256 calibrações por sensor conectado, possibilitando múltiplos materiais e receitas sem necessidade de reconfiguração manual. Exibe ao vivo as medições de até 6 sensores e permite calibração e configuração remota de todos os sensores da rede a partir de qualquer dispositivo com acesso à rede local. A comunicação com os sensores é feita via RS485 Modbus.',
      'Para integração com sistemas de automação industrial, estão disponíveis módulos de expansão para Profibus (HH01-1187), EtherNet/IP (HH01-1188) e Profinet (HH01-1189), tornando o Hydro-Hub compatível com as principais arquiteturas de controle de processo. A versão PHH01 inclui painel de aço completo com todas as interfaces já integradas, pronto para instalação em campo.'
    ].join('\n\n'),
    characteristics: [
      'Concentrador compacto para até 16 sensores Hydronix',
      'Montagem em trilho DIN (IEC/EN 60715) — ideal para painéis elétricos',
      'Visualização ao vivo de até 6 sensores',
      'Calibração e configuração remota de todos os sensores conectados',
      'Suporte a 256 calibrações por sensor',
      'Porta Ethernet com interface via navegador web e Web API',
      'Comunicação RS485 Modbus com os sensores',
      'Módulos opcionais: Profibus (HH01-1187), EtherNet/IP (HH01-1188), Profinet (HH01-1189)',
      'Versão PHH01 com painel de aço completo e todas as interfaces inclusas',
      'Alimentação 15–30V CC',
      'Sem display local — acesso via rede (adequado para sala de controle remota)'
    ],
    applications: [
      'Painéis de automação em usinas de concreto e cooperativas de grãos',
      'Integração de múltiplos sensores em sistemas SCADA via Profibus ou Profinet',
      'Instalações onde espaço em painel é restrito (sem necessidade de display local)',
      'Redes de sensores em plantas de processamento de alimentos e ração animal',
      'Sistemas de batelada com múltiplos pontos de medição de umidade',
      'Monitoramento remoto de umidade em silos e armazéns via rede corporativa'
    ]
  }

};

// ============================================================================
// API functions
// ============================================================================

/**
 * Api_getHydronixContent
 * Retorna o conteúdo descritivo de um produto Hydronix pelo código.
 *
 * @param {string} productCode — código do produto (ex: 'HM08', 'HMXT01')
 * @returns {{ ok: boolean, data?: object, error?: string }}
 */
function Api_getHydronixContent(productCode) {
  try {
    requireAuth();
    if (!productCode) return { ok: false, error: 'productCode é obrigatório' };
    var content = HYDRONIX_PRODUCTS_CONTENT[String(productCode).toUpperCase()] ||
                  HYDRONIX_PRODUCTS_CONTENT[productCode];
    if (!content) return { ok: false, error: 'Produto não encontrado: ' + productCode };
    return { ok: true, data: content };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Api_getAllHydronixContent
 * Retorna o mapa completo de todos os produtos Hydronix com seus conteúdos.
 *
 * @returns {{ ok: boolean, data?: object, error?: string }}
 */
function Api_getAllHydronixContent() {
  try {
    requireAuth();
    return { ok: true, data: HYDRONIX_PRODUCTS_CONTENT };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Api_getHydronixProductCodes
 * Retorna a lista de todos os códigos de produto disponíveis neste módulo.
 *
 * @returns {{ ok: boolean, data?: string[], error?: string }}
 */
function Api_getHydronixProductCodes() {
  try {
    requireAuth();
    return { ok: true, data: Object.keys(HYDRONIX_PRODUCTS_CONTENT) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
