import { GoogleGenAI } from "@google/genai";
import { Invoice } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function auditInvoice(invoice: Invoice): Promise<{ score: number; feedback: string }> {
  try {
    const prompt = `
      Você é um auditor fiscal especialista no sistema SILOMS. 
      Analise a seguinte nota fiscal e verifique se há inconsistências.
      
      Dados da Nota:
      - Número: ${invoice.numero}
      - Fornecedor: ${invoice.fornecedor} (CNPJ: ${invoice.cnpj})
      - Valor: ${invoice.valor}
      - Contrato: ${invoice.contrato}
      - Comentários Prévios: ${invoice.historico_comentarios.join("; ")}

      Responda EXATAMENTE no formato JSON:
      {
        "score": (número de 0 a 100, onde 100 é perfeito),
        "feedback": "Breve análise técnica em português"
      }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    const text = response.text || "{}";
    
    // Clean potential markdown code blocks
    const cleanJson = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error("Gemini Audit Error:", error);
    return {
      score: 0,
      feedback: "Falha na comunicação com a IA de auditoria."
    };
  }
}
