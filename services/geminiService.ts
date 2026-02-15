import { GoogleGenAI } from "@google/genai";
import { SoilLayer, FoundationData, AnalysisResult, CalibrationRecord, Language, ChatMessage } from "../types";
import { runFullAnalysis, CalculationOutput } from "./calculationEngine";



// Helper to get AI instance safely
const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key is missing");
  return new GoogleGenAI({ apiKey });
};



/**
 * On-Demand AI enhancement
 */
export const enhanceReportWithAI = async (
  currentResult: AnalysisResult,
  layers: SoilLayer[],
  foundation: FoundationData,
  lang: Language
): Promise<{ doctorReport: string; recommendations: any; designNotes: string }> => {
  // Re-run deterministic part to get CalculationOutput structure required by AI
  // (Alternatively, we could pass CalculationOutput if we stored it, but it's fast to re-calc)
  const calcResult = runFullAnalysis(layers, foundation);

  return await generateAIReport(calcResult, layers, foundation, lang);
};

/**
 * Ask Gemini AI to generate ONLY the textual report, recommendations, and design notes.
 * All numerical values are already computed deterministically.
 */
async function generateAIReport(
  calcResult: CalculationOutput,
  layers: SoilLayer[],
  foundation: FoundationData,
  lang: Language
): Promise<{ doctorReport: string; recommendations: { solutions: string[]; riskLevel: string }; designNotes: string }> {
  const model = "gemini-2.5-flash";
  const ai = getAIClient();

  const langInstruction = lang === 'ar'
    ? "Write ALL text strictly in ARABIC."
    : "Write ALL text strictly in ENGLISH.";


  const prompt = `
    Role: You are an Expert Geotechnical Report Writer.

    The following analysis has been computed using standard engineering equations (Vesic, Schmertmann, Terzaghi, ACI 318, Boussinesq).

    INPUT DATA:
    Foundation: ${JSON.stringify(foundation)}
    Soil Layers: ${JSON.stringify(layers.map(l => ({ type: l.type, depth: l.depthFrom + '-' + l.depthTo + 'm', sptN: l.sptN })))}

    COMPUTED RESULTS:
    - Bearing Capacity: q_ult = ${calcResult.bearingCapacity.q_ult} kPa, q_allow = ${calcResult.bearingCapacity.q_allow} kPa, FOS = ${calcResult.bearingCapacity.factorOfSafety}
    - Settlement: Total = ${calcResult.settlement.total} mm (Elastic: ${calcResult.settlement.elastic}, Primary: ${calcResult.settlement.primary}, Secondary: ${calcResult.settlement.secondary}), Status: ${calcResult.settlement.status}
    - Time to Max Settlement: ${calcResult.settlement.timeToMaxSettlement}
    - Foundation Design: Thickness = ${calcResult.foundationDesign.minThickness} m, As = ${calcResult.foundationDesign.reinforcementArea} mm²/m, Punching: ${calcResult.foundationDesign.punchingShearCheck}
    ${calcResult.slopeStability ? `- Slope Stability: FOS = ${calcResult.slopeStability.factorOfSafety}, Status: ${calcResult.slopeStability.status}` : ''}

    TASKS:
    1. Write "doctorReport": A professional geotechnical report (markdown format) interpreting these results. Include sections: Introduction, Soil Profile, Bearing Capacity Analysis, Settlement Analysis, Structural Design, and Conclusions. Reference the computed numbers.
    2. Write "recommendations": An object with:
       - "solutions": Array of 3-5 engineering solution strings relevant to the results
       - "riskLevel": "Low", "Medium", or "High" based on the FOS and settlement values
    3. Write "designNotes": A brief paragraph explaining the structural design rationale

    ${langInstruction}

    Return ONLY valid JSON with keys: doctorReport, recommendations, designNotes.
  `;

  // Create a timeout promise (8 seconds)
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("AI generation timed out")), 8000)
  );

  const generationPromise = ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    },
  });

  // Race AI against timeout
  const response = await Promise.race([generationPromise, timeoutPromise]) as any;

  if (!response.text) {
    throw new Error("AI returned empty response");
  }

  let jsonString = response.text.trim();
  if (jsonString.startsWith('```json')) {
    jsonString = jsonString.replace(/^```json/, '').replace(/```$/, '');
  } else if (jsonString.startsWith('```')) {
    jsonString = jsonString.replace(/^```/, '').replace(/```$/, '');
  }

  return JSON.parse(jsonString);
}

export const askGeoExpert = async (
  history: ChatMessage[],
  currentContext: AnalysisResult,
  lang: Language
): Promise<string> => {
  try {
    const ai = getAIClient();
    const model = "gemini-2.5-flash";

    const systemInstruction = lang === 'ar'
      ? "You are a specialized geotechnical engineering assistant. Use the provided analysis results to answer user questions clearly in Arabic. Be professional and academic."
      : "You are a specialized geotechnical engineering assistant. Use the provided analysis results to answer user questions clearly in English. Be professional and academic.";


    const contextStr = JSON.stringify({
      summary: {
        settlement: currentContext.settlement,
        bearingCapacity: currentContext.bearingCapacity,
        slope: currentContext.slopeStability,
        design: currentContext.foundationDesign
      },
      soil: currentContext.layers
    });

    const prompt = `
    Context (Analysis Results): ${contextStr}

    User Chat History:
    ${history.map(h => `${h.role}: ${h.text}`).join('\n')}

    Instruction: Provide a helpful, concise answer to the last user query based on the Context.
  `;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        systemInstruction: systemInstruction
      }
    });

    return response.text || (lang === 'ar' ? "عذراً، لم أستطع توليد إجابة." : "Sorry, I could not generate an answer.");
  } catch (error) {
    console.error("AI Chat Error:", error);
    return lang === 'ar'
      ? "عذراً، الخدمة غير متوفرة حالياً (مفتاح API مفقود أو خطأ في الاتصال)."
      : "Sorry, service unavailable (Missing API Key or Connection Error).";
  }
};