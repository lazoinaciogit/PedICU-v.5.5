/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { 
  Activity, 
  Bed, 
  ClipboardList, 
  FileText, 
  History, 
  Moon, 
  Plus, 
  Sun, 
  Trash2, 
  Copy, 
  Save, 
  Stethoscope, 
  Thermometer, 
  Wind, 
  Droplets, 
  Zap, 
  AlertTriangle, 
  CheckCircle2,
  ChevronRight,
  User,
  RotateCcw,
  TrendingUp,
  Brain,
  Heart,
  Scale,
  ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  Legend
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- CLINICAL UTILS ---

const calcRelativeVt = (vt: number, peso: number) => (vt / peso).toFixed(1);
const calcDrivingPressure = (plateau: number, peep: number) => plateau - peep;
const calcOI = (map: number, fio2: number, pao2: number) => ((map * fio2) / pao2).toFixed(1);
const calcFluidOverload = (bhAcumulado: number, pesoAdmissao: number) => ((bhAcumulado / 1000) / pesoAdmissao * 100).toFixed(1);

const getAgeLimits = (ageMonths: number) => {
  if (ageMonths < 1) return { fc: [100, 180], paS: [60, 90] };
  if (ageMonths < 12) return { fc: [100, 160], paS: [70, 100] };
  if (ageMonths < 36) return { fc: [90, 150], paS: [80, 110] };
  if (ageMonths < 72) return { fc: [80, 140], paS: [80, 110] };
  if (ageMonths < 144) return { fc: [70, 120], paS: [90, 120] };
  return { fc: [60, 100], paS: [100, 130] };
};

const checkAlerts = (p: Patient) => {
  const alerts = [];
  const limits = getAgeLimits(p.idadeMeses);
  
  // Hemodinâmica
  if (p.hemodynamics.tec > 2) alerts.push({ type: 'Hemo', msg: 'TEC > 2s' });
  if (p.hemodynamics.lactato > 2) alerts.push({ type: 'Hemo', msg: 'Lactato > 2.0' });
  if (p.monitor.fc < limits.fc[0] || p.monitor.fc > limits.fc[1]) alerts.push({ type: 'Hemo', msg: `FC fora (Alvo: ${limits.fc[0]}-${limits.fc[1]})` });
  if (p.monitor.paS < limits.paS[0]) alerts.push({ type: 'Hemo', msg: `Hipotensão (PAS < ${limits.paS[0]})` });
  
  // Respiratório
  const dp = calcDrivingPressure(p.respiratory.plateau, p.respiratory.peep);
  if (dp > 15) alerts.push({ type: 'Resp', msg: 'ΔP > 15' });
  
  const oi = parseFloat(calcOI(p.respiratory.map_vent, p.respiratory.fio2, p.respiratory.pao2));
  if (oi > 4) alerts.push({ type: 'Resp', msg: 'IO > 4' });
  
  // Renal
  const renalLimit = p.idadeMeses >= 144 ? 0.5 : 1.0;
  if (p.renal.diurese < renalLimit) alerts.push({ type: 'Renal', msg: `Diurese < ${renalLimit} ml/kg/h` });
  
  return alerts;
};

// --- CONSTANTS ---

const DIAGNOSTIC_CATEGORIES = {
  "1": { name: "Sistema Respiratório (35% a 50%)", color: "bg-red-100 text-red-800", diags: ["Insuficiência Respiratória Aguda", "Bronquiolite Viral Aguda", "Asma Aguda Grave", "Síndrome do Desconforto Respiratório Agudo (SDRA)"] },
  "2": { name: "Sistema Infeccioso / Sepse (15% a 20%)", color: "bg-orange-100 text-orange-800", diags: ["Sepse e Choque Séptico", "Dengue Grave", "Infecções no Paciente Imunocomprometido", "Infecções Fúngicas Graves"] },
  "3": { name: "Sistema Neurológico / Neurocirúrgico (10% a 15%)", color: "bg-blue-100 text-blue-800", diags: ["Trauma de Crânio (TCE)", "Estado de Mal Epiléptico", "Meningites Bacterianas/Virais", "Encefalopatias"] },
  "4": { name: "Sistema Cardiovascular (10% a 20%)", color: "bg-pink-100 text-pink-800", diags: ["Choque (hipovolêmico, distributivo, cardiogênico)", "Disfunção Miocárdica Aguda", "Pós-Operatório em Cirurgia Cardíaca", "Arritmias Cardíacas"] },
  "5": { name: "Onco-Hematologia e Imunologia (5% a 10%)", color: "bg-purple-100 text-purple-800", diags: ["Urgências Oncológicas e Hematológicas", "Trombose Venosa Profunda"] },
  "6": { name: "Trauma e Causas Externas (5% a 10%)", color: "bg-yellow-100 text-yellow-800", diags: ["Trauma / Politrauma", "Grande Queimado", "Afogamento", "Intoxicação Exógena", "Trauma Abusivo (Maus-tratos)"] },
  "7": { name: "Gastrointestinal e Cirurgia Pediátrica (5% a 8%)", color: "bg-green-100 text-green-800", diags: ["Insuficiência Hepática Aguda", "Hemorragia Digestiva", "Urgências Cirúrgicas Abdominais", "Enterocolite Necrosante"] },
  "8": { name: "Renal, Metabólico e Endócrino (< 5%)", color: "bg-gray-100 text-gray-800", diags: ["Cetoacidose Diabética", "Lesão Renal Aguda", "Distúrbios Hidroeletrolíticos e da Glicose", "Descompensação Aguda de Erros Inatos do Metabolismo"] }
};

const DAV_CATEGORIES = [
  {
    id: "eletrolitos",
    name: "Eletrólitos Concentrados Injetáveis",
    description: "São historicamente responsáveis por eventos sentinelas gravíssimos quando injetados de forma inadvertida (frequentemente confundidos com diluentes como água destilada).",
    examples: "Cloreto de Potássio (KCl injetável), Fosfato de Potássio, Cloreto de Sódio hiperosmolar (acima de 0,9%, como NaCl 20% ou salina hipertônica a 3%) e Sulfato de Magnésio injetável."
  },
  {
    id: "opioides",
    name: "Opióides e Narcóticos (IV, transdérmicos e VO)",
    description: "Apresentam alto risco de depressão respiratória progressiva, instabilidade hemodinâmica e tolerância/dependência.",
    examples: "Fentanil, Morfina, Remifentanil, Metadona."
  },
  {
    id: "sedativos",
    name: "Sedativos e Anestésicos (Gerais, Inalatórios e IV)",
    description: "Risco de depressão do SNC e respiratória.",
    examples: "Propofol, Cetamina, Midazolam IV, Dexmedetomidina, Tiopental."
  },
  {
    id: "adrenergicos",
    name: "Agonistas e Antagonistas Adrenérgicos IV (Drogas Vasoativas)",
    description: "Erros de titulação, preparo em concentrações erradas ou extravasamento podem causar necrose tecidual, choque refratário ou arritmias fatais.",
    examples: "Epinefrina, Norepinefrina, Dopamina, Esmolol."
  },
  {
    id: "inotrópicos",
    name: "Agentes Inotrópicos IV",
    description: "Aumentam a contratilidade miocárdica.",
    examples: "Milrinona, Dobutamina."
  },
  {
    id: "bloqueadores",
    name: "Bloqueadores Neuromusculares",
    description: "O uso inadvertido em pacientes sem uma via aérea definitiva previamente assegurada resulta em parada respiratória iminente e asfixia.",
    examples: "Rocurônio, Vecurônio, Succinilcolina, Cisatracúrio."
  },
  {
    id: "insulinas",
    name: "Insulinas (todas as apresentações)",
    description: "Tanto em infusão contínua quanto subcutânea. O erro de dosagem gera hipoglicemia refratária e consequente neurotoxicidade/dano neurológico.",
    examples: "Insulina Regular, NPH, Análogos."
  },
  {
    id: "anticoagulantes",
    name: "Anticoagulantes e Trombolíticos",
    description: "Elevado risco de hemorragia grave, intracraniana ou sistêmica.",
    examples: "Heparina não fracionada, Enoxaparina, Varfarina, Alteplase."
  },
  {
    id: "quimioterapicos",
    name: "Quimioterápicos Antineoplásicos",
    description: "Parenterais e orais, devido à alta toxicidade celular direta.",
    examples: "Vincristina, Ciclofosfamida, etc."
  },
  {
    id: "npt",
    name: "Soluções de Nutrição Parenteral Total (NPT)",
    description: "Devido à complexidade da manipulação e risco de distúrbios metabólicos agudos.",
    examples: "NPT Adulto/Pediátrica."
  }
];

const INFUSIONS = {
  // Adrenérgicos
  nora: { nome: "Noradrenalina", unidadeDose: "mcg/kg/min", formula: "4 ampolas (16mg) em 234mL SG5% (Total 250mL)", concMgMl: 0.064, dav: true, category: "adrenergicos" },
  adrenalina: { nome: "Adrenalina", unidadeDose: "mcg/kg/min", formula: "5 ampolas (5mg) em 245mL SG5% (Total 250mL)", concMgMl: 0.02, dav: true, category: "adrenergicos" },
  dopamina: { nome: "Dopamina", unidadeDose: "mcg/kg/min", formula: "5 ampolas (250mg) em 200mL SG5% (Total 250mL)", concMgMl: 1.0, dav: true, category: "adrenergicos" },
  esmolol: { nome: "Esmolol", unidadeDose: "mcg/kg/min", formula: "2 ampolas (200mg) em 80mL SF0.9%", concMgMl: 2.0, dav: true, category: "adrenergicos" },
  
  // Inotrópicos
  milrinona: { nome: "Milrinona", unidadeDose: "mcg/kg/min", formula: "1 ampola (20mg/10mL) em 40mL SG5% (Total 50mL)", concMgMl: 0.4, dav: true, category: "inotrópicos" },
  dobutamina: { nome: "Dobutamina", unidadeDose: "mcg/kg/min", formula: "1 ampola (250mg) em 230mL SG5% (Total 250mL)", concMgMl: 1.0, dav: true, category: "inotrópicos" },
  
  // Opióides
  fentanil: { nome: "Fentanil", unidadeDose: "mcg/kg/h", formula: "Puro: Ampola 50mcg/mL", concMgMl: 0.05, dav: true, category: "opioides" },
  morfina: { nome: "Morfina", unidadeDose: "mg/kg/h", formula: "1 ampola (10mg) em 9mL SF0.9% (1mg/mL)", concMgMl: 1.0, dav: true, category: "opioides" },
  remifentanil: { nome: "Remifentanil", unidadeDose: "mcg/kg/min", formula: "2mg em 40mL SF0.9% (50mcg/mL)", concMgMl: 0.05, dav: true, category: "opioides" },
  
  // Sedativos
  midazolam: { nome: "Midazolam", unidadeDose: "mg/kg/h", formula: "3 ampolas (45mg) em 45mL SG5%", concMgMl: 1.0, dav: true, category: "sedativos" },
  propofol: { nome: "Propofol 1%", unidadeDose: "mcg/kg/min", formula: "Puro: 10mg/mL", concMgMl: 10.0, dav: true, category: "sedativos" },
  cetamina: { nome: "Cetamina", unidadeDose: "mg/kg/h", formula: "1 ampola (500mg) em 40mL SF0.9% (10mg/mL)", concMgMl: 10.0, dav: true, category: "sedativos" },
  dexmedetomidina: { nome: "Dexmedetomidina", unidadeDose: "mcg/kg/h", formula: "1 ampola (200mcg/2mL) em 48mL SF0.9% (Total 50mL)", concMgMl: 0.004, dav: true, category: "sedativos" },
  tiopental: { nome: "Tiopental", unidadeDose: "mg/kg/h", formula: "0.5g em 20mL SF0.9% (25mg/mL)", concMgMl: 25.0, dav: true, category: "sedativos" },

  // Bloqueadores NM
  rocuronio: { nome: "Rocurônio", unidadeDose: "mg/kg/h", formula: "Puro: 10mg/mL", concMgMl: 10.0, dav: true, category: "bloqueadores" },
  vecuronio: { nome: "Vecurônio", unidadeDose: "mg/kg/h", formula: "1 ampola (10mg) em 10mL SF0.9% (1mg/mL)", concMgMl: 1.0, dav: true, category: "bloqueadores" },
  succinilcolina: { nome: "Succinilcolina", unidadeDose: "mg/kg/h", formula: "1 ampola (100mg) em 10mL SF0.9% (10mg/mL)", concMgMl: 10.0, dav: true, category: "bloqueadores" },
  cisatracurio: { nome: "Cisatracúrio", unidadeDose: "mcg/kg/min", formula: "Puro: 2mg/mL", concMgMl: 2.0, dav: true, category: "bloqueadores" },

  // Insulinas
  insulina_r: { nome: "Insulina Regular IV", unidadeDose: "U/kg/h", formula: "50 UI em 50mL SF0.9% (1 UI/mL)", concMgMl: 1.0, dav: true, category: "insulinas" },

  // Eletrólitos
  kcl_10: { nome: "KCl 10% (Injetável)", unidadeDose: "mEq/kg/h", formula: "Concentrado - CUIDADO", concMgMl: 1.34, dav: true, category: "eletrolitos" },
  fosfato_k: { nome: "Fosfato de Potássio", unidadeDose: "mEq/kg/h", formula: "Concentrado - CUIDADO", concMgMl: 2.0, dav: true, category: "eletrolitos" },
  nacl_3: { nome: "Salina Hipertônica 3%", unidadeDose: "mL/kg/h", formula: "Pronta para uso", concMgMl: 1.0, dav: true, category: "eletrolitos" },
  nacl_20: { nome: "NaCl 20% (Injetável)", unidadeDose: "mEq/kg/h", formula: "Concentrado - CUIDADO", concMgMl: 3.4, dav: true, category: "eletrolitos" },
  mgso4: { nome: "Sulfato de Magnésio 50%", unidadeDose: "mg/kg/h", formula: "Concentrado - CUIDADO", concMgMl: 500, dav: true, category: "eletrolitos" },

  // Anticoagulantes
  heparina: { nome: "Heparina Sódica IV", unidadeDose: "U/kg/h", formula: "25.000 UI em 250mL SF0.9% (100 UI/mL)", concMgMl: 100, dav: true, category: "anticoagulantes" },
  alteplase: { nome: "Alteplase (rt-PA)", unidadeDose: "mg/kg/h", formula: "1mg/mL após reconstituição", concMgMl: 1.0, dav: true, category: "anticoagulantes" }
};

const MODULE_COLORS: Record<string, { border: string; active: string; text: string; bg: string }> = {
  "Módulo 1: Neurointensivismo e Neuroproteção": { border: "border-blue-500/30", active: "bg-blue-600", text: "text-blue-400", bg: "bg-blue-500/5" },
  "Módulo 3: Hemodinâmica e Cardiovascular": { border: "border-pink-500/30", active: "bg-pink-600", text: "text-pink-400", bg: "bg-pink-500/5" },
  "Módulo 2: Suporte Respiratório": { border: "border-red-500/30", active: "bg-red-600", text: "text-red-400", bg: "bg-red-500/5" },
  "Módulo 6: Gastroenterologia e Nutrição": { border: "border-green-500/30", active: "bg-green-600", text: "text-green-400", bg: "bg-green-500/5" },
  "Módulo 5: Nefrologia, Metabolismo e Endocrinologia": { border: "border-cyan-500/30", active: "bg-cyan-600", text: "text-cyan-400", bg: "bg-cyan-500/5" },
  "Módulo 7: Onco-Hematologia": { border: "border-purple-500/30", active: "bg-purple-600", text: "text-purple-400", bg: "bg-purple-500/5" },
  "Módulo 4: Infectologia e Imunologia": { border: "border-orange-500/30", active: "bg-orange-600", text: "text-orange-400", bg: "bg-orange-500/5" },
  "Módulo 8: Trauma e Emergências": { border: "border-yellow-500/30", active: "bg-yellow-600", text: "text-yellow-400", bg: "bg-yellow-500/5" },
  "Módulo 9: Gestão, Ética e Transição Cognitiva": { border: "border-slate-500/30", active: "bg-slate-600", text: "text-slate-400", bg: "bg-slate-500/5" }
};

const PROBLEMS_BY_SYSTEM = {
  "Módulo 1: Neurointensivismo e Neuroproteção": [
    { label: "Manejo da HIC", action: "Manter cabeceira elevada a 30° em linha média (facilitar drenagem venosa). Garantir Pressão de Perfusão Cerebral (PPC) alvo para a idade (PAM - PIC). Evitar hipotensão e hipóxia; usar salina hipertônica 3% (alvo de Na: 145-155 mEq/L) sob demanda ou profilaxia em lesão expansiva." },
    { label: "Status Epilepticus", action: "Escalonamento rigoroso: Benzodiazepínico (min. 5) ➔ Fenitoína/Levetiracetam (min. 15) ➔ Midazolam ou Tiopental contínuo (refratário). Acionar Eletroencefalograma Contínuo (cEEG) se rebaixamento persistir após crise." },
    { label: "Encefalopatia Hipóxico-Isquêmica", action: "Controle direcionado de temperatura (evitar qualquer pico febril > 37,5°C). Manter normoxemia (SpO2 94-98%) e normocapnia estritas para evitar vasoconstrição ou hiperemia cerebral." },
    { label: "Avaliação de Coma", action: "Avaliação diária com escala de Glasgow ou FOUR. Descartar precocemente causas tóxico-metabólicas (amônia, glicemia capilar 1/1h, eletrólitos) antes de atribuir rebaixamento à sedação." },
    { label: "Morte Encefálica", action: "Notificação compulsória à OPO ao abrir protocolo. Manter suporte hemodinâmico agressivo (vasopressores, reposição hormonal com levotiroxina/vasopressina) para viabilidade dos órgãos." },
    { label: "Sedação e Analgesia", action: "Despertar diário obrigatório (Daily Wake-Up). Alvo de RASS 0 a -2 (paciente calmo, acordando ao chamado). Transição precoce para Dexmedetomidina para extubação." },
    { label: "Delirium Pediátrico", action: "Aplicar escore CAPD 12/12h. Conduta ambiental: ciclo claro-escuro, redução de alarmes. Farmacológica: considerar antipsicóticos atípicos (ex: Quetiapina) se agitação refratária." },
    { label: "Mobilização Precoce", action: "Prescrever fisioterapia motora passiva/ativa e terapia ocupacional diária, mesmo em ventilação mecânica, assim que houver estabilidade hemodinâmica." },
    { label: "Síndrome de Abstinência", action: "Aplicar escore WAT-1 diário em pacientes com > 5 dias de opióides/benzodiazepínicos. Transição protocolada para Metadona e Clonidina via enteral." }
  ],
  "Módulo 3: Hemodinâmica e Cardiovascular": [
    { label: "Choque (Ressuscitação)", action: "Alíquotas de cristalóides (10-20 mL/kg), reavaliando fígado, crepitações e tempo de enchimento capilar (USG Point-of-Care recomendado). Introdução de vasopressor em até 60 min se choque refratário." },
    { label: "Arritmias Graves", action: "Sincronização elétrica para taquicardias instáveis; Adenosina rápida para TSV estável. Corrigir cálcio, magnésio e potássio imperativamente." },
    { label: "Crise Hipertensiva", action: "Redução máxima de 25% da PAM nas primeiras 8 horas para evitar isquemia de fronteira cerebral. Uso de Nipride ou Esmolol contínuo." },
    { label: "Pós-Op Cirurgia Cardíaca", action: "Monitorar débito de drenos e PVC. Suspeitar de tamponamento/baixo débito mediante taquicardia desproporcional e acidose lática. Uso de Milrinona para lusitropismo." },
    { label: "Disfunção Miocárdica / ECMO", action: "Restrição hídrica, suporte inotrópico. Acionar equipe de ECMO precocemente se Índice Cardíaco crítico persistir com doses cavalares de aminas." }
  ],
  "Módulo 2: Suporte Respiratório": [
    { label: "SDRA (Ventilação Protetora)", action: "Volume corrente baixo (4 a 6 mL/kg do peso predito). Titulação de PEEP por tabela PEEP/FiO2 ou complacência. Considerar posição prona para relação PaO2/FiO2 < 150." },
    { label: "Asma Aguda Grave", action: "Ajustar I:E para tempo expiratório prolongado (evitar auto-PEEP). Sulfato de Magnésio IV precoce; considerar Cetamina em infusão contínua para sedação/broncodilatação." },
    { label: "Suporte na Bronquiolite Viral Aguda Grave", action: "Priorizar Cânula Nasal de Alto Fluxo (CNAF). Limpar vias aéreas superiores sistematicamente; evitar corticoides/broncodilatadores de rotina (salvo atopia concomitante)." },
    { label: "Desmame da VM Invasiva", action: "Teste de Respiração Espontânea (TRE) diário em PSV ou Tubo T assim que a causa base entrar em resolução." },
    { label: "VNI", action: "Reavaliar sucesso em 1-2 horas (queda de FR, melhora do trabalho respiratório). Prevenir lesão cutânea nasal com hidrocolóide." },
    { label: "Estratégias Não Convencionais (VAFO)", action: "Indicar em hipoxemia refratária com risco de barotrauma maciço. Otimizar MAP (Pressão Média de Via Aérea) 2-4 cmH2O acima da VM convencional." },
    { label: "Traqueostomia", action: "Planejar precocemente (dia 10-14) se perspectiva de VM prolongada para facilitar reabilitação cognitiva e fonoaudiológica fora do leito." },
    { label: "Obstrução Respiratória Alta", action: "Dexametasona IV e nebulização com adrenalina. Manter o paciente calmo junto aos pais para evitar exaustão inspiratória." }
  ],
  "Módulo 6: Gastroenterologia e Nutrição": [
    { label: "Terapia Nutricional", action: "Início de dieta enteral trófica (10-15 mL/kg/dia) nas primeiras 48h, mesmo com drogas vasoativas em doses baixas, para evitar translocação bacteriana." },
    { label: "Insuficiência Hepática e HDA", action: "IBP IV contínuo. Em falência hepática: monitorar coagulograma e amônia; restrição severa de medicamentos hepatotóxicos e sedativos." },
    { label: "Compartimento Abdominal / Enterocolite", action: "Mensurar Pressão Intra-Abdominal (PIA) via sonda vesical. Jejum, descompressão gástrica calibrosa e avaliação cirúrgica infantil em caso de perfuração." }
  ],
  "Módulo 5: Nefrologia, Metabolismo e Endocrinologia": [
    { label: "Cetoacidose Diabética (CAD)", action: "Hidratação lenta (distribuída em 48h). Insulina em bomba (nunca em bolus inicial). Avaliação neurológica horária para risco de edema cerebral." },
    { label: "LRA e Diálise (CRRT)", action: "Ajustar depuração de antimicrobianos. Indicar Terapia de Substituição Renal Contínua precocemente se sobrecarga hídrica atingir > 10-15% do peso e oligúria refratária." },
    { label: "Distúrbios Ácido-Base e Eletrólitos", action: "Tratar a causa da acidose em vez de usar bicarbonato de rotina (exceto pH < 7.10 com instabilidade). Repor K, Mg e Ca diariamente." },
    { label: "Erros Inatos do Metabolismo", action: "Diante de crise: suspender ingesta proteica, garantir alta Taxa de Infusão de Glicose (TIG) para reverter catabolismo, solicitar painel de amônia e gasometria." }
  ],
  "Módulo 7: Onco-Hematologia": [
    { label: "Síndrome de Lise Tumoral", action: "Hiperhidratação venosa (sem potássio). Uso de Rasburicase ou Alopurinol preventivo. Exames a cada 6 horas (Ácido Úrico, K, P, Ca)." },
    { label: "CIVD e Transfusão", action: "Transfusão restritiva: gatilho de Hb < 7 g/dL em pacientes estáveis. Transfundir plaquetas e crioprecipitado apenas com sangramento ativo ou procedimento invasivo." },
    { label: "Trombose Venosa Profunda (TVP)", action: "Remoção do cateter causal (se possível). Anticoagulação plena com Enoxaparina monitorada por Anti-Xa em ambiente intensivo." }
  ],
  "Módulo 4: Infectologia e Imunologia": [
    { label: "Sepse (Protocolo 1ª Hora)", action: "Culturas antes do antibiótico (sem atrasar o mesmo). Antibiótico de amplo espectro intravenoso em até 1 hora da suspeita." },
    { label: "Dengue Grave", action: "Acompanhamento horário de hematócrito. Expansão cuidadosa com cristalóides visando Ht alvo; vigilância para Síndrome do Compartimento Abdominal (ascite de tensão)." },
    { label: "Meningites e Encefalites", action: "Punção lombar se não houver sinais de HIC. Dexametasona IV antes ou junto com a primeira dose do antibiótico para reduzir sequelas neurológicas." },
    { label: "Prevenção de Infecções (PAV/ICS)", action: "Retirada de cateteres venosos centrais e sondas vesicais assim que a indicação primária cessar. Higiene oral diária com clorexidina." },
    { label: "Neutropenia Febril", action: "Isolamento protetor. Cefepime ou Piperacilina-Tazobactam imediato; escalonar para antifúngico se febre persistir > 72h." }
  ],
  "Módulo 8: Trauma e Emergências": [
    { label: "Politrauma e TCE Grave", action: "Aplicar ATLS sistemático. Garantir via aérea com controle cervical. No TCE: evitar hiperventilação profilática (manter PaCO2 entre 35-40 mmHg)." },
    { label: "Grande Queimado", action: "Fórmula de Parkland/Brooke modificada para ressuscitação fluídica (Ringer Lactato). Controle rigoroso da hipotermia em sala e analgesia agressiva precoce." },
    { label: "Afogamento / Toxidromes / Trauma Abusivo", action: "Afogamento: focar na SDRA. Trauma Abusivo: mapeamento esquelético (RX ossos longos), fundo de olho obrigatório e acionamento sigiloso do conselho tutelar." }
  ],
  "Módulo 9: Gestão, Ética e Transição Cognitiva": [
    { label: "Transporte Hospitalar", action: "Aplicação de Checklist de segurança (baterias, oxigênio calculado, drogas de reanimação em seringa)." },
    { label: "Cuidados Paliativos", action: "Reuniões familiares estruturadas. Registro claro em prontuário sobre limites de suporte terapêutico (ordem de não reanimar, não escalar aminas)." },
    { label: "Transição de Cuidados (Handover)", action: "Preencher relatório de alta contendo: 1. Carga cumulativa de hipóxia (duração). 2. Drogas neurotóxicas ou sedativas utilizadas e plano de desmame. 3. Histórico de delírio e convulsões. Encaminhamento direto focado na retomada do neurodesenvolvimento e habilidades pré-escolares." }
  ]
};

const SYSTEM_PHRASES: Record<string, string[]> = {
  neuro: [
    "Sedação adequada (RASS -3). Pupilas isocóricas e fotorreagentes.",
    "Desperto, reativo, RASS 0. Movimenta os 4 membros.",
    "Comatoso, Glasgow 3. Sem reflexos de tronco.",
    "Agitado, RASS +2. Necessário ajuste de sedação."
  ],
  hemo: [
    "Estável hemodinamicamente, sem DVA. Boa perfusão, pulsos cheios.",
    "Choque compensado, dependente de DVA. Perfusão lentificada.",
    "Hipotensão persistente apesar de DVA em doses elevadas.",
    "Taquicárdico, pulsos finos, tempo de enchimento capilar > 3s."
  ],
  resp: [
    "Em VMI, modo PCV, bem adaptado. Ausculta com MV presente bilateralmente.",
    "Em VNI (CPAP) com boa tolerância. Sem sinais de esforço.",
    "Em ar ambiente, eupneico, SpO2 estável.",
    "Taquipneico, uso de musculatura acessória, MV diminuído em bases."
  ],
  gastro: [
    "Abdome flácido, indolor, RHA presentes. Dieta enteral com boa tolerância.",
    "Dieta zero, em NPT. Abdome distendido, RHA diminuídos.",
    "Aceitando dieta via oral, sem intercorrências.",
    "Presença de resíduo gástrico bilioso em grande quantidade."
  ],
  renal: [
    "Diurese presente e adequada (> 1ml/kg/h). Balanço hídrico negativo.",
    "Oligúria nas últimas horas. Edema ++/4 generalizado.",
    "Em terapia dialítica contínua, sem intercorrências no filtro.",
    "Anúria persistente apesar de uso de diuréticos de alça."
  ],
  hemato: [
    "Sem sangramentos ativos. Hb estável, plaquetas em níveis seguros.",
    "Presença de petéquias e equimoses. Coagulograma alterado.",
    "Pós-transfusão de hemocomponentes, sem reações.",
    "Anemia com necessidade de gatilho transfusional."
  ],
  infec: [
    "Afebril nas últimas 24h. Culturas negativas até o momento.",
    "Pico febril isolado. Iniciado escalonamento de antibióticos.",
    "Em curso de tratamento para germe multirresistente (KPC+).",
    "Sinais flogísticos em sítio de cateter venoso central."
  ]
};

const PRESCRIPTION_CATEGORIES = [
  {
    name: "Dieta e Nutrição",
    items: [
      "Dieta enteral trófica via SNE a 10-15 mL/kg/dia.",
      "Jejum oral e enteral (se instabilidade hemodinâmica, EIM em crise ou distensão abdominal/compartimento).",
      "Suspender ingesta proteica (protocolo EIM).",
      "Dieta enteral por SNE: [___] mL de [___] de [___]/[___]h.",
      "SGF 1:1 + KCl 10% 2mL/100mL + NaCl 20% 2mL/100mL a [___] mL/h (Manutenção).",
      "Oferta hídrica total (OHT) alvo: [___] mL/kg/dia.",
      "Controle rigoroso de balanço hídrico e diurese horária."
    ]
  },
  {
    name: "Posicionamento e Monitorização",
    items: [
      "Manter cabeceira elevada a 30° em linha média estrita.",
      "Posição prona (manter por [___] horas, conforme protocolo de SDRA).",
      "Monitorização multiparamétrica contínua (ECG, FC, FR, SpO2 alvo 94-98%, PNI).",
      "Monitorização de Pressão Arterial Invasiva (PAI).",
      "Monitorização de Pressão Venosa Central (PVC).",
      "Monitorização contínua da Pressão Intracraniana (PIC) / Garantir PPC alvo de [___] mmHg.",
      "Mensuração de Pressão Intra-Abdominal (PIA) via SVD de 12/12h.",
      "Monitoramento horário de sinais vitais e perfusão periférica.",
      "Despertar Diário (Daily Wake-Up) - suspender sedativos às [horário].",
      "Avaliação neurológica horária (Pupilas, Escala de Glasgow / FOUR).",
      "Aplicar escore CAPD de 12/12h.",
      "Aplicar escore WAT-1 diariamente.",
      "Higiene oral com Clorexidina aquosa 0,12% de 12/12h."
    ]
  },
  {
    name: "Ventilação e Oxigenoterapia",
    items: [
      "VMI: Modo [___], PC [___], PEEP [___], FR [___], FiO2 [___]%, Ti [___]s.",
      "VNI: Modo [___], IPAP [___], EPAP [___], FiO2 [___]%.",
      "CNAF: Fluxo [___] L/min, FiO2 [___]%.",
      "Cateter nasal de O2 a [___] L/min.",
      "Aspiração de TOT/TQT se necessário (técnica estéril).",
      "Higiene brônquica e manobras de recrutamento se necessário.",
      "Nebulização com SF 0,9% 5mL de 4/4h.",
      "Nebulização com L-Adrenalina [] mL + SF 0,9% [] mL de []/[]h."
    ]
  },
  {
    name: "Sedação, Analgesia e BNM",
    items: [
      "Escala de Comfort-B de 2/2h (Alvo 12-17).",
      "Escala de SOS (Síndrome de Abstinência) de 4/4h.",
      "Dipirona: [___] mg/kg/dose (Máx 1g) IV de 6/6h se dor ou febre.",
      "Paracetamol: [___] mg/kg/dose (Máx 1g) VO/VR de 6/6h se dor ou febre.",
      "Morfina: [___] mg/kg/dose IV de 4/4h ou 6/6h (Bolus).",
      "Fentanil: [___] mcg/kg/dose IV (Bolus para procedimento).",
      "Midazolam: [___] mg/kg/dose IV (Bolus para procedimento).",
      "Cetamina: [___] mg/kg/dose IV (Bolus para procedimento).",
      "Rocurônio: [___] mg/kg/dose IV (Bolus para procedimento)."
    ]
  },
  {
    name: "Antibióticos e Antifúngicos",
    items: [
      "Cefepime [] mg IV de []/[___]h.",
      "Piperacilina-Tazobactam [] mg IV de []/[___]h.",
      "Meropenem [] mg IV de []/[___]h.",
      "Vancomicina [] mg IV de []/[___]h.",
      "Ceftriaxona [] mg IV de []/[___]h.",
      "Oxacilina [] mg IV de []/[___]h.",
      "Amicacina [] mg IV de []/[___]h.",
      "Fluconazol [] mg IV de []/[___]h.",
      "Anfotericina B [] mg IV de []/[___]h."
    ]
  },
  {
    name: "Outros Medicamentos",
    items: [
      "Omeprazol: [___] mg/kg/dia IV 1x ao dia.",
      "Ranitidina: [___] mg/kg/dose IV de 8/8h ou 12/12h.",
      "Furosemida: [___] mg/kg/dose IV de 6/6h ou 12/12h.",
      "Hidrocortisona: [___] mg/kg/dose IV de 6/6h.",
      "Metilprednisolona: [___] mg/kg/dia IV.",
      "Fenitoína: [___] mg/kg/dia IV de 12/12h.",
      "Levetiracetam: [___] mg/kg/dose IV de 12/12h.",
      "Fenobarbital: [___] mg/kg/dia VO/IV."
    ]
  },
  {
    name: "Exames e Metas",
    items: [
      "Gasometria arterial, eletrólitos, lactato, glicemia de 6/6h.",
      "Hemograma, PCR, Ureia, Creatinina, TGO, TGP, Coagulograma diário.",
      "Raio-X de tórax no leito diário.",
      "Ultrassonografia Point-of-Care (POCUS) sob demanda.",
      "Meta de PAM: > [___] mmHg.",
      "Meta de SpO2: 94-98%.",
      "Meta de Glicemia: 80-150 mg/dL.",
      "Meta de PIC: < 20 mmHg / PPC: > [___] mmHg."
    ]
  }
];

// --- TYPES ---

interface Patient {
  id: number;
  nome: string;
  leito: string;
  idade: string;
  idadeMeses: number; // Para cálculos de normalidade
  peso: number;
  pesoAdmissao: number;
  hd: string;
  dataAdm: string;
  evolucao: Record<string, any>;
  prescricaoTexto: string;
  rounds: Record<string, any>;
  logs: { data: string; acao: string; user: string }[];
  monitor: { fc: number; fr: number; sat: number; paS: number; paD: number; paM: number };
  hemodynamics: { tec: number; lactato: number; svco2: number };
  respiratory: { vt: number; plateau: number; peep: number; fio2: number; pao2: number; map_vent: number; etco2: number; spo2: number };
  renal: { diurese: number; bh24: number; bhAcumulado: number; kdigo: string };
  neuro: { glasgow: number; four: number; rass: number; sbs: number; flacc: number; capd: number };
  severity: { psofa: number; pelod2: number };
  trends: {
    psofa: { time: string; value: number }[];
    lactate: { time: string; value: number }[];
    fluidOverload: { time: string; value: number }[];
  };
}

// --- MAIN COMPONENT ---

export default function App() {
  const [pacientes, setPacientes] = useState<Patient[]>(() => {
    const saved = localStorage.getItem('PedICU_Pacientes_v6');
    if (saved) return JSON.parse(saved);
    
    // Default mock patient
    return [{
      id: 1,
      nome: "Paciente Teste (Mock)",
      leito: "U-01",
      idade: "2a 4m",
      idadeMeses: 28,
      peso: 12.5,
      pesoAdmissao: 12.0,
      hd: "[Respiratório] Bronquiolite Viral Aguda - VNI em desmame",
      dataAdm: new Date().toISOString(),
      evolucao: { 
        sinopse: "Paciente admitido há 3 dias por quadro de insuficiência respiratória aguda secundária a BVA. Apresentou melhora progressiva com suporte ventilatório não invasivo.",
        neuro: "Desperto, reativo, RASS 0. Movimenta os 4 membros.",
        hemo: "Estável hemodinamicamente, sem DVA. Boa perfusão, pulsos cheios.",
        resp: "Em VNI (CPAP) com boa tolerância. Sem sinais de esforço.",
        botoesAtivos: ["Manejo da HIC", "Suporte na Bronquiolite Viral Aguda Grave"]
      },
      prescricaoTexto: "BIC: Fentanil | Dose: 2.0 mcg/kg/h\n   Solução: Puro: Ampola 50mcg/mL\n   VAZÃO: 0.5 mL/h\n",
      rounds: {},
      logs: [{ data: new Date().toISOString(), acao: "Admissão no CTI", user: "Dr(a). Bernard" }],
      monitor: { fc: 124, fr: 32, sat: 96, paS: 94, paD: 58, paM: 70 },
      hemodynamics: { tec: 1.5, lactato: 1.2, svco2: 72 },
      respiratory: { vt: 75, plateau: 22, peep: 8, fio2: 40, pao2: 85, map_vent: 12, etco2: 38, spo2: 96 },
      renal: { diurese: 1.5, bh24: 250, bhAcumulado: 800, kdigo: "Estágio 0" },
      neuro: { glasgow: 15, four: 16, rass: 0, sbs: 0, flacc: 0, capd: 5 },
      severity: { psofa: 2, pelod2: 4 },
      trends: {
        psofa: Array.from({ length: 10 }, (_, i) => ({ time: `${i}:00`, value: Math.floor(Math.random() * 5) })),
        lactate: Array.from({ length: 10 }, (_, i) => ({ time: `${i}:00`, value: Math.random() * 3 })),
        fluidOverload: Array.from({ length: 10 }, (_, i) => ({ time: `${i}:00`, value: Math.random() * 10 }))
      }
    }];
  });
  const [pacienteAtualId, setPacienteAtualId] = useState<number | null>(null);
  const [activeView, setActiveView] = useState('mapa');
  const [isLightMode, setIsLightMode] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [patientToDeleteId, setPatientToDeleteId] = useState<number | null>(null);
  const [selectedDavCategory, setSelectedDavCategory] = useState<string>("");
  
  // Form states for new patient
  const [newPac, setNewPac] = useState({ nome: '', leito: '', idade: '', idadeMeses: '', peso: '', cat: '', diag: '', comp: '' });

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('PedICU_Pacientes_v6', JSON.stringify(pacientes));
  }, [pacientes]);

  // Monitor simulation
  useEffect(() => {
    const interval = setInterval(() => {
      setPacientes(prev => prev.map(p => ({
        ...p,
        monitor: {
          fc: Math.max(60, p.monitor.fc + Math.floor(Math.random() * 5) - 2),
          fr: Math.max(12, p.monitor.fr + Math.floor(Math.random() * 3) - 1),
          sat: Math.min(100, Math.max(85, p.monitor.sat + (Math.random() > 0.8 ? Math.floor(Math.random() * 3) - 1 : 0))),
          paS: Math.max(60, p.monitor.paS + Math.floor(Math.random() * 5) - 2),
          paD: Math.max(30, p.monitor.paD + Math.floor(Math.random() * 3) - 1),
        }
      })));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const exportarDados = () => {
    const dataStr = JSON.stringify(pacientes, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `PedICU_Backup_${new Date().toISOString().split('T')[0]}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const zerarEvolucao = () => {
    if (!pacienteAtualId) return;
    setPacientes(prev => prev.map(p => p.id === pacienteAtualId ? {
      ...p,
      evolucao: { botoesAtivos: [] }
    } : p));
    setShowResetConfirm(false);
  };

  const pacienteAtual = useMemo(() => pacientes.find(p => p.id === pacienteAtualId), [pacientes, pacienteAtualId]);

  const registrarLog = (pacId: number, acao: string) => {
    setPacientes(prev => prev.map(p => p.id === pacId ? {
      ...p,
      logs: [...p.logs, { data: new Date().toISOString(), acao, user: "Dr(a). Bernard" }]
    } : p));
  };

  const admitirPaciente = () => {
    if (!newPac.nome || !newPac.peso || !newPac.leito || !newPac.cat || !newPac.diag) {
      alert("Campos obrigatórios faltando!");
      return;
    }
    const cat = DIAGNOSTIC_CATEGORIES[newPac.cat as keyof typeof DIAGNOSTIC_CATEGORIES];
    let hd = `[${cat.name.split(' (')[0]}] ${newPac.diag}`;
    if (newPac.comp) hd += ` - ${newPac.comp}`;

    const p: Patient = {
      id: Date.now(),
      nome: newPac.nome,
      leito: newPac.leito,
      idade: newPac.idade,
      idadeMeses: parseInt(newPac.idadeMeses) || 0,
      peso: parseFloat(newPac.peso),
      pesoAdmissao: parseFloat(newPac.peso),
      hd,
      dataAdm: new Date().toISOString(),
      evolucao: { botoesAtivos: [] },
      prescricaoTexto: "",
      rounds: {},
      logs: [{ data: new Date().toISOString(), acao: "Admissão no CTI", user: "Dr(a). Bernard" }],
      monitor: { fc: 110, fr: 30, sat: 98, paS: 90, paD: 55, paM: 65 },
      hemodynamics: { tec: 1.5, lactato: 1.0, svco2: 70 },
      respiratory: { vt: 0, plateau: 0, peep: 0, fio2: 21, pao2: 100, map_vent: 0, etco2: 35, spo2: 98 },
      renal: { diurese: 1.5, bh24: 0, bhAcumulado: 0, kdigo: "Estágio 0" },
      neuro: { glasgow: 15, four: 16, rass: 0, sbs: 0, flacc: 0, capd: 0 },
      severity: { psofa: 0, pelod2: 0 },
      trends: { psofa: [], lactate: [], fluidOverload: [] }
    };
    setPacientes(prev => [...prev, p]);
    setNewPac({ nome: '', leito: '', idade: '', idadeMeses: '', peso: '', cat: '', diag: '', comp: '' });
  };

  const darAlta = (id: number) => {
    setPatientToDeleteId(id);
  };

  const confirmarAlta = () => {
    if (patientToDeleteId !== null) {
      setPacientes(prev => prev.filter(p => p.id !== patientToDeleteId));
      if (pacienteAtualId === patientToDeleteId) setPacienteAtualId(null);
      setPatientToDeleteId(null);
    }
  };

  const updatePatientData = (section: keyof Patient, field: string, value: any) => {
    if (!pacienteAtualId) return;
    setPacientes(prev => prev.map(p => p.id === pacienteAtualId ? {
      ...p,
      [section]: { ...(p[section] as object), [field]: value }
    } : p));
  };

  const updateEvolucao = (field: string, value: any) => {
    if (!pacienteAtualId) return;
    setPacientes(prev => prev.map(p => p.id === pacienteAtualId ? {
      ...p,
      evolucao: { ...p.evolucao, [field]: value }
    } : p));
  };

  const toggleMacro = (action: string) => {
    if (!pacienteAtualId || !pacienteAtual) return;
    const ativos = pacienteAtual.evolucao.botoesAtivos || [];
    const novosAtivos = ativos.includes(action) 
      ? ativos.filter((a: string) => a !== action)
      : [...ativos, action];
    updateEvolucao('botoesAtivos', novosAtivos);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Copiado!");
  };

  const gerarEvolucaoTexto = () => {
    if (!pacienteAtual) return "";
    const e = pacienteAtual.evolucao;
    const h = pacienteAtual.hemodynamics;
    const r = pacienteAtual.respiratory;
    const ren = pacienteAtual.renal;
    const n = pacienteAtual.neuro;
    const s = pacienteAtual.severity;
    const m = pacienteAtual.monitor;
    
    const di = Math.floor((new Date().getTime() - new Date(pacienteAtual.dataAdm).getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    let tx = `EVOLUÇÃO MÉDICA - CTI PEDIÁTRICO\n`;
    tx += `Paciente: ${pacienteAtual.nome} | Leito: ${pacienteAtual.leito} | Peso: ${pacienteAtual.peso}kg\n`;
    tx += `Diagnóstico: ${pacienteAtual.hd} | D.I. UTI: ${di}\n\n`;
    
    if (e.sinopse) tx += `# Sinopse:\n${e.sinopse}\n\n`;
    
    tx += `Exame por Sistemas:\n`;
    tx += `a. Neuro: ${e.neuro || ""} [GCS: ${n.glasgow} | RASS: ${n.rass} | CAPD: ${n.capd}]\n`;
    tx += `b. Hemo: ${e.hemo || ""} [FC: ${m.fc} | PA: ${m.paS}/${m.paD}(${m.paM}) | TEC: ${h.tec}s | Lact: ${h.lactato}]\n`;
    tx += `c. Resp: ${e.resp || ""} [Vt: ${calcRelativeVt(r.vt, pacienteAtual.peso)}ml/kg | ΔP: ${calcDrivingPressure(r.plateau, r.peep)} | IO: ${calcOI(r.map_vent, r.fio2, r.pao2)}]\n`;
    tx += `d. Gastro/Metab: ${e.gastro || ""}\n`;
    tx += `e. Renal: ${e.renal || ""} [Diurese: ${ren.diurese}ml/kg/h | BH24: ${ren.bh24} | BH Acum: ${ren.bhAcumulado} | Overload: ${calcFluidOverload(ren.bhAcumulado, pacienteAtual.pesoAdmissao)}%]\n`;
    tx += `f. Hemato: ${e.hemato || ""}\n`;
    tx += `g. Infec: ${e.infec || ""}\n\n`;
    
    tx += `Scores de Gravidade: pSOFA: ${s.psofa} | PELOD-2: ${s.pelod2}\n\n`;
    
    tx += `Problemas Ativos:\n${e.problemas || "P1. " + pacienteAtual.hd}\n\n`;
    
    tx += `Condutas e Protocolos:\n`;
    const ativos = e.botoesAtivos || [];
    if (ativos.length > 0) {
      ativos.forEach((label: string) => {
        // Find the action text for this label
        let actionText = label;
        for (const system of Object.values(PROBLEMS_BY_SYSTEM)) {
          const found = system.find(item => item.label === label);
          if (found) {
            actionText = `${found.label}: ${found.action}`;
            break;
          }
        }
        tx += `- ${actionText}\n`;
      });
    } else {
      tx += `- Manutenção de suporte atual.\n`;
    }
    
    tx += `\nAssinado: Dr(a). Bernard`;
    return tx;
  };

  return (
    <div className={`min-h-screen font-sans ${isLightMode ? 'light-mode' : ''}`}>
      <div className="container mx-auto p-4 max-w-6xl">
        <header className="flex justify-between items-center border-b-2 border-[var(--primary)] pb-4 mb-6">
          <div className="flex items-center gap-3">
            <Activity className="text-[var(--primary)] w-8 h-8" />
            <h1 className="text-2xl font-bold text-[var(--primary)] flex items-center gap-2">
              PedICU v5.0
              <span className="text-[10px] bg-[var(--danger)] text-white px-2 py-0.5 rounded animate-pulse-fast">LIVE</span>
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={exportarDados}
              className="hidden md:flex items-center gap-2 text-xs bg-[var(--card-hover)] px-3 py-1.5 rounded-lg border border-[var(--border-color)] hover:border-[var(--primary)] transition-all"
              title="Exportar dados para uso offline"
            >
              <Save size={14} />
              Backup JSON
            </button>
            <div className="hidden md:flex items-center gap-2 text-sm text-[var(--secondary)] font-mono">
              <User size={16} />
              Dr(a). Bernard
            </div>
            <button 
              onClick={() => setIsLightMode(!isLightMode)}
              className="p-2 rounded-full border border-[var(--border-color)] hover:bg-[var(--card-hover)] transition-colors"
            >
              {isLightMode ? <Moon size={20} /> : <Sun size={20} />}
            </button>
          </div>
        </header>

        <nav className="flex flex-wrap gap-2 mb-8 no-print">
          {[
            { id: 'mapa', label: 'Monitores CTI', icon: Bed },
            { id: 'clinico', label: 'Módulos Clínicos', icon: Stethoscope, disabled: !pacienteAtualId },
            { id: 'trends', label: 'Tendências', icon: TrendingUp, disabled: !pacienteAtualId },
            { id: 'evolucao', label: 'Evolução (A-H)', icon: ClipboardList, disabled: !pacienteAtualId },
            { id: 'prescricao', label: 'Prescrição', icon: FileText, disabled: !pacienteAtualId },
          ].map(tab => (
            <button
              key={tab.id}
              disabled={tab.disabled}
              onClick={() => setActiveView(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
                activeView === tab.id 
                  ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-color)] shadow-lg' 
                  : 'bg-[var(--nav-bg)] text-[var(--text-color)] opacity-70 hover:opacity-100'
              } ${tab.disabled ? 'cursor-not-allowed opacity-30' : ''}`}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </nav>

        <main>
          <AnimatePresence mode="wait">
            {activeView === 'mapa' && (
              <motion.div 
                key="mapa"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                {/* Admission Form */}
                <section className="bg-[var(--container-bg)] p-6 rounded-xl border border-[var(--border-color)] shadow-xl">
                  <h2 className="text-xl font-bold text-[var(--primary)] mb-6 flex items-center gap-2">
                    <Plus size={20} /> Admitir Paciente
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <label className="text-xs font-bold opacity-70 mb-1 block">Nome Completo</label>
                      <input 
                        className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg p-2 focus:border-[var(--primary)] outline-none"
                        value={newPac.nome}
                        onChange={e => setNewPac({...newPac, nome: e.target.value})}
                        placeholder="Ex: João Silva"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold opacity-70 mb-1 block">Leito</label>
                      <input 
                        className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg p-2 focus:border-[var(--primary)] outline-none"
                        value={newPac.leito}
                        onChange={e => setNewPac({...newPac, leito: e.target.value})}
                        placeholder="Ex: U-01"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold opacity-70 mb-1 block">Idade</label>
                      <input 
                        className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg p-2 focus:border-[var(--primary)] outline-none"
                        value={newPac.idade}
                        onChange={e => setNewPac({...newPac, idade: e.target.value})}
                        placeholder="Ex: 5a 2m"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold opacity-70 mb-1 block">Idade (Meses)</label>
                      <input 
                        type="number"
                        className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg p-2 focus:border-[var(--primary)] outline-none"
                        value={newPac.idadeMeses}
                        onChange={e => setNewPac({...newPac, idadeMeses: e.target.value})}
                        placeholder="Ex: 62"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div>
                      <label className="text-xs font-bold opacity-70 mb-1 block">Peso (Kg)</label>
                      <input 
                        type="number"
                        className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg p-2 focus:border-[var(--primary)] outline-none"
                        value={newPac.peso}
                        onChange={e => setNewPac({...newPac, peso: e.target.value})}
                        placeholder="0.0"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label className="text-xs font-bold opacity-70 mb-1 block">Diagnóstico de Admissão</label>
                      <div className="flex flex-wrap md:flex-nowrap gap-2">
                        <select 
                          className="flex-1 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg p-2 outline-none"
                          value={newPac.cat}
                          onChange={e => setNewPac({...newPac, cat: e.target.value, diag: ''})}
                        >
                          <option value="">Selecione Categoria</option>
                          {Object.entries(DIAGNOSTIC_CATEGORIES).map(([id, cat]) => (
                            <option key={id} value={id}>{cat.name}</option>
                          ))}
                        </select>
                        <select 
                          disabled={!newPac.cat}
                          className="flex-1 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg p-2 outline-none disabled:opacity-30"
                          value={newPac.diag}
                          onChange={e => setNewPac({...newPac, diag: e.target.value})}
                        >
                          <option value="">Selecione Específico</option>
                          {newPac.cat && DIAGNOSTIC_CATEGORIES[newPac.cat as keyof typeof DIAGNOSTIC_CATEGORIES].diags.map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                        <input 
                          className="flex-1 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg p-2 outline-none"
                          value={newPac.comp}
                          onChange={e => setNewPac({...newPac, comp: e.target.value})}
                          placeholder="Complemento (opcional)"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button 
                      onClick={admitirPaciente}
                      className="bg-[var(--primary)] text-[var(--nav-active-color)] px-6 py-2 rounded-lg font-bold hover:opacity-90 transition-all flex items-center gap-2"
                    >
                      <Plus size={18} /> Iniciar Monitoramento
                    </button>
                  </div>
                </section>

                {/* Patient Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {pacientes.map(pac => {
                    const alerts = checkAlerts(pac);
                    const hasAlarm = alerts.length > 0;
                    let weightColor = "border-[var(--primary)]";
                    let monitorBg = "bg-gray-900";
                    if (pac.peso < 5) { weightColor = "border-pink-500"; monitorBg = "bg-pink-500/10"; }
                    else if (pac.peso < 15) { weightColor = "border-blue-500"; monitorBg = "bg-blue-500/10"; }
                    else if (pac.peso < 30) { weightColor = "border-green-500"; monitorBg = "bg-green-500/10"; }
                    else { weightColor = "border-purple-500"; monitorBg = "bg-purple-500/10"; }

                    return (
                      <div 
                        key={pac.id}
                        onClick={() => { setPacienteAtualId(pac.id); setActiveView('clinico'); }}
                        className={`relative bg-black border-2 rounded-xl p-4 cursor-pointer transition-all hover:scale-[1.02] ${
                          hasAlarm ? 'border-[var(--danger)] shadow-[0_0_15px_rgba(239,68,68,0.4)]' : `${weightColor} hover:shadow-[0_0_10px_rgba(255,255,255,0.1)]`
                        }`}
                      >
                        {hasAlarm && (
                          <div className="absolute -top-3 -right-3 z-10 flex flex-col gap-1">
                            {alerts.map((a, idx) => (
                              <span key={idx} className="bg-[var(--danger)] text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-lg animate-pulse">
                                {a.msg}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex justify-between items-center mb-2 border-b border-gray-800 pb-2">
                          <span className="text-white font-bold truncate pr-2">{pac.nome}</span>
                          <button 
                            onClick={(e) => { e.stopPropagation(); darAlta(pac.id); }}
                            className="bg-[var(--primary)] text-black text-[10px] font-black px-2 py-0.5 rounded shrink-0 hover:bg-red-500 hover:text-white transition-colors"
                            title="Clique para dar alta"
                          >
                            {pac.leito}
                          </button>
                        </div>
                        
                        <div className="text-[10px] text-gray-400 mb-3 italic truncate">
                          HD: {pac.hd}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className={`${monitorBg} p-2 rounded-lg text-center`}>
                            <span className="text-[10px] font-bold text-gray-500 block">FC (bpm)</span>
                            <span className="text-2xl font-bold text-green-500 font-mono">{pac.monitor.fc}</span>
                          </div>
                          <div className={`${monitorBg} p-2 rounded-lg text-center`}>
                            <span className="text-[10px] font-bold text-gray-500 block">SpO2 (%)</span>
                            <span className="text-2xl font-bold text-blue-400 font-mono">{pac.monitor.sat}</span>
                          </div>
                          <div className={`${monitorBg} p-2 rounded-lg text-center`}>
                            <span className="text-[10px] font-bold text-gray-500 block">PA (mmHg)</span>
                            <span className="text-xl font-bold text-red-500 font-mono">{pac.monitor.paS}/{pac.monitor.paD}</span>
                          </div>
                          <div className={`${monitorBg} p-2 rounded-lg text-center`}>
                            <span className="text-[10px] font-bold text-gray-500 block">FR (rpm)</span>
                            <span className="text-2xl font-bold text-yellow-500 font-mono">{pac.monitor.fr}</span>
                          </div>
                        </div>
                        <div className="mt-4 flex justify-between items-center">
                          <span className="text-[10px] text-gray-500">{pac.peso}kg | {pac.idade}</span>
                          <button 
                            onClick={(e) => { e.stopPropagation(); darAlta(pac.id); }}
                            className="text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white p-1 rounded transition-colors"
                          >
                            <Trash2 size={14} className="bg-[#0f19c9]" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {activeView === 'clinico' && pacienteAtual && (
              <motion.div 
                key="clinico"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="bg-[var(--border-color)] p-4 rounded-lg flex flex-wrap gap-4 justify-between items-center text-sm">
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-[var(--primary)]">{pacienteAtual.nome}</span>
                    <span className="opacity-60">Leito: {pacienteAtual.leito}</span>
                    <span className="opacity-60">Peso: {pacienteAtual.peso}kg</span>
                  </div>
                  <button 
                    onClick={() => {
                      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      const p = pacienteAtual;
                      const newTrends = {
                        psofa: [...p.trends.psofa, { time: now, value: p.severity.psofa }].slice(-10),
                        lactate: [...p.trends.lactate, { time: now, value: p.hemodynamics.lactato }].slice(-10),
                        fluidOverload: [...p.trends.fluidOverload, { time: now, value: parseFloat(calcFluidOverload(p.renal.bhAcumulado, p.pesoAdmissao)) }].slice(-10)
                      };
                      updatePatientData('trends', 'psofa', newTrends.psofa);
                      updatePatientData('trends', 'lactate', newTrends.lactate);
                      updatePatientData('trends', 'fluidOverload', newTrends.fluidOverload);
                      alert("Ponto de tendência registrado!");
                    }}
                    className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg flex items-center gap-2 hover:bg-indigo-700 transition-all text-xs font-bold"
                  >
                    <TrendingUp size={14} /> Registrar Tendência
                  </button>
                </div>

                {checkAlerts(pacienteAtual).length > 0 && (
                  <div className="bg-red-500/10 border border-red-500/50 p-3 rounded-lg flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-red-500 font-black text-xs uppercase tracking-wider">
                      <AlertTriangle size={16} /> Alertas Ativos (Red Flags)
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {checkAlerts(pacienteAtual).map((a, i) => (
                        <span key={i} className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm">
                          {a.msg}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Módulo Cardiovascular */}
                  <section className="bg-[var(--container-bg)] p-4 rounded-xl border border-pink-500/30">
                    <h3 className="text-lg font-bold text-pink-400 mb-4 flex items-center gap-2">
                      <Heart size={20} /> Cardiovascular
                    </h3>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold opacity-70 block">FC (bpm)</label>
                          <input type="number" className="w-full bg-black border border-gray-800 rounded p-2 text-sm" value={pacienteAtual.monitor.fc} onChange={e => updatePatientData('monitor', 'fc', parseInt(e.target.value))} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold opacity-70 block">TEC (s)</label>
                          <input type="number" step="0.1" className={cn("w-full bg-black border border-gray-800 rounded p-2 text-sm", pacienteAtual.hemodynamics.tec > 2 && "border-red-500 text-red-500")} value={pacienteAtual.hemodynamics.tec} onChange={e => updatePatientData('hemodynamics', 'tec', parseFloat(e.target.value))} />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] font-bold opacity-70 block">PAS</label>
                          <input type="number" className="w-full bg-black border border-gray-800 rounded p-2 text-sm" value={pacienteAtual.monitor.paS} onChange={e => updatePatientData('monitor', 'paS', parseInt(e.target.value))} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold opacity-70 block">PAD</label>
                          <input type="number" className="w-full bg-black border border-gray-800 rounded p-2 text-sm" value={pacienteAtual.monitor.paD} onChange={e => updatePatientData('monitor', 'paD', parseInt(e.target.value))} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold opacity-70 block">PAM</label>
                          <input type="number" className="w-full bg-black border border-gray-800 rounded p-2 text-sm" value={pacienteAtual.monitor.paM} onChange={e => updatePatientData('monitor', 'paM', parseInt(e.target.value))} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold opacity-70 block">SvcO2 (%)</label>
                          <input type="number" className="w-full bg-black border border-gray-800 rounded p-2 text-sm" value={pacienteAtual.hemodynamics.svco2} onChange={e => updatePatientData('hemodynamics', 'svco2', parseInt(e.target.value))} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold opacity-70 block">Lactato</label>
                          <input type="number" step="0.1" className={cn("w-full bg-black border border-gray-800 rounded p-2 text-sm", pacienteAtual.hemodynamics.lactato > 2 && "border-red-500 text-red-500")} value={pacienteAtual.hemodynamics.lactato} onChange={e => updatePatientData('hemodynamics', 'lactato', parseFloat(e.target.value))} />
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Módulo Respiratório */}
                  <section className="bg-[var(--container-bg)] p-4 rounded-xl border border-red-500/30">
                    <h3 className="text-lg font-bold text-red-400 mb-4 flex items-center gap-2">
                      <Wind size={20} /> Respiratório
                    </h3>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold opacity-70 block">Vt (ml)</label>
                          <input type="number" className="w-full bg-black border border-gray-800 rounded p-2 text-sm" value={pacienteAtual.respiratory.vt} onChange={e => updatePatientData('respiratory', 'vt', parseInt(e.target.value))} />
                          <span className="text-[10px] text-gray-500">{calcRelativeVt(pacienteAtual.respiratory.vt, pacienteAtual.peso)} ml/kg</span>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold opacity-70 block">EtCO2</label>
                          <input type="number" className="w-full bg-black border border-gray-800 rounded p-2 text-sm" value={pacienteAtual.respiratory.etco2} onChange={e => updatePatientData('respiratory', 'etco2', parseInt(e.target.value))} />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] font-bold opacity-70 block">Platô</label>
                          <input type="number" className="w-full bg-black border border-gray-800 rounded p-2 text-sm" value={pacienteAtual.respiratory.plateau} onChange={e => updatePatientData('respiratory', 'plateau', parseInt(e.target.value))} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold opacity-70 block">PEEP</label>
                          <input type="number" className="w-full bg-black border border-gray-800 rounded p-2 text-sm" value={pacienteAtual.respiratory.peep} onChange={e => updatePatientData('respiratory', 'peep', parseInt(e.target.value))} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold opacity-70 block">ΔP</label>
                          <div className={cn("w-full bg-black border border-gray-800 rounded p-2 text-sm", calcDrivingPressure(pacienteAtual.respiratory.plateau, pacienteAtual.respiratory.peep) > 15 && "text-red-500 font-bold")}>
                            {calcDrivingPressure(pacienteAtual.respiratory.plateau, pacienteAtual.respiratory.peep)}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] font-bold opacity-70 block">FiO2 (%)</label>
                          <input type="number" className="w-full bg-black border border-gray-800 rounded p-2 text-sm" value={pacienteAtual.respiratory.fio2} onChange={e => updatePatientData('respiratory', 'fio2', parseInt(e.target.value))} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold opacity-70 block">PaO2</label>
                          <input type="number" className="w-full bg-black border border-gray-800 rounded p-2 text-sm" value={pacienteAtual.respiratory.pao2} onChange={e => updatePatientData('respiratory', 'pao2', parseInt(e.target.value))} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold opacity-70 block">MAP Vent</label>
                          <input type="number" className="w-full bg-black border border-gray-800 rounded p-2 text-sm" value={pacienteAtual.respiratory.map_vent} onChange={e => updatePatientData('respiratory', 'map_vent', parseInt(e.target.value))} />
                        </div>
                      </div>
                      <div className="p-2 bg-black/40 rounded border border-gray-800">
                        <span className="text-[10px] font-bold opacity-70 block">Índice de Oxigenação (IO)</span>
                        <span className={cn("text-lg font-bold", parseFloat(calcOI(pacienteAtual.respiratory.map_vent, pacienteAtual.respiratory.fio2, pacienteAtual.respiratory.pao2)) > 4 ? "text-red-500" : "text-green-500")}>
                          {calcOI(pacienteAtual.respiratory.map_vent, pacienteAtual.respiratory.fio2, pacienteAtual.respiratory.pao2)}
                        </span>
                      </div>
                    </div>
                  </section>

                  {/* Módulo Metabólico/Renal */}
                  <section className="bg-[var(--container-bg)] p-4 rounded-xl border border-cyan-500/30">
                    <h3 className="text-lg font-bold text-cyan-400 mb-4 flex items-center gap-2">
                      <Droplets size={20} /> Metabólico/Renal
                    </h3>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold opacity-70 block">Diurese (ml/kg/h)</label>
                          <input type="number" step="0.1" className={cn("w-full bg-black border border-gray-800 rounded p-2 text-sm", pacienteAtual.renal.diurese < (pacienteAtual.idadeMeses >= 144 ? 0.5 : 1.0) && "border-red-500 text-red-500")} value={pacienteAtual.renal.diurese} onChange={e => updatePatientData('renal', 'diurese', parseFloat(e.target.value))} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold opacity-70 block">KDIGO</label>
                          <select className="w-full bg-black border border-gray-800 rounded p-2 text-sm" value={pacienteAtual.renal.kdigo} onChange={e => updatePatientData('renal', 'kdigo', e.target.value)}>
                            <option>Estágio 0</option>
                            <option>Estágio 1</option>
                            <option>Estágio 2</option>
                            <option>Estágio 3</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold opacity-70 block">BH 24h (ml)</label>
                          <input type="number" className="w-full bg-black border border-gray-800 rounded p-2 text-sm" value={pacienteAtual.renal.bh24} onChange={e => updatePatientData('renal', 'bh24', parseInt(e.target.value))} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold opacity-70 block">BH Acumulado (ml)</label>
                          <input type="number" className="w-full bg-black border border-gray-800 rounded p-2 text-sm" value={pacienteAtual.renal.bhAcumulado} onChange={e => updatePatientData('renal', 'bhAcumulado', parseInt(e.target.value))} />
                        </div>
                      </div>
                      <div className="p-2 bg-black/40 rounded border border-gray-800">
                        <span className="text-[10px] font-bold opacity-70 block">Sobrecarga Hídrica (%)</span>
                        <span className={cn("text-lg font-bold", parseFloat(calcFluidOverload(pacienteAtual.renal.bhAcumulado, pacienteAtual.pesoAdmissao)) > 10 ? "text-red-500" : "text-green-500")}>
                          {calcFluidOverload(pacienteAtual.renal.bhAcumulado, pacienteAtual.pesoAdmissao)}%
                        </span>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold opacity-70 block">Eletrólitos / Notas</label>
                        <textarea 
                          className="w-full bg-black border border-gray-800 rounded p-2 text-xs h-16 outline-none focus:border-cyan-500"
                          placeholder="Na, K, Cl, Cr, Ureia..."
                          value={pacienteAtual.evolucao.renal}
                          onChange={e => updatePatientData('evolucao', 'renal', e.target.value)}
                        />
                      </div>
                    </div>
                  </section>

                  {/* Módulo Neuropediátrico */}
                  <section className="bg-[var(--container-bg)] p-4 rounded-xl border border-blue-500/30">
                    <h3 className="text-lg font-bold text-blue-400 mb-4 flex items-center gap-2">
                      <Brain size={20} /> Neuropediátrico
                    </h3>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold opacity-70 block">Glasgow P.</label>
                          <input type="number" className="w-full bg-black border border-gray-800 rounded p-2 text-sm" value={pacienteAtual.neuro.glasgow} onChange={e => updatePatientData('neuro', 'glasgow', parseInt(e.target.value))} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold opacity-70 block">FOUR</label>
                          <input type="number" className="w-full bg-black border border-gray-800 rounded p-2 text-sm" value={pacienteAtual.neuro.four} onChange={e => updatePatientData('neuro', 'four', parseInt(e.target.value))} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold opacity-70 block">RASS</label>
                          <input type="number" className="w-full bg-black border border-gray-800 rounded p-2 text-sm" value={pacienteAtual.neuro.rass} onChange={e => updatePatientData('neuro', 'rass', parseInt(e.target.value))} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold opacity-70 block">SBS</label>
                          <input type="number" className="w-full bg-black border border-gray-800 rounded p-2 text-sm" value={pacienteAtual.neuro.sbs} onChange={e => updatePatientData('neuro', 'sbs', parseInt(e.target.value))} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold opacity-70 block">FLACC</label>
                          <input type="number" className="w-full bg-black border border-gray-800 rounded p-2 text-sm" value={pacienteAtual.neuro.flacc} onChange={e => updatePatientData('neuro', 'flacc', parseInt(e.target.value))} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold opacity-70 block">CAPD (Delirium)</label>
                          <input type="number" className={cn("w-full bg-black border border-gray-800 rounded p-2 text-sm", pacienteAtual.neuro.capd >= 9 && "border-yellow-500 text-yellow-500")} value={pacienteAtual.neuro.capd} onChange={e => updatePatientData('neuro', 'capd', parseInt(e.target.value))} />
                          {pacienteAtual.neuro.capd >= 9 && <span className="text-[8px] text-yellow-500 font-bold">Rastreio Positivo</span>}
                        </div>
                      </div>
                      <div className="p-2 bg-yellow-500/10 rounded border border-yellow-500/30">
                        <span className="text-[10px] font-bold text-yellow-500 flex items-center gap-1">
                          <AlertTriangle size={10} /> Lembrete CAPD
                        </span>
                        <p className="text-[9px] text-yellow-400">Coletar CAPD ao menos uma vez por turno (Protocolo Delirium).</p>
                      </div>
                    </div>
                  </section>

                  {/* Módulo de Gravidade */}
                  <section className="bg-[var(--container-bg)] p-4 rounded-xl border border-purple-500/30">
                    <h3 className="text-lg font-bold text-purple-400 mb-4 flex items-center gap-2">
                      <ShieldAlert size={20} /> Gravidade
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-bold opacity-70 block">pSOFA</label>
                        <input type="number" className="w-full bg-black border border-gray-800 rounded p-2 text-sm" value={pacienteAtual.severity.psofa} onChange={e => updatePatientData('severity', 'psofa', parseInt(e.target.value))} />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold opacity-70 block">PELOD-2</label>
                        <input type="number" className="w-full bg-black border border-gray-800 rounded p-2 text-sm" value={pacienteAtual.severity.pelod2} onChange={e => updatePatientData('severity', 'pelod2', parseInt(e.target.value))} />
                      </div>
                    </div>
                  </section>
                </div>
              </motion.div>
            )}

            {activeView === 'trends' && pacienteAtual && (
              <motion.div 
                key="trends"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-8"
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Chart pSOFA */}
                  <div className="bg-[var(--container-bg)] p-6 rounded-2xl border border-purple-500/20 shadow-2xl">
                    <h3 className="text-lg font-bold text-purple-400 mb-6 flex items-center gap-2">
                      <TrendingUp size={20} /> Evolução pSOFA (48h)
                    </h3>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={pacienteAtual.trends.psofa}>
                          <defs>
                            <linearGradient id="colorPsofa" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                          <XAxis dataKey="time" stroke="#666" fontSize={10} />
                          <YAxis stroke="#666" fontSize={10} />
                          <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #333' }} />
                          <Area type="monotone" dataKey="value" stroke="#a855f7" fillOpacity={1} fill="url(#colorPsofa)" strokeWidth={3} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Chart Lactato */}
                  <div className="bg-[var(--container-bg)] p-6 rounded-2xl border border-pink-500/20 shadow-2xl">
                    <h3 className="text-lg font-bold text-pink-400 mb-6 flex items-center gap-2">
                      <TrendingUp size={20} /> Tendência de Lactato
                    </h3>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={pacienteAtual.trends.lactate}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                          <XAxis dataKey="time" stroke="#666" fontSize={10} />
                          <YAxis stroke="#666" fontSize={10} />
                          <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #333' }} />
                          <Line type="monotone" dataKey="value" stroke="#ec4899" strokeWidth={3} dot={{ fill: '#ec4899', r: 4 }} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Chart Fluid Overload */}
                  <div className="bg-[var(--container-bg)] p-6 rounded-2xl border border-cyan-500/20 shadow-2xl lg:col-span-2">
                    <h3 className="text-lg font-bold text-cyan-400 mb-6 flex items-center gap-2">
                      <Droplets size={20} /> Sobrecarga Hídrica Acumulada (%)
                    </h3>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={pacienteAtual.trends.fluidOverload}>
                          <defs>
                            <linearGradient id="colorFluid" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                          <XAxis dataKey="time" stroke="#666" fontSize={10} />
                          <YAxis stroke="#666" fontSize={10} />
                          <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #333' }} />
                          <Area type="stepAfter" dataKey="value" stroke="#06b6d4" fillOpacity={1} fill="url(#colorFluid)" strokeWidth={3} />
                          <Legend verticalAlign="top" height={36}/>
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
            {activeView === 'evolucao' && pacienteAtual && (
              <motion.div 
                key="evolucao"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="bg-[var(--border-color)] p-4 rounded-lg flex flex-wrap gap-4 justify-between items-center text-sm">
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-[var(--primary)]">{pacienteAtual.nome}</span>
                    <span className="opacity-60">Leito: {pacienteAtual.leito}</span>
                    <span className="opacity-60">Peso: {pacienteAtual.peso}kg</span>
                  </div>
                  <div className="relative">
                    <button 
                      onClick={() => setShowResetConfirm(!showResetConfirm)}
                      className="flex items-center gap-2 bg-[var(--danger)] text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:opacity-90 transition-all shadow-sm"
                    >
                      <RotateCcw size={14} />
                      Zerar Evolução
                    </button>

                    {showResetConfirm && (
                      <div className="absolute top-full right-0 mt-2 w-64 bg-[var(--container-bg)] border border-[var(--danger)] p-4 rounded-xl shadow-2xl z-50 animate-in fade-in slide-in-from-top-2">
                        <p className="text-xs font-bold mb-3">Confirmar limpeza total dos campos?</p>
                        <div className="flex gap-2">
                          <button 
                            onClick={zerarEvolucao}
                            className="flex-1 bg-[var(--danger)] text-white py-1.5 rounded-lg text-[10px] font-bold"
                          >
                            Sim, Zerar
                          </button>
                          <button 
                            onClick={() => setShowResetConfirm(false)}
                            className="flex-1 bg-gray-700 text-white py-1.5 rounded-lg text-[10px] font-bold"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <section className="bg-[var(--container-bg)] p-4 rounded-xl border border-[var(--border-color)]">
                      <h3 className="text-lg font-bold text-[var(--secondary)] mb-4 flex items-center gap-2 border-l-4 border-[var(--secondary)] pl-2">
                        # Sinopse e História
                      </h3>
                      <textarea 
                        className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg p-3 min-h-[100px] outline-none"
                        value={pacienteAtual.evolucao.sinopse || ''}
                        onChange={e => updateEvolucao('sinopse', e.target.value)}
                        placeholder="História atual, cirurgias, intercorrências..."
                      />
                    </section>

                    <section className="bg-[var(--container-bg)] p-4 rounded-xl border border-[var(--border-color)] space-y-6">
                      <h3 className="text-lg font-bold text-[var(--primary)] mb-4 flex items-center gap-2">
                        <Stethoscope size={20} /> Exame por Sistemas
                      </h3>
                      
                      {[
                        { id: 'neuro', label: 'a. Neurológico', icon: Zap, placeholder: 'Sedação, pupilas, Glasgow/RASS...' },
                        { id: 'hemo', label: 'b. Hemodinâmico', icon: Activity, placeholder: 'DVA, perfusão, pulsos...' },
                        { id: 'resp', label: 'c. Respiratório', icon: Wind, placeholder: 'Parâmetros VM, ausculta...' },
                        { id: 'gastro', label: 'd. Gastro/Metabólico', icon: Droplets, placeholder: 'Dieta, abdome, resíduo...' },
                        { id: 'renal', label: 'e. Renal/Hidro', icon: Thermometer, placeholder: 'BH, diurese, edema...' },
                        { id: 'hemato', label: 'f. Hematológico', icon: AlertTriangle, placeholder: 'Sangramentos, labs...' },
                        { id: 'infec', label: 'g. Infeccioso', icon: Stethoscope, placeholder: 'Febre, ATB, culturas...' },
                      ].map(sys => (
                        <div key={sys.id} className="space-y-2">
                          <div className="flex justify-between items-center">
                            <label className="text-xs font-bold opacity-70 flex items-center gap-1">
                              <sys.icon size={12} /> {sys.label}
                            </label>
                            <select 
                              className="bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--primary)] text-[10px] rounded px-1 outline-none max-w-[150px]"
                              onChange={e => {
                                if (!e.target.value) return;
                                const current = pacienteAtual.evolucao[sys.id] || "";
                                updateEvolucao(sys.id, current + (current ? " " : "") + e.target.value);
                                e.target.selectedIndex = 0;
                              }}
                            >
                              <option value="">Frases...</option>
                              {SYSTEM_PHRASES[sys.id]?.map((phrase, idx) => (
                                <option key={idx} value={phrase}>{phrase.substring(0, 30)}...</option>
                              ))}
                            </select>
                          </div>
                          <textarea 
                            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg p-2 text-sm outline-none"
                            value={pacienteAtual.evolucao[sys.id] || ''}
                            onChange={e => updateEvolucao(sys.id, e.target.value)}
                            placeholder={sys.placeholder}
                          />
                        </div>
                      ))}
                    </section>

                    <section className="bg-[var(--container-bg)] p-4 rounded-xl border border-[var(--border-color)]">
                      <h3 className="text-lg font-bold text-[var(--warning)] mb-4">Lista de Problemas Ativos</h3>
                      <div className="mb-4">
                        <select 
                          className="w-full bg-[var(--input-bg)] border border-[var(--primary)] text-[var(--primary)] rounded-lg p-2 text-xs outline-none"
                          onChange={e => {
                            if (!e.target.value) return;
                            const current = pacienteAtual.evolucao.problemas || "";
                            updateEvolucao('problemas', current + (current ? "\n" : "") + e.target.value);
                            e.target.selectedIndex = 0;
                          }}
                        >
                          <option value="">+ Adicionar Problema e Protocolo</option>
                          {Object.entries(PROBLEMS_BY_SYSTEM).map(([sys, items]) => (
                            <optgroup key={sys} label={sys}>
                              {items.map((item, idx) => (
                                <option key={idx} value={`P. ${item.label}`}>
                                  {item.label}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                      <textarea 
                        className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg p-3 min-h-[150px] outline-none font-mono text-sm"
                        value={pacienteAtual.evolucao.problemas || ''}
                        onChange={e => updateEvolucao('problemas', e.target.value)}
                        placeholder="P1. Diagnóstico Principal..."
                      />
                    </section>
                  </div>

                  <div className="space-y-6">
                    <section className="bg-[var(--container-bg)] p-4 rounded-xl border border-[var(--border-color)] sticky top-4">
                      <h3 className="text-lg font-bold text-[var(--primary)] mb-4 flex items-center gap-2">
                        <Save size={20} /> Condutas e Macros
                      </h3>
                      <p className="text-[10px] opacity-60 mb-4">Selecione as condutas aplicadas para incluir na evolução automática.</p>
                      
                      <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                        {Object.entries(PROBLEMS_BY_SYSTEM).map(([sys, items]) => {
                          const config = MODULE_COLORS[sys] || { border: "border-gray-700", active: "bg-gray-600", text: "text-gray-400", bg: "bg-gray-800/20" };
                          return (
                            <div key={sys} className={`p-3 rounded-xl border ${config.border} ${config.bg} space-y-3`}>
                              <h4 className={`text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 ${config.text}`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${config.active}`}></div>
                                {sys}
                              </h4>
                              <div className="grid grid-cols-1 gap-2">
                                {items.map((item, idx) => {
                                  const isActive = (pacienteAtual.evolucao.botoesAtivos || []).includes(item.label);
                                  return (
                                    <button
                                      key={idx}
                                      onClick={() => toggleMacro(item.label)}
                                      className={`text-left p-2.5 rounded-lg text-[11px] transition-all border ${
                                        isActive 
                                          ? `${config.active} text-white border-transparent font-bold shadow-md scale-[1.02]` 
                                          : `bg-black/40 text-gray-400 ${config.border} hover:border-white/30 hover:bg-black/60`
                                      }`}
                                    >
                                      <div className="flex items-start gap-2">
                                        {isActive ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <ChevronRight size={14} className="mt-0.5 shrink-0 opacity-50" />}
                                        <span className="leading-tight">{item.label}</span>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-8 pt-6 border-t border-gray-700 space-y-4">
                        <button 
                          onClick={() => {
                            const text = gerarEvolucaoTexto();
                            updateEvolucao('output', text);
                          }}
                          className="w-full bg-[var(--primary)] text-black font-bold py-3 rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2"
                        >
                          <Activity size={20} /> Gerar Texto da Evolução
                        </button>
                        
                        {pacienteAtual.evolucao.output && (
                          <div className="space-y-2">
                            <textarea 
                              className="w-full bg-black text-[var(--primary)] font-mono text-xs p-4 rounded-lg min-h-[300px] border border-gray-800 focus:border-[var(--primary)] outline-none"
                              value={pacienteAtual.evolucao.output}
                              onChange={(e) => updateEvolucao('output', e.target.value)}
                            />
                            <button 
                              onClick={() => copyToClipboard(pacienteAtual.evolucao.output)}
                              className="w-full bg-[var(--secondary)] text-white font-bold py-2 rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-2"
                            >
                              <Copy size={18} /> Copiar para Prontuário
                            </button>
                          </div>
                        )}
                      </div>
                    </section>
                  </div>
                </div>
              </motion.div>
            )}

            {activeView === 'prescricao' && pacienteAtual && (
              <motion.div 
                key="prescricao"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="grid grid-cols-1 lg:grid-cols-2 gap-8"
              >
                <div className="space-y-6">
                  {/* Modelos de Prescrição por Categoria */}
                  <section className="bg-[var(--container-bg)] p-6 rounded-xl border border-[var(--border-color)] shadow-xl">
                    <h3 className="text-lg font-bold text-[var(--primary)] mb-4 flex items-center gap-2">
                      <ClipboardList size={20} /> Modelos de Prescrição
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {PRESCRIPTION_CATEGORIES.map((cat, idx) => (
                        <div key={idx}>
                          <label className="text-[10px] font-bold opacity-70 mb-1 block truncate" title={cat.name}>
                            {cat.name}
                          </label>
                          <select 
                            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg p-2 text-xs outline-none focus:border-[var(--primary)]"
                            value=""
                            onChange={(e) => {
                              const val = e.target.value;
                              if (!val) return;
                              setPacientes(prev => prev.map(p => {
                                if (p.id === pacienteAtual.id) {
                                  const current = p.prescricaoTexto || "";
                                  const header = current.trim() === "" ? "Prescrição Médica - CTI Pediátrico\n\n" : "";
                                  const separator = (current && !current.endsWith('\n')) ? "\n" : "";
                                  return { ...p, prescricaoTexto: header + current + separator + val };
                                }
                                return p;
                              }));
                            }}
                          >
                            <option value="" disabled>Selecionar...</option>
                            {cat.items.map((item, i) => (
                              <option key={i} value={item}>
                                {item.length > 60 ? item.substring(0, 60) + "..." : item}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="bg-[var(--container-bg)] p-6 rounded-xl border-l-4 border-[var(--dav-color)] shadow-xl">
                    <h3 className="text-lg font-bold text-[var(--dav-color)] mb-4 flex items-center gap-2">
                      <AlertTriangle size={20} /> Drogas de Alta Vigilância (DAV)
                    </h3>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold opacity-70 mb-1 block text-red-400">1. Categoria de Risco (DAV)</label>
                          <select 
                            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg p-2 text-xs outline-none focus:border-[var(--dav-color)]"
                            value={selectedDavCategory}
                            onChange={(e) => {
                              setSelectedDavCategory(e.target.value);
                              const descEl = document.getElementById('dav-category-desc');
                              if (descEl) descEl.innerHTML = '';
                              const drugSel = document.getElementById('bomba-selector') as HTMLSelectElement;
                              if (drugSel) drugSel.value = "";
                            }}
                          >
                            <option value="">Selecione a Categoria...</option>
                            {DAV_CATEGORIES.map((cat) => (
                              <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-xs font-bold opacity-70 mb-1 block">2. Medicamento</label>
                          <select 
                            id="bomba-selector" 
                            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg p-2 text-xs outline-none focus:border-[var(--dav-color)] disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={!selectedDavCategory}
                            onChange={(e) => {
                              const val = e.target.value;
                              const descEl = document.getElementById('dav-category-desc');
                              if (val && descEl) {
                                const drug = INFUSIONS[val as keyof typeof INFUSIONS];
                                const cat = DAV_CATEGORIES.find(c => c.id === drug.category);
                                if (cat) {
                                  descEl.innerHTML = `<div class="p-3 bg-red-900/20 border border-red-900/40 rounded-lg mt-2">
                                    <p class="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-1">${cat.name}</p>
                                    <p class="text-[11px] text-gray-300 leading-relaxed">${cat.description}</p>
                                    <p class="text-[10px] text-gray-500 mt-2 italic">Ex: ${cat.examples}</p>
                                  </div>`;
                                }
                              } else if (descEl) {
                                descEl.innerHTML = '';
                              }
                            }}
                          >
                            <option value="">Selecione o Medicamento...</option>
                            {selectedDavCategory && Object.entries(INFUSIONS)
                              .filter(([_, inf]) => inf.category === selectedDavCategory)
                              .map(([id, inf]) => (
                                <option key={id} value={id}>{inf.nome} ({inf.unidadeDose})</option>
                              ))
                            }
                          </select>
                        </div>
                      </div>

                      <div id="dav-category-desc"></div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold opacity-70 mb-1 block">Dose Alvo</label>
                          <input id="bomba-dose" type="number" step="0.01" className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg p-2 text-xs outline-none focus:border-[var(--dav-color)]" placeholder="0.0" />
                        </div>
                        <div className="flex items-end">
                          <button 
                            className="w-full bg-[var(--dav-color)] text-white font-bold py-3 rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg"
                            onClick={() => {
                              const sel = document.getElementById('bomba-selector') as HTMLSelectElement;
                              const doseInput = document.getElementById('bomba-dose') as HTMLInputElement;
                              const key = sel.value;
                              const dose = parseFloat(doseInput.value);
                              if (!key || isNaN(dose) || !pacienteAtual) return;
                              const d = INFUSIONS[key as keyof typeof INFUSIONS];
                              let vazao = 0;
                              if (d.unidadeDose === "mcg/kg/min") vazao = (dose * pacienteAtual.peso * 60) / (d.concMgMl * 1000);
                              else if (d.unidadeDose === "mcg/kg/h") vazao = (dose * pacienteAtual.peso) / (d.concMgMl * 1000);
                              else if (d.unidadeDose === "mg/kg/h") vazao = (dose * pacienteAtual.peso) / d.concMgMl;
                              else if (d.unidadeDose === "U/kg/h") vazao = (dose * pacienteAtual.peso) / d.concMgMl;
                              else if (d.unidadeDose === "mEq/kg/h") vazao = (dose * pacienteAtual.peso) / d.concMgMl;
                              else if (d.unidadeDose === "mL/kg/h") vazao = dose * pacienteAtual.peso;
                              
                              const text = `BIC: ${d.nome} | Dose: ${dose} ${d.unidadeDose}\n   Solução: ${d.formula}\n   VAZÃO: ${vazao.toFixed(1)} mL/h\n`;
                              setPacientes(prev => prev.map(p => {
                                if (p.id === pacienteAtualId) {
                                  const current = p.prescricaoTexto || "";
                                  const header = current.trim() === "" ? "Prescrição Médica - CTI Pediátrico\n\n" : "";
                                  const separator = (current && !current.endsWith('\n')) ? "\n" : "";
                                  return { ...p, prescricaoTexto: header + current + separator + text };
                                }
                                return p;
                              }));
                              if (pacienteAtualId) registrarLog(pacienteAtualId, `Adicionada infusão de ${d.nome}`);
                              doseInput.value = "";
                            }}
                          >
                            <Activity size={18} /> Calcular e Adicionar à Prescrição
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
                <section className="bg-[var(--container-bg)] p-6 rounded-xl border border-[var(--border-color)]">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-[var(--primary)]">Prescrição Final</h3>
                    <button onClick={() => setPacientes(prev => prev.map(p => p.id === pacienteAtualId ? { ...p, prescricaoTexto: "" } : p))} className="text-[var(--danger)] text-xs font-bold hover:underline">Limpar</button>
                  </div>
                  <textarea 
                    className="w-full bg-black text-[var(--primary)] font-mono text-sm p-4 rounded-lg min-h-[500px] border border-gray-800 outline-none"
                    value={pacienteAtual.prescricaoTexto || ""}
                    onChange={e => setPacientes(prev => prev.map(p => p.id === pacienteAtualId ? { ...p, prescricaoTexto: e.target.value } : p))}
                    placeholder="As infusões e medicamentos aparecerão aqui..."
                  />
                  <div className="mt-4 flex gap-2">
                    <button onClick={() => copyToClipboard(pacienteAtual.prescricaoTexto)} className="flex-1 bg-[var(--primary)] text-black font-bold py-2 rounded-lg flex items-center justify-center gap-2"><Copy size={18} /> Copiar</button>
                  </div>
                </section>
              </motion.div>
            )}

            {activeView === 'rounds' && pacienteAtual && (
              <motion.div 
                key="rounds"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <section className="bg-[var(--container-bg)] p-6 rounded-xl border border-[var(--border-color)]">
                  <h3 className="text-lg font-bold text-[var(--primary)] mb-6">Dispositivos e Invasões</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { id: 'cvc', label: 'CVC (Acesso Central)', placeholder: 'Ex: VJID 15/03' },
                      { id: 'tot', label: 'TOT / TQT (Via Aérea)', placeholder: 'Ex: TOT 5.0 (17/03)' },
                      { id: 'svd', label: 'SVD (Vesical)', placeholder: 'Ex: SVD (12/03)' },
                      { id: 'sng', label: 'SNG / SNE (Sonda)', placeholder: 'Ex: SNG (12/03)' },
                    ].map(dev => (
                      <div key={dev.id}>
                        <label className="text-xs font-bold opacity-70 mb-1 block">{dev.label}</label>
                        <input 
                          className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg p-2 outline-none"
                          value={pacienteAtual.rounds[dev.id] || ''}
                          onChange={e => setPacientes(prev => prev.map(p => p.id === pacienteAtualId ? { ...p, rounds: { ...p.rounds, [dev.id]: e.target.value } } : p))}
                          placeholder={dev.placeholder}
                        />
                      </div>
                    ))}
                  </div>
                </section>

                <section className="bg-[var(--container-bg)] p-6 rounded-xl border border-[var(--border-color)]">
                  <h3 className="text-lg font-bold text-[var(--secondary)] mb-6">FAST-HUG (Checklist Diário)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { id: 'f', label: 'Feeding (Nutrição avaliada)' },
                      { id: 'a', label: 'Analgesia (Dor avaliada)' },
                      { id: 's', label: 'Sedation (Meta atingida/despertar)' },
                      { id: 't', label: 'Thromboembolic prophylaxis' },
                      { id: 'h', label: 'Head of bed (Cabeceira 30-45º)' },
                      { id: 'u', label: 'Ulcer prophylaxis' },
                      { id: 'g', label: 'Glucose control' },
                    ].map(item => (
                      <label key={item.id} className="flex items-center gap-3 p-3 bg-gray-800/30 rounded-lg cursor-pointer hover:bg-gray-800/50 transition-all">
                        <input 
                          type="checkbox"
                          className="w-5 h-5 accent-[var(--secondary)]"
                          checked={pacienteAtual.rounds[item.id] || false}
                          onChange={e => setPacientes(prev => prev.map(p => p.id === pacienteAtualId ? { ...p, rounds: { ...p.rounds, [item.id]: e.target.checked } } : p))}
                        />
                        <span className="text-sm font-semibold">
                          <span className="text-[var(--secondary)] font-black mr-1">{item.id.toUpperCase()}</span>
                          {item.label.substring(1)}
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Global Confirmation Modals */}
        <AnimatePresence>
          {patientToDeleteId !== null && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-[var(--container-bg)] border-2 border-[var(--danger)] p-6 rounded-2xl max-w-sm w-full shadow-2xl"
              >
                <div className="flex items-center gap-3 text-[var(--danger)] mb-4">
                  <Trash2 size={24} />
                  <h3 className="text-xl font-bold">Confirmar Alta?</h3>
                </div>
                <p className="text-sm opacity-80 mb-6">
                  Deseja confirmar a alta, óbito ou transferência do paciente <strong>{pacientes.find(p => p.id === patientToDeleteId)?.nome}</strong>?
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setPatientToDeleteId(null)}
                    className="flex-1 py-2 rounded-lg bg-[var(--card-hover)] font-bold hover:bg-[var(--border-color)] transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={confirmarAlta}
                    className="flex-1 py-2 rounded-lg bg-[var(--danger)] text-white font-bold hover:opacity-90 transition-all shadow-lg"
                  >
                    Confirmar
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
