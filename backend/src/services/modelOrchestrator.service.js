// services/modelOrchestrator.service.js
// OPTIMIZADO: Usa TODOS los modelos instalados + cache + métricas + paralelización

const { chatWithOllama } = require('./ia.service');
const socketService = require('./socket.service');
const crypto = require('crypto');

// ============================================
// CACHE EN MEMORIA (para respuestas repetidas)
// ============================================
const responseCache = new Map();
const CACHE_TTL = 3600000; // 1 hora en ms
const MAX_CACHE_SIZE = 100;

const getCacheKey = (mensajes, model) => {
  const content = JSON.stringify(mensajes.slice(-3)) + model; // últimos 3 mensajes
  return crypto.createHash('md5').update(content).digest('hex');
};

const getCached = (key) => {
  const cached = responseCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    responseCache.delete(key);
    return null;
  }
  return cached.data;
};

const setCache = (key, data) => {
  if (responseCache.size >= MAX_CACHE_SIZE) {
    const firstKey = responseCache.keys().next().value;
    responseCache.delete(firstKey);
  }
  responseCache.set(key, { data, timestamp: Date.now() });
};

// ============================================
// CONFIGURACIÓN DE MODELOS
// ============================================
const MODEL_CONFIG = {
  'phi4:latest': { 
    timeout: 30000, 
    purpose: 'planning',
    maxTokens: 512 
  },
  'llama3.2:latest': { 
    timeout: 45000, 
    purpose: 'fast-general',
    maxTokens: 2048 
  },
  'qwen2.5:7b': { 
    timeout: 90000, 
    purpose: 'general',
    maxTokens: 4096 
  },
  'qwen2.5-coder:7b': { 
    timeout: 120000, 
    purpose: 'code-generation',
    maxTokens: 8192 
  },
  'deepseek-coder:6.7b': { 
    timeout: 100000, 
    purpose: 'code-optimization',
    maxTokens: 8192 
  },
  'deepseek-r1:7b': { 
    timeout: 150000, 
    purpose: 'reasoning-verification',
    maxTokens: 4096 
  },
  'llava:7b': { 
    timeout: 90000, 
    purpose: 'vision',
    maxTokens: 2048 
  },
  'bge-large:latest': { 
    timeout: 20000, 
    purpose: 'embeddings',
    maxTokens: 512 
  }
};

// ============================================
// HEURÍSTICO MEJORADO (usa conteo de patrones)
// ============================================
const heuristicChoose = (mensajes) => {
  const lastMsg = mensajes.slice(-1)[0]?.contenido || '';
  const fullContext = mensajes.map(m => m.contenido).join(' ').toLowerCase();
  
  // Patrones de detección expandidos
  const patterns = {
    code: /\b(function|const|async|class|import|export|return|if|else|for|while)\b/g,
    backend: /\b(express|sequelize|database|sql|api|rest|endpoint|controller|service|model)\b/g,
    frontend: /\b(react|vue|angular|component|jsx|tsx|css|html|dom|state)\b/g,
    debug: /\b(error|bug|fix|stack|trace|exception|crash|fail)\b/g,
    optimization: /\b(optimiz|performance|speed|cache|memory|eficien)\b/g,
    visual: /\b(imagen|logo|svg|png|jpg|css|style|color|diseño)\b/g,
    reasoning: /\b(analiza|razona|piensa|explica|por qué|compara|evalúa)\b/g,
    summary: /\b(resumen|resumir|sumariza|sintetiza|extracto)\b/g,
    refactor: /\b(refactor|reestructura|mejora|limpia|reorganiza)\b/g
  };
  
  // Contar ocurrencias
  const scores = {};
  for (const [key, regex] of Object.entries(patterns)) {
    const matches = fullContext.match(regex);
    scores[key] = matches ? matches.length : 0;
  }
  
  // Logging para debug
  if (process.env.DEBUG_CHAT === 'true') {
    console.log('[HEURISTIC] Scores:', scores);
  }
  
  // Decisión por prioridad y puntaje
  const maxScore = Math.max(...Object.values(scores));
  
  // CASO 1: Optimización de código existente
  if (scores.optimization >= 2 || (scores.code > 3 && scores.optimization > 0)) {
    return {
      selectedModel: 'deepseek-coder:6.7b',
      reason: 'code-optimization',
      workflow: ['coder', 'verifier'],
      verifierModel: 'qwen2.5-coder:7b'
    };
  }
  
  // CASO 2: Razonamiento profundo
  if (scores.reasoning === maxScore && scores.reasoning >= 2) {
    return {
      selectedModel: 'deepseek-r1:7b',
      reason: 'deep-reasoning',
      workflow: ['coder']
    };
  }
  
  // CASO 3: Backend complejo
  if (scores.backend >= 2 || (scores.code > 2 && scores.backend > 0)) {
    return {
      selectedModel: 'qwen2.5-coder:7b',
      reason: 'backend-development',
      workflow: ['coder', 'verifier'],
      verifierModel: 'deepseek-r1:7b'
    };
  }
  
  // CASO 4: Frontend
  if (scores.frontend >= 2) {
    return {
      selectedModel: 'qwen2.5-coder:7b',
      reason: 'frontend-development',
      workflow: ['coder']
    };
  }
  
  // CASO 5: Debug/fixing
  if (scores.debug === maxScore && scores.debug >= 2) {
    return {
      selectedModel: 'deepseek-coder:6.7b',
      reason: 'debugging',
      workflow: ['coder', 'verifier'],
      verifierModel: 'deepseek-r1:7b'
    };
  }
  
  // CASO 6: Refactoring
  if (scores.refactor >= 2) {
    return {
      selectedModel: 'deepseek-coder:6.7b',
      reason: 'refactoring',
      workflow: ['coder', 'verifier'],
      verifierModel: 'qwen2.5-coder:7b'
    };
  }
  
  // CASO 7: Contenido visual
  if (scores.visual === maxScore && scores.visual >= 1) {
    return {
      selectedModel: 'llava:7b',
      reason: 'visual-content',
      workflow: ['coder']
    };
  }
  
  // CASO 8: Resumen
  if (scores.summary >= 2) {
    return {
      selectedModel: 'llama3.2:latest',
      reason: 'summarization',
      workflow: ['coder']
    };
  }
  
  // CASO 9: Código general
  if (scores.code >= 3) {
    return {
      selectedModel: 'qwen2.5-coder:7b',
      reason: 'general-coding',
      workflow: ['coder']
    };
  }
  
  // CASO 10: Default rápido para conversación general
  return {
    selectedModel: 'llama3.2:latest',
    reason: 'fast-general',
    workflow: ['coder']
  };
};

// ============================================
// PLANNER CON CACHE
// ============================================
const chooseModelForMessages = async (mensajes) => {
  const last = mensajes.slice(-1)[0];
  const cacheKey = getCacheKey(mensajes, 'planner');
  
  // Intentar cache primero
  const cached = getCached(cacheKey);
  if (cached) {
    console.log('[PLANNER] Cache hit!');
    return cached;
  }
  
  // Prompt mejorado para phi4
  const prompt = [
    { 
      rol: 'system', 
      contenido: `Eres un planner experto. Analiza el contexto y responde SOLO un JSON válido.

Modelos disponibles:
- llama3.2:latest (rápido, conversación general)
- qwen2.5:7b (general, balanceado)
- qwen2.5-coder:7b (código backend/frontend)
- deepseek-coder:6.7b (optimización de código)
- deepseek-r1:7b (razonamiento profundo)
- llava:7b (contenido visual)

Workflows disponibles: ["coder"], ["coder","verifier"], ["parallel-verify"]

Formato JSON:
{
  "selectedModel": "modelo-elegido",
  "reason": "explicación-breve",
  "workflow": ["coder"] o ["coder","verifier"],
  "verifierModel": "modelo-verificador" (opcional)
}`
    },
    { 
      rol: 'user', 
      contenido: `Mensaje a analizar:\n\n${last ? last.contenido : ''}\n\nTotal de mensajes en contexto: ${mensajes.length}` 
    }
  ];
  
  try {
    const resp = await chatWithOllama({ 
      mensajes: prompt, 
      model: 'phi4:latest', 
      stream: false, 
      timeoutMs: MODEL_CONFIG['phi4:latest'].timeout 
    });
    
    const txt = resp.content || '';
    const jsonMatch = txt.match(/\{[\s\S]*?\}/);
    
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.selectedModel && MODEL_CONFIG[parsed.selectedModel]) {
          setCache(cacheKey, parsed);
          return parsed;
        }
      } catch (e) {
        console.warn('[PLANNER] JSON parse error:', e.message);
      }
    }
    
    // Fallback a heurístico
    const heuristic = heuristicChoose(mensajes);
    setCache(cacheKey, heuristic);
    return heuristic;
    
  } catch (e) {
    console.warn('[PLANNER] Error, using heuristic:', e.message);
    const heuristic = heuristicChoose(mensajes);
    setCache(cacheKey, heuristic);
    return heuristic;
  }
};

// ============================================
// WORKFLOW CON MÉTRICAS Y PARALELIZACIÓN
// ============================================
const executeWorkflow = async ({ mensajes, plan, socketId = null }) => {
  const startTime = Date.now();
  const results = [];
  let finalOutput = '';
  
  const metrics = {
    plannerTime: 0,
    coderTime: 0,
    verifierTime: 0,
    totalTime: 0,
    modelCalls: 0,
    cacheHits: 0,
    tokensEstimated: 0
  };
  
  // Verificar cache de respuesta completa
  const workflowCacheKey = getCacheKey(mensajes, plan.selectedModel + plan.workflow.join('-'));
  const cachedWorkflow = getCached(workflowCacheKey);
  
  if (cachedWorkflow) {
    console.log('[WORKFLOW] Cache hit! Returning cached result');
    metrics.cacheHits = 1;
    metrics.totalTime = Date.now() - startTime;
    
    if (socketId) {
      socketService.emitToSocket(socketId, 'performance_metrics', { ...metrics, fromCache: true });
    }
    
    return cachedWorkflow;
  }
  
  // WORKFLOW: PARALLEL VERIFY (coder + verifier en paralelo)
  if (plan.workflow.includes('parallel-verify')) {
    const parallelStart = Date.now();
    
    const [coderResp, verifierResp] = await Promise.all([
      chatWithOllama({ 
        mensajes, 
        model: plan.selectedModel, 
        stream: false, 
        socketId,
        timeoutMs: MODEL_CONFIG[plan.selectedModel]?.timeout 
      }),
      chatWithOllama({ 
        mensajes: [
          ...mensajes,
          { rol: 'system', contenido: 'Actúa como verificador. Identifica posibles mejoras o errores.' }
        ], 
        model: plan.verifierModel || 'deepseek-r1:7b', 
        stream: false,
        timeoutMs: MODEL_CONFIG[plan.verifierModel || 'deepseek-r1:7b']?.timeout
      })
    ]);
    
    const parallelTime = Date.now() - parallelStart;
    
    results.push({ step: 'coder', model: plan.selectedModel, response: coderResp, duration: parallelTime });
    results.push({ step: 'verifier-parallel', model: plan.verifierModel || 'deepseek-r1:7b', response: verifierResp, duration: parallelTime });
    
    finalOutput = `${coderResp.content}\n\n--- VERIFICACIÓN ---\n${verifierResp.content}`;
    metrics.modelCalls = 2;
    metrics.coderTime = parallelTime;
    metrics.verifierTime = parallelTime;
  }
  // WORKFLOW: CODER + VERIFIER (secuencial)
  else if (plan.workflow.includes('coder')) {
    const coderStart = Date.now();
    const coderModel = plan.coderModel || plan.selectedModel;
    
    const coderResp = await chatWithOllama({ 
      mensajes, 
      model: coderModel, 
      stream: false, 
      socketId,
      timeoutMs: MODEL_CONFIG[coderModel]?.timeout 
    });
    
    const coderDuration = Date.now() - coderStart;
    results.push({ step: 'coder', model: coderModel, response: coderResp, duration: coderDuration });
    finalOutput = coderResp.content || '';
    metrics.coderTime = coderDuration;
    metrics.modelCalls++;
    
    // VERIFIER (si está en workflow)
    if (plan.workflow.includes('verifier')) {
      const verifyStart = Date.now();
      const verifyPrompt = [
        { 
          rol: 'system', 
          contenido: 'Eres un verificador experto. Analiza el código/respuesta y proporciona feedback constructivo. Si hay errores, sugiere correcciones específicas.' 
        },
        { rol: 'user', contenido: `Verifica lo siguiente:\n\n${finalOutput}` }
      ];
      
      const verifierModel = plan.verifierModel || 'deepseek-r1:7b';
      const verifyResp = await chatWithOllama({ 
        mensajes: verifyPrompt, 
        model: verifierModel, 
        stream: false, 
        socketId,
        timeoutMs: MODEL_CONFIG[verifierModel]?.timeout 
      });
      
      const verifyDuration = Date.now() - verifyStart;
      results.push({ step: 'verifier', model: verifierModel, response: verifyResp, duration: verifyDuration });
      finalOutput = `${finalOutput}\n\n--- VERIFICACIÓN ---\n${verifyResp.content || ''}`;
      metrics.verifierTime = verifyDuration;
      metrics.modelCalls++;
    }
  }
  // FALLBACK: Single call
  else {
    const singleStart = Date.now();
    const singleResp = await chatWithOllama({ 
      mensajes, 
      model: plan.selectedModel, 
      stream: false, 
      socketId,
      timeoutMs: MODEL_CONFIG[plan.selectedModel]?.timeout 
    });
    
    const singleDuration = Date.now() - singleStart;
    results.push({ step: 'single', model: plan.selectedModel, response: singleResp, duration: singleDuration });
    finalOutput = singleResp.content || '';
    metrics.coderTime = singleDuration;
    metrics.modelCalls = 1;
  }
  
  metrics.totalTime = Date.now() - startTime;
  metrics.tokensEstimated = Math.floor(finalOutput.length / 4); // Aproximación
  
  const workflowResult = { finalOutput, results, plan, metrics };
  
  // Guardar en cache
  setCache(workflowCacheKey, workflowResult);
  
  // Emitir métricas por socket
  if (socketId) {
    try {
      socketService.emitToSocket(socketId, 'performance_metrics', metrics);
      
      if (process.env.DEBUG_CHAT === 'true') {
        socketService.emitToSocket(socketId, 'model_orch_results', {
          plan,
          results: results.map(r => ({ 
            step: r.step, 
            model: r.model, 
            duration: r.duration,
            contentPreview: (r.response.content || '').slice(0, 500) 
          }))
        });
      }
    } catch (e) {
      console.warn('[WORKFLOW] Socket emit failed:', e.message);
    }
  }
  
  // Log de métricas
  console.log('[WORKFLOW] Metrics:', {
    totalTime: `${metrics.totalTime}ms`,
    modelCalls: metrics.modelCalls,
    avgTimePerCall: `${Math.round(metrics.totalTime / metrics.modelCalls)}ms`,
    tokensEstimated: metrics.tokensEstimated
  });
  
  return workflowResult;
};

// ============================================
// FUNCIÓN DE LIMPIEZA DE CACHE (llamar periódicamente)
// ============================================
const clearExpiredCache = () => {
  const now = Date.now();
  for (const [key, value] of responseCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      responseCache.delete(key);
    }
  }
};

// Limpiar cache cada 10 minutos
setInterval(clearExpiredCache, 600000);

module.exports = { 
  chooseModelForMessages, 
  executeWorkflow,
  clearExpiredCache,
  MODEL_CONFIG 
};