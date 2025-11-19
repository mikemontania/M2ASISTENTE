// services/modelOrchestrator.service.js
// ORQUESTADOR INTELIGENTE (Multi-pass adaptativo) v2
// Reemplaza completamente tu fichero anterior por este.

const { chatWithOllama } = require('./ia.service');
const socketService = require('./socket.service');
const crypto = require('crypto');

// ============================================
// CAPACIDADES DE MODELOS (CRÍTICO)
// ============================================
const MODEL_CAPABILITIES = {
  'phi4:latest': {
    timeout: 30000,
    purpose: 'planning',
    maxTokens: 512,
    supportsImages: false,
    supportsCode: true,
    supportsReasoning: true,
    speed: 'fast'
  },
  'llama3.2:latest': {
    timeout: 45000,
    purpose: 'fast-general',
    maxTokens: 2048,
    supportsImages: false,
    supportsCode: true,
    supportsReasoning: true,
    speed: 'fast'
  },
  'qwen2.5:7b': {
    timeout: 90000,
    purpose: 'general',
    maxTokens: 4096,
    supportsImages: false,
    supportsCode: true,
    supportsReasoning: true,
    speed: 'medium'
  },
  'qwen2.5-coder:7b': {
    timeout: 120000,
    purpose: 'code-generation',
    maxTokens: 8192,
    supportsImages: false,
    supportsCode: true,
    supportsReasoning: true,
    speed: 'medium'
  },
  'deepseek-coder:6.7b': {
    timeout: 100000,
    purpose: 'code-optimization',
    maxTokens: 8192,
    supportsImages: false,
    supportsCode: true,
    supportsReasoning: true,
    speed: 'medium'
  },
  'deepseek-r1:7b': {
    timeout: 150000,
    purpose: 'reasoning-verification',
    maxTokens: 4096,
    supportsImages: false,
    supportsCode: true,
    supportsReasoning: true,
    speed: 'slow'
  },
  'llava:7b': {
    timeout: 120000,
    purpose: 'vision',
    maxTokens: 2048,
    supportsImages: true,
    supportsCode: false,
    supportsReasoning: false,
    speed: 'medium'
  },
  'bge-large:latest': {
    timeout: 20000,
    purpose: 'embeddings',
    maxTokens: 512,
    supportsImages: false,
    supportsCode: false,
    supportsReasoning: false,
    speed: 'fast'
  }
};

const MODEL_CONFIG = MODEL_CAPABILITIES;

// ============================================
// CACHE
// ============================================
const responseCache = new Map();
const CACHE_TTL = 3600000;
const MAX_CACHE_SIZE = 100;

const getCacheKey = (mensajes, model) => {
  const content = JSON.stringify(mensajes.slice(-4)) + model;
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
// VALIDACIÓN DE CAPACIDADES
// ============================================
const validateModelCapabilities = (model, requirements) => {
  const capabilities = MODEL_CAPABILITIES[model];
  if (!capabilities) {
    console.warn(`[VALIDATION] Modelo desconocido: ${model}`);
    return false;
  }

  const issues = [];
  if (requirements.needsImages && !capabilities.supportsImages) issues.push('no soporta imágenes');
  if (requirements.needsCode && !capabilities.supportsCode) issues.push('no soporta generación de código');
  if (requirements.needsReasoning && !capabilities.supportsReasoning) issues.push('no soporta razonamiento profundo');

  if (issues.length > 0) {
    console.warn(`[VALIDATION] ${model} tiene limitaciones: ${issues.join(', ')}`);
    return false;
  }

  return true;
};

// ============================================
// HEURÍSTICAS Y DETECTORES UTILES
// ============================================
const shouldRunCoderAfterVision = (text) => {
  if (!text) return false;
  return /\b(function|const|async|class|import|export|return|if|else|for|while|def|var|let|```|json|script)\b/i.test(text)
    || /\b(tabla|columna|fila|csv|excel|valores|dataframe)\b/i.test(text);
};

const shouldRunReasoningAfterVision = (text) => {
  if (!text) return false;
  return /\b(analiza|explica|por qué|deduce|compara|evalúa|concluye|razon)\b/i.test(text);
};

const visionSaysAmbiguous = (text) => {
  if (!text) return false;
  return /\b(no estoy seguro|no puedo ver bien|poca resolución|imposible determinar|no es claro|no puedo leer)\b/i.test(text);
};

const visionContainsTableLike = (text) => {
  if (!text) return false;
  return /\b(col|fila|tabla||nro|cantidad|total|subtotal|precio|cantidad)\b/i.test(text) && /[:;\|\t]/.test(text);
};

// ============================================
// ANALISIS DE REQUERIMIENTOS (mejorado)
// ============================================
const analyzeRequirements = (mensajes) => {
  const requirements = {
    needsImages: false,
    needsCode: false,
    needsOptimization: false,
    needsReasoning: false,
    needsFastResponse: false
  };

  requirements.needsImages = mensajes.some(m => m.attachmentImages && m.attachmentImages.length > 0);
  const fullContext = mensajes.map(m => m.contenido).join(' ').toLowerCase();

  const patterns = {
    code: /\b(function|const|async|class|import|export|return|if|else|for|while|def|var|let)\b/g,
    optimization: /\b(optimiz|performance|speed|cache|memory|eficien|mejora|rápid)\b/g,
    reasoning: /\b(analiza|razona|piensa|explica|por qué|compara|evalúa|considera|concluye)\b/g,
    fastQuery: /\b(rápid|breve|corto|simple|hola|gracias|ok)\b/g
  };

  const codeMatches = (fullContext.match(patterns.code) || []).length;
  const optimizationMatches = (fullContext.match(patterns.optimization) || []).length;
  const reasoningMatches = (fullContext.match(patterns.reasoning) || []).length;
  const fastMatches = (fullContext.match(patterns.fastQuery) || []).length;

  requirements.needsCode = codeMatches >= 2;
  requirements.needsOptimization = optimizationMatches >= 1;
  requirements.needsReasoning = reasoningMatches >= 1;
  requirements.needsFastResponse = fastMatches >= 1 && fullContext.length < 200;

  console.log('[REQUIREMENTS] Análisis:', {
    needsImages: requirements.needsImages,
    needsCode: requirements.needsCode,
    needsOptimization: requirements.needsOptimization,
    needsReasoning: requirements.needsReasoning,
    codeMatches,
    optimizationMatches,
    reasoningMatches
  });

  return requirements;
};

// ============================================
// SELECTOR (mejorado)
// ============================================
const findBestModelForRequirements = (requirements) => {
  // Si necesita imágenes, el flujo incluirá visión primero, pero el "bestModel" se usa como coder inicial si corresponde.
  if (requirements.needsImages) {
    return 'llava:7b';
  }

  if (requirements.needsOptimization && requirements.needsCode) return 'deepseek-coder:6.7b';
  if (requirements.needsReasoning && !requirements.needsCode) return 'deepseek-r1:7b';
  if (requirements.needsCode) return 'qwen2.5-coder:7b';
  if (requirements.needsFastResponse) return 'llama3.2:latest';
  return 'qwen2.5:7b';
};

// ============================================
// EJECUTOR CON RETRY Y FALLBACK (igual que antes, con pequeño ajuste)
// ============================================
const executeWithRetry = async (mensajes, model, socketId, hasImages, maxRetries = 2) => {
  const capabilities = MODEL_CAPABILITIES[model];

  if (hasImages && !capabilities?.supportsImages) {
    console.warn(`[EXECUTOR] ${model} NO soporta imágenes, cambiando a llava:7b`);
    model = 'llava:7b';
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[EXECUTOR] Intento ${attempt}/${maxRetries} con ${model}`);
      const response = await chatWithOllama({
        mensajes,
        model,
        stream: false,
        socketId,
        timeoutMs: MODEL_CAPABILITIES[model]?.timeout || 90000,
        hasImages
      });

      if (!response.content || response.content.trim().length === 0) throw new Error('Respuesta vacía del modelo');

      // Detectar patrones de incapacidad ante imágenes
      const errorPatterns = [
        /no puedo ver.*imágenes/i,
        /no tengo.*capacidad.*analizar imágenes/i,
        /soy un modelo.*texto/i,
        /cannot process images/i
      ];

      const hasErrorPattern = errorPatterns.some(pattern => pattern.test(response.content));
      if (hasErrorPattern && hasImages && model !== 'llava:7b') {
        console.warn(`[EXECUTOR] ${model} indica que no puede procesar imágenes; reintentando con llava:7b`);
        model = 'llava:7b';
        continue;
      }

      return { response, model, attempt };
    } catch (error) {
      console.error(`[EXECUTOR] Error en intento ${attempt} con ${model}:`, error.message);
      if (attempt === maxRetries) throw error;
      if (hasImages && model !== 'llava:7b') {
        console.log('[EXECUTOR] Fallback a llava:7b por error...');
        model = 'llava:7b';
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }

  throw new Error('Todos los intentos fallaron');
};

// ============================================
// NUEVO: EJECUCIÓN ADAPTATIVA LUEGO DE VISIÓN
// ============================================
const runVisionThenAdaptive = async ({ mensajes, socketId, hasImages }) => {
  // 1) Ejecutar llava con el prompt + imágenes (pasamos mensajes completos; ia.service maneja images)
  const visionRespObj = await executeWithRetry(mensajes, 'llava:7b', socketId, true, 2);
  const visionText = visionRespObj.response.content || '';
  const results = [{
    step: 'vision',
    model: visionRespObj.model,
    response: visionRespObj.response,
    duration: 0,
    attempts: visionRespObj.attempt
  }];

  // heurísticas sobre la salida de visión
  const needsCoder = shouldRunCoderAfterVision(visionText);
  const needsReasoning = shouldRunReasoningAfterVision(visionText);
  const ambiguous = visionSaysAmbiguous(visionText) || visionContainsTableLike(visionText);

  // Si ambiguous, generamos un prompt para clarificar/extracto de tabla
  let combinedOutput = visionText;

  // 2) Si visión sugiere que necesita estructuración/codigo -> llamar coder
  if (needsCoder || ambiguous) {
    // construir prompt para coder: incluir salida de visión y el último user message si existe
    const coderPrompt = [
      { rol: 'system', contenido: 'Eres un asistente especializado en generar código y transformar salidas de análisis visual en estructuras útiles (JSON, CSV, scripts, etc.).' },
      { rol: 'user', contenido: `Salida del modelo de visión (analiza y transforma según la petición original):\n\n${visionText}\n\nTarea: si la salida contiene una tabla o datos, extraelos en formato JSON/CSV. Si el usuario pidió código, genera el script necesario. Si hace falta más contexto, intenta inferirlo y marca lo que falta.` }
    ];

    const coderRespObj = await executeWithRetry(coderPrompt, 'qwen2.5-coder:7b', socketId, false, 2);
    combinedOutput = `${combinedOutput}\n\n--- CODER ---\n${coderRespObj.response.content || ''}`;
    results.push({
      step: 'coder',
      model: coderRespObj.model,
      response: coderRespObj.response,
      duration: 0,
      attempts: coderRespObj.attempt
    });
  }

  // 3) Si necesita razonamiento/verificacion -> llamar verifier
  if (needsReasoning) {
    const verifyPrompt = [
      { rol: 'system', contenido: 'Eres un verificador experto. Revisa la respuesta previa y corrige errores, completando la información faltante.' },
      { rol: 'user', contenido: `Verifica esta salida (proveerás correcciones o dudas claras):\n\n${combinedOutput}` }
    ];

    const verifierModel = 'deepseek-r1:7b';
    const verifyRespObj = await executeWithRetry(verifyPrompt, verifierModel, socketId, false, 2);
    combinedOutput = `${combinedOutput}\n\n--- VERIFICACIÓN ---\n${verifyRespObj.response.content || ''}`;
    results.push({
      step: 'verifier',
      model: verifyRespObj.model,
      response: verifyRespObj.response,
      duration: 0,
      attempts: verifyRespObj.attempt
    });
  }

  return { combinedOutput, results };
};

// ============================================
// EJECUTAR WORKFLOW (mejorado y compatible)
// ============================================
const executeWorkflow = async ({ mensajes, plan, socketId = null, hasImages = false }) => {
  const startTime = Date.now();
  const results = [];
  let finalOutput = '';

  const metrics = {
    plannerTime: plan.plannerTime || 0,
    coderTime: 0,
    verifierTime: 0,
    visionTime: 0,
    totalTime: 0,
    modelCalls: 0,
    retries: 0,
    cacheHits: 0,
    tokensEstimated: 0
  };

  hasImages = hasImages || !!plan.requirements?.needsImages;

  // Cache guard: no cache for image flows (mantener seguridad)
  const workflowCacheKey = getCacheKey(mensajes, plan.selectedModel + (plan.workflow||[]).join('-'));
  const cachedWorkflow = getCached(workflowCacheKey);
  if (cachedWorkflow && !hasImages) {
    metrics.cacheHits = 1;
    metrics.totalTime = Date.now() - startTime;
    if (socketId) socketService.emitToSocket(socketId, 'performance_metrics', { ...metrics, fromCache: true });
    return cachedWorkflow;
  }

  // Si el plan sugiere visión (o detectamos imágenes), usamos el flow vision->adaptive
  if (hasImages) {
    console.log('[WORKFLOW] Ejecutando flujo vision->adaptive');
    const visionStart = Date.now();
    const visionResult = await runVisionThenAdaptive({ mensajes, socketId, hasImages: true });
    const visionDuration = Date.now() - visionStart;

    // push results devueltos
    visionResult.results.forEach(r => results.push({
      step: r.step,
      model: r.model,
      response: r.response,
      duration: r.duration || visionDuration,
      attempts: r.attempts || 1
    }));

    finalOutput = visionResult.combinedOutput || '';
    metrics.visionTime = visionDuration;
    metrics.modelCalls += visionResult.results.length;
  } else {
    // Flow clásico: coder (selectedModel) -> verifier si aplica
    const coderStart = Date.now();
    const coderModel = plan.selectedModel;
    console.log('[WORKFLOW] Ejecutando coder clásico:', coderModel);

    const { response: coderResp, model: finalCoderModel, attempt: coderAttempts } =
      await executeWithRetry(mensajes, coderModel, socketId, false);

    const coderDuration = Date.now() - coderStart;
    results.push({
      step: 'coder',
      model: finalCoderModel,
      response: coderResp,
      duration: coderDuration,
      attempts: coderAttempts
    });

    finalOutput = coderResp.content || '';
    metrics.coderTime = coderDuration;
    metrics.modelCalls++;
    metrics.retries += (coderAttempts - 1);

    if (plan.workflow.includes('verifier') && !hasImages) {
      const verifyStart = Date.now();
      const verifierModel = plan.verifierModel || 'deepseek-r1:7b';
      const verifyPrompt = [
        { rol: 'system', contenido: 'Eres un verificador experto. Analiza y proporciona feedback constructivo. Si encuentras errores, sugiere correcciones específicas.' },
        { rol: 'user', contenido: `Verifica lo siguiente:\n\n${finalOutput}` }
      ];
      const { response: verifyResp, attempt: verifyAttempts } =
        await executeWithRetry(verifyPrompt, verifierModel, socketId, false);

      const verifyDuration = Date.now() - verifyStart;
      results.push({
        step: 'verifier',
        model: verifierModel,
        response: verifyResp,
        duration: verifyDuration,
        attempts: verifyAttempts
      });

      finalOutput = `${finalOutput}\n\n--- VERIFICACIÓN ---\n${verifyResp.content || ''}`;
      metrics.verifierTime = verifyDuration;
      metrics.modelCalls++;
      metrics.retries += (verifyAttempts - 1);
    }
  }

  metrics.totalTime = Date.now() - startTime;
  metrics.tokensEstimated = Math.floor((finalOutput || '').length / 4);

  const workflowResult = {
    finalOutput,
    results,
    plan,
    metrics,
    actualModelsUsed: results.map(r => r.model)
  };

  if (!hasImages) setCache(workflowCacheKey, workflowResult);

  if (socketId) {
    try {
      socketService.emitToSocket(socketId, 'performance_metrics', metrics);
      socketService.emitToSocket(socketId, 'model_orch_results', {
        plan,
        actualModels: results.map(r => ({ step: r.step, model: r.model, attempts: r.attempts })),
        results: results.map(r => ({
          step: r.step,
          model: r.model,
          duration: r.duration,
          attempts: r.attempts,
          contentPreview: (r.response.content || '').slice(0, 500)
        }))
      });
    } catch (e) {
      console.warn('[WORKFLOW] Socket emit failed:', e.message);
    }
  }

  console.log('[WORKFLOW] ✅ Completado:', {
    totalTime: `${metrics.totalTime}ms`,
    modelCalls: metrics.modelCalls,
    retries: metrics.retries,
    modelsUsed: results.map(r => r.model).join(' → ')
  });

  return workflowResult;
};

// ============================================
// PLANNER (mejorado, pero compatible con chooseModelForMessages previo)
// ============================================
const chooseModelForMessages = async (mensajes, hasImages = false) => {
  const startTime = Date.now();

  const requirements = analyzeRequirements(mensajes);
  if (hasImages) requirements.needsImages = true;

  // prioridad: si hay imágenes, el plan incluirá visión
  if (requirements.needsImages) {
    const plan = {
      selectedModel: 'llava:7b',
      reason: 'image-analysis-required',
      workflow: ['vision', 'adaptive'],
      verifierModel: requirements.needsCode ? 'qwen2.5-coder:7b' : 'deepseek-r1:7b',
      requirements,
      plannerTime: Date.now() - startTime
    };
    setCache(getCacheKey(mensajes, 'planner-v2'), plan);
    return plan;
  }

  // si no hay imágenes, comportamiento clásico
  const cacheKey = getCacheKey(mensajes, 'planner-v2');
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const bestModel = findBestModelForRequirements(requirements);
  const isValid = validateModelCapabilities(bestModel, requirements);
  if (!isValid) {
    console.warn(`[PLANNER] Modelo ${bestModel} no cumple requisitos, buscando alternativa...`);
    // fallback genérico
    const fallback = {
      selectedModel: 'qwen2.5:7b',
      reason: 'fallback',
      workflow: ['coder'],
      verifierModel: 'deepseek-r1:7b',
      requirements,
      plannerTime: Date.now() - startTime
    };
    setCache(cacheKey, fallback);
    return fallback;
  }

  let workflow = ['coder'];
  let verifierModel = null;
  if (requirements.needsOptimization || requirements.needsReasoning) {
    workflow = ['coder', 'verifier'];
    verifierModel = requirements.needsCode ? 'qwen2.5-coder:7b' : 'deepseek-r1:7b';
  }

  const plan = {
    selectedModel: bestModel,
    reason: 'requirements-based-selection',
    workflow,
    verifierModel,
    requirements,
    plannerTime: Date.now() - startTime
  };

  setCache(cacheKey, plan);
  return plan;
};

// ============================================
// LIMPIEZA
// ============================================
const clearExpiredCache = () => {
  const now = Date.now();
  for (const [key, value] of responseCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) responseCache.delete(key);
  }
};
setInterval(clearExpiredCache, 600000);

module.exports = {
  chooseModelForMessages,
  executeWorkflow,
  clearExpiredCache,
  MODEL_CONFIG,
  MODEL_CAPABILITIES,
  validateModelCapabilities,
  findBestModelForRequirements
};
