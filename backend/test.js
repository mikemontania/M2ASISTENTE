// test.js
const { execSync } = require("child_process");

const MODELS = [
  { name: "phi4:latest", prompt: "Describe en una frase qué puedes hacer." },
  { name: "llama3.2:latest", prompt: "Dime algo útil sobre programación." },
  { name: "qwen2.5:7b", prompt: "Resume en una frase para qué es bueno este modelo." },
  { name: "qwen2.5-coder:7b", prompt: "Escribe una función JS que sume dos números." },
  { name: "deepseek-coder:6.7b", prompt: "Optimiza este código: for(let i=0;i<1000;i++){ console.log(i); }" },
  { name: "deepseek-r1:7b", prompt: "Explícame por qué el cielo parece azul." },
  {
    name: "llava:7b",
    prompt: "¿Qué ves en esta imagen?",
    image: "D:/AI/M2Uploads/a0b4c94e-9709-4c83-b260-b64ee2b62a66.png"
  },
  { name: "bge-large:latest", prompt: "Genera un embedding para el texto: 'Hola mundo'." }
];

function runModel(model) {
  try {
    let cmd;

    if (model.image) {
      const payload = JSON.stringify({
        prompt: model.prompt,
        images: [model.image]
      });

      cmd = `ollama run ${model.name} -p '${payload}'`;
    } else {
      cmd = `ollama run ${model.name} "${model.prompt}"`;
    }

    console.log("\n=====================================");
    console.log(`Probando modelo: ${model.name}`);
    console.log("=====================================");

    const output = execSync(cmd, { encoding: "utf8" });
    console.log(output);
  } catch (err) {
    console.error(`Error ejecutando ${model.name}:`, err.message);
  }
}

(async () => {
  console.log("=== TEST DE MODELOS OLLAMA ===");

  for (const m of MODELS) {
    runModel(m);
  }

  console.log("\n=== FIN DEL TEST ===");
})();
