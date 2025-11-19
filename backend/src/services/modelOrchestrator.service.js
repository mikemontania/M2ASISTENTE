// services/modelOrchestrator.service.js
// Planner (phi4) + heurístico fallback + ejecución simple de workflow (coder -> verifier)

const { chatWithOllama } = require('./ia.service');
const socketService = require('./socket.service');

const heuristicChoose = (text) => {
  const t = (text || '').toLowerCase();
  if (t.includes('logo') || t.includes('imagen') || t.includes('png') || t.includes('svg')) return { selectedModel: 'llava:7b', reason: 'imagen', workflow: ['coder'] };
  if (t.includes('error') || t.includes('stack') || t.includes('trace') || t.includes('debug')) return { selectedModel: 'qwen2.5-coder:7b', reason: 'debug', workflow: ['coder', 'verifier'] };
  if (t.includes('express') || t.includes('sequelize') || t.includes('factur') || t.includes('invoice') || t.includes('database')) return { selectedModel: 'qwen2.5-coder:7b', reason: 'backend', workflow: ['planner','coder','verifier'] };
  if (t.includes('resumen') || t.includes('sumarizar')) return { selectedModel: 'llama3.2:latest', reason: 'summary', workflow: ['coder'] };
  return { selectedModel: 'qwen2.5:7b', reason: 'general', workflow: ['coder'] };
};

const chooseModelForMessages = async (mensajes) => {
  const last = mensajes.slice(-1)[0];
  const prompt = [
    { rol: 'system', contenido: 'Eres un planner. Responde SOLO un JSON con campos: selectedModel, reason, workflow (array). Ejemplo: {\"selectedModel\":\"qwen2.5-coder:7b\",\"reason\":\"backend\",\"workflow\":[\"planner\",\"coder\",\"verifier\"]}' },
    { rol: 'user', contenido: `Analiza este mensaje y decide el mejor modelo y workflow: \n\n${last ? last.contenido : ''}` }
  ];

  try {
    const resp = await chatWithOllama({ mensajes: prompt, model: 'phi4:latest', stream: false, timeoutMs: 20000 });
    const txt = resp.content || '';
    const jsonMatch = txt.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.selectedModel) return parsed;
      } catch (e) {
        // parse error -> fallback
      }
    }
    return heuristicChoose(last ? last.contenido : '');
  } catch (e) {
    return heuristicChoose(last ? last.contenido : '');
  }
};

/**
 * executeWorkflow
 * - mensajes: prompt completo (incluyendo context + adjuntos)
 * - plan: el JSON devuelto por chooseModelForMessages o heurístico
 * - socketId: para debug emits
 *
 * Devuelve: { finalOutput, results: [ {step, model, response} ], plan }
 */
const executeWorkflow = async ({ mensajes, plan, socketId = null }) => {
  const results = [];
  let finalOutput = '';

  // coder step
  if (plan.workflow && plan.workflow.includes('coder')) {
    const coderModel = plan.coderModel || plan.selectedModel;
    const coderResp = await chatWithOllama({ mensajes, model: coderModel, stream: false, socketId });
    results.push({ step: 'coder', model: coderModel, response: coderResp });
    finalOutput = coderResp.content || '';

    // verifier step
    if (plan.workflow.includes('verifier')) {
      const verifyPrompt = [
        { rol: 'system', contenido: 'Eres un verificador. Revisa el siguiente output y responde con un verdict y, si hay errores, propon una corrección.' },
        { rol: 'user', contenido: finalOutput }
      ];
      const verifierModel = plan.verifierModel || 'deepseek-r1:7b';
      const verifyResp = await chatWithOllama({ mensajes: verifyPrompt, model: verifierModel, stream: false, socketId });
      results.push({ step: 'verifier', model: verifierModel, response: verifyResp });
      finalOutput = `${finalOutput}\n\n[VERIFIER]\n${verifyResp.content || ''}`;
    }
  } else {
    // single-call fallback
    const singleResp = await chatWithOllama({ mensajes, model: plan.selectedModel, stream: false, socketId });
    results.push({ step: 'single', model: plan.selectedModel, response: singleResp });
    finalOutput = singleResp.content || '';
  }

  // Emitir resumen por socket si DEBUG activo
  if (socketId && process.env.DEBUG_CHAT === 'true') {
    try {
      socketService.emitToSocket(socketId, 'model_orch_results', {
        plan,
        results: results.map(r => ({ step: r.step, model: r.model, contentPreview: (r.response.content || '').slice(0, 800) }))
      });
    } catch (e) {
      console.warn('emit model_orch_results failed', e.message);
    }
  }

  return { finalOutput, results, plan };
};

module.exports = { chooseModelForMessages, executeWorkflow };
