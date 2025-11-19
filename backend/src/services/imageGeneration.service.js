// services/imageGeneration.service.js
// OPCIONAL: Integración con APIs de generación de imágenes

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// ============================================
// OPCIÓN 1: Stable Diffusion Local (Automatic1111)
// ============================================
const generateImageLocal = async ({ prompt, width = 512, height = 512 }) => {
  const SD_URL = process.env.STABLE_DIFFUSION_URL || 'http://127.0.0.1:7860';
  
  try {
    const response = await fetch(`${SD_URL}/sdapi/v1/txt2img`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        negative_prompt: 'blurry, low quality, distorted',
        width,
        height,
        steps: 20,
        cfg_scale: 7,
        sampler_name: 'Euler a'
      })
    });
    
    const data = await response.json();
    const imageBase64 = data.images[0];
    
    // Guardar imagen
    const filename = `generated_${Date.now()}.png`;
    const filepath = path.join(process.env.UPLOADS_DIR || './uploads', filename);
    
    const buffer = Buffer.from(imageBase64, 'base64');
    fs.writeFileSync(filepath, buffer);
    
    return {
      success: true,
      filepath,
      url: `/uploads/${filename}`,
      prompt
    };
  } catch (error) {
    console.error('[IMAGE_GEN] Error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
};

// ============================================
// OPCIÓN 2: OpenAI DALL-E API
// ============================================
const generateImageDALLE = async ({ prompt }) => {
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  
  if (!OPENAI_KEY) {
    throw new Error('OPENAI_API_KEY no configurada');
  }
  
  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard'
      })
    });
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message);
    }
    
    return {
      success: true,
      url: data.data[0].url,
      prompt
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

// ============================================
// OPCIÓN 3: Replicate API (Stable Diffusion, Flux, etc.)
// ============================================
const generateImageReplicate = async ({ prompt, model = 'stability-ai/sdxl' }) => {
  const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;
  
  if (!REPLICATE_TOKEN) {
    throw new Error('REPLICATE_API_TOKEN no configurada');
  }
  
  try {
    // Iniciar predicción
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${REPLICATE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: 'model-version-hash', // Debes obtener esto de Replicate
        input: {
          prompt,
          width: 1024,
          height: 1024
        }
      })
    });
    
    const prediction = await response.json();
    
    // Esperar resultado (polling)
    let result = prediction;
    while (result.status !== 'succeeded' && result.status !== 'failed') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const checkResponse = await fetch(
        `https://api.replicate.com/v1/predictions/${result.id}`,
        {
          headers: { 'Authorization': `Token ${REPLICATE_TOKEN}` }
        }
      );
      result = await checkResponse.json();
    }
    
    if (result.status === 'failed') {
      throw new Error(result.error);
    }
    
    return {
      success: true,
      url: result.output[0],
      prompt
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

// ============================================
// FUNCIÓN PRINCIPAL: Auto-detecta servicio disponible
// ============================================
const generateImage = async ({ prompt, width, height }) => {
  // Prioridad: Local > Replicate > DALL-E
  
  if (process.env.STABLE_DIFFUSION_URL) {
    console.log('[IMAGE_GEN] Usando Stable Diffusion local...');
    return await generateImageLocal({ prompt, width, height });
  }
  
  if (process.env.REPLICATE_API_TOKEN) {
    console.log('[IMAGE_GEN] Usando Replicate API...');
    return await generateImageReplicate({ prompt });
  }
  
  if (process.env.OPENAI_API_KEY) {
    console.log('[IMAGE_GEN] Usando DALL-E...');
    return await generateImageDALLE({ prompt });
  }
  
  return {
    success: false,
    error: 'No hay servicio de generación de imágenes configurado'
  };
};

module.exports = {
  generateImage,
  generateImageLocal,
  generateImageDALLE,
  generateImageReplicate
};